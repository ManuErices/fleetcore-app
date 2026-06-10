import React, { useState, useEffect } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { hashPin } from "./documentos/lib/firmas.js";
import { useSearchParams, useNavigate } from "react-router-dom";
import { calculateTotal } from "../lib/plans";

export default function RegisterPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const modulesParam = searchParams.get('modules');
  const landingModules = modulesParam ? modulesParam.split(',') : ['finanzas'];

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: Datos usuario, 2: Datos empresa
  const [error, setError] = useState('');
  const [successType, setSuccessType] = useState(null); // null | 'free' | 'webpay'

  const [formData, setFormData] = useState({
    nombre: '',
    rut: '',
    email: '',
    password: '',
    confirmPassword: '',
    pin: '',
    confirmPin: '',
    empresa: {
      razonSocial: '',
      rut: '',
      direccion: '',
      contacto: '',
      telefono: '',
    },
  });

  useEffect(() => {
    const prevBg = document.body.style.backgroundColor;
    const prevColor = document.body.style.color;
    document.body.style.backgroundColor = '#0A1628';
    document.body.style.color = '#f1f5f9';
    return () => {
      document.body.style.backgroundColor = prevBg;
      document.body.style.color = prevColor;
    };
  }, []);

  const formatRut = (value) => {
    let rut = value.replace(/\./g, '').replace(/-/g, '');
    rut = rut.replace(/[^0-9kK]/g, '');

    if (rut.length > 1) {
      const body = rut.slice(0, -1);
      const dv = rut.slice(-1).toUpperCase();
      let formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      return `${formattedBody}-${dv}`;
    }
    return rut;
  };

  const handleRutChange = (e) => {
    const formatted = formatRut(e.target.value);
    setFormData({ ...formData, rut: formatted });
  };

  const validateRut = (rut) => {
    const cleanRut = rut.replace(/\./g, '').replace(/-/g, '');
    if (cleanRut.length < 2) return false;

    const body = cleanRut.slice(0, -1);
    const dv = cleanRut.slice(-1).toUpperCase();

    let sum = 0;
    let multiplier = 2;

    for (let i = body.length - 1; i >= 0; i--) {
      sum += parseInt(body[i]) * multiplier;
      multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }

    const expectedDv = 11 - (sum % 11);
    const calculatedDv = expectedDv === 11 ? '0' : expectedDv === 10 ? 'K' : expectedDv.toString();

    return dv === calculatedDv;
  };

  const setEmpresa = (field, value) =>
    setFormData(f => ({ ...f, empresa: { ...f.empresa, [field]: value } }));

  const handleNext = (e) => {
    e.preventDefault();
    setError('');
    if (!formData.nombre.trim()) { setError('El nombre es obligatorio'); return; }
    if (!formData.rut.trim()) { setError('El RUT personal es obligatorio'); return; }
    if (!validateRut(formData.rut)) { setError('RUT personal inválido'); return; }
    if (!formData.email.trim()) { setError('El email es obligatorio'); return; }
    if (formData.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    if (formData.password !== formData.confirmPassword) { setError('Las contraseñas no coinciden'); return; }
    if (!formData.pin || formData.pin.length < 4) { setError('El PIN de firma es obligatorio y debe tener 4 dígitos'); return; }
    if (formData.pin !== formData.confirmPin) { setError('Los PINs de firma no coinciden'); return; }
    setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.empresa.razonSocial.trim()) { setError('La razón social es obligatoria'); return; }
    if (!formData.empresa.rut.trim()) { setError('El RUT de empresa es obligatorio'); return; }
    if (!validateRut(formData.empresa.rut)) { setError('RUT de empresa inválido'); return; }
    if (!formData.empresa.direccion.trim()) { setError('La dirección es obligatoria'); return; }
    if (!formData.empresa.contacto.trim()) { setError('El nombre de contacto es obligatorio'); return; }

    setLoading(true);
    try {
      const { email, password, nombre, rut, empresa, pin } = formData;

      // 1. Create auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: nombre });

      // 2. Generate unique empresaId
      const rutLimpio = (empresa.rut || '').replace(/[^0-9kK]/gi, '').toLowerCase();
      const empresaId = `emp-${rutLimpio}-${Date.now().toString(36)}`;

      // 3. Create empresa document
      await setDoc(doc(db, 'empresas', empresaId), {
        nombre: empresa.razonSocial,
        rut: empresa.rut,
        direccion: empresa.direccion,
        contacto: empresa.contacto,
        telefono: empresa.telefono || '',
        adminEmail: email,
        adminNombre: nombre,
        plan: 'trial',
        estado: 'pendiente',
        trialDias: 14,
        creadoEn: serverTimestamp(),
        activadoEn: null,
      });

      const pinHash = await hashPin(pin);

      // 4. Create root user document
      await setDoc(doc(db, 'users', user.uid), {
        email,
        nombre,
        rut,
        empresaId,
        role: 'admin_contrato',
        modulos: landingModules,
        cargo: '',
        pinHash,
        createdAt: serverTimestamp(),
      });

      // 5. Create user subcollection document in company
      await setDoc(doc(db, 'empresas', empresaId, 'users', user.uid), {
        email,
        nombre,
        rut,
        empresaId,
        role: 'admin_contrato',
        modulos: landingModules,
        cargo: '',
        pinHash,
        createdAt: serverTimestamp(),
      });

      // 6. Signatures & documents records
      const u = email.split('@')[0].toLowerCase().trim();
      await setDoc(doc(db, 'pins', u), { hash: pinHash, createdAt: new Date().toISOString() });
      await setDoc(doc(db, 'usuarios', u), {
        username: u,
        nombre: nombre.trim(),
        rut: rut.trim(),
        cargo: '',
        empresa: empresa.razonSocial,
        rol: 'admin',
        pinHash,
        creadoEn: serverTimestamp(),
      });

      // Checkout calculations
      const { totalUf } = calculateTotal(landingModules);

      if (totalUf === 0) {
        // Free module: directly active
        await setDoc(doc(db, 'subscriptions', user.uid), {
          userId: user.uid,
          planId: 'finanzas',
          modules: ['finanzas'],
          gateway: 'free',
          status: 'authorized',
          updatedAt: serverTimestamp(),
        }, { merge: true });

        setSuccessType('free');
        setTimeout(() => {
          navigate('/');
        }, 3000);
      } else {
        // Paid modules checkout: simulated bypass
        const planIdStr = landingModules.sort().join(',');
        await setDoc(doc(db, 'subscriptions', user.uid), {
          userId: user.uid,
          planId: planIdStr,
          modules: landingModules,
          gateway: 'mock_webpay',
          status: 'authorized',
          updatedAt: serverTimestamp(),
        }, { merge: true });

        setSuccessType('webpay');
        setTimeout(() => {
          navigate('/');
        }, 3000);
      }
    } catch (err) {
      console.error("Registration failed:", err);
      let errorMessage = "Error al crear cuenta";
      if (err.code === "auth/email-already-in-use") errorMessage = "Este email ya está registrado";
      else if (err.code === "auth/weak-password") errorMessage = "La contraseña debe tener al menos 6 caracteres";
      else if (err.code === "auth/invalid-email") errorMessage = "Email inválido";
      setError(errorMessage);
      setLoading(false);
    }
  };

  if (successType) {
    return (
      <div className="min-h-screen text-slate-100 font-sans flex flex-col justify-center items-center p-4 relative overflow-hidden" style={{ backgroundColor: '#0A1628' }}>
        {/* Background grid */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '60px 60px', opacity: 0.02 }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none" style={{ backgroundColor: 'rgba(37, 99, 235, 0.08)', filter: 'blur(100px)' }} />

        <div 
          className="w-full max-w-md border rounded-3xl shadow-2xl overflow-hidden relative z-10 p-8 text-center space-y-6 animate-scaleIn"
          style={{ 
            backgroundColor: 'rgba(15, 28, 46, 0.95)', 
            borderColor: 'rgba(255, 255, 255, 0.08)' 
          }}
        >
          {successType === 'free' ? (
            <>
              <div className="w-16 h-16 bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 rounded-full flex items-center justify-center mx-auto animate-bounce">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-white">¡Cuenta Creada!</h2>
              <p className="text-slate-300 text-sm leading-relaxed">
                Tu empresa quedó registrada con éxito. El módulo gratuito de **Finanzas y Contabilidad** ha sido activado para tu cuenta.
              </p>
              <div className="pt-4 flex flex-col items-center gap-2">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-500 font-semibold">Redirigiéndote a tu espacio de trabajo...</span>
              </div>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-blue-500/20 border-2 border-blue-500 text-blue-400 rounded-full flex items-center justify-center mx-auto animate-bounce">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-white">¡Felicidades por tu compra!</h2>
              <p className="text-slate-300 text-sm leading-relaxed font-medium">
                Tu plan modular ha sido activado de manera simulada y exitosa. Disfruta de todos tus nuevos módulos contratados.
              </p>
              <div className="pt-4 flex flex-col items-center gap-2">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-500 font-semibold">Redirigiéndote a tu espacio de trabajo...</span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-slate-100 font-sans flex flex-col justify-center items-center p-4 relative overflow-hidden" style={{ backgroundColor: '#0A1628' }}>
      {/* Background grid */}
      <div 
        className="absolute inset-0 pointer-events-none" 
        style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          opacity: 0.02
        }} 
      />

      {/* Glow highlight */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none" 
        style={{
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          filter: 'blur(100px)'
        }}
      />

      {/* Floating Header logo */}
      <div className="mb-6 flex flex-col items-center gap-2 relative z-10 animate-fadeIn">
        <button 
          onClick={() => navigate('/')} 
          className="flex items-center gap-2.5 text-white/80 hover:text-white transition-all group"
        >
          <img src="/favicon.svg" alt="Logo" className="w-8 h-8 object-contain group-hover:rotate-12 transition-transform" />
          <span className="text-xl font-black tracking-tight">
            Fleet<span className="text-blue-400">Core</span>
          </span>
        </button>
      </div>

      <div 
        className="w-full max-w-md border rounded-3xl shadow-2xl overflow-hidden relative z-10 animate-scaleIn flex flex-col"
        style={{ 
          backgroundColor: 'rgba(15, 28, 46, 0.95)', 
          borderColor: 'rgba(255, 255, 255, 0.08)' 
        }}
      >
        {/* Title Header */}
        <div 
          className="p-5 relative border-b flex items-center gap-3 shrink-0"
          style={{ 
            background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.8) 0%, rgba(29, 78, 216, 0.8) 100%)',
            borderColor: 'rgba(255, 255, 255, 0.08)'
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
          {step === 2 && (
            <button 
              type="button" 
              onClick={() => setStep(1)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10">
            <svg className="w-5 h-5 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <div>
            <h3 className="font-black text-base text-white tracking-tight">Crear Empresa</h3>
            <p className="text-xs text-blue-200 font-semibold">Paso {step} de 2 — {step === 1 ? 'Tu cuenta' : 'Datos de empresa'}</p>
          </div>
        </div>

        {/* Step indicator bar */}
        <div className="flex gap-2 px-6 pt-4 shrink-0">
          <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step >= 1 ? 'bg-blue-500 shadow-sm shadow-blue-500/50' : 'bg-slate-800'}`} />
          <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step >= 2 ? 'bg-blue-500 shadow-sm shadow-blue-500/50' : 'bg-slate-800'}`} />
        </div>

        {/* Form area */}
        <div className="overflow-y-auto max-h-[58dvh] custom-scrollbar p-6">
          {/* STEP 1: USER DATA */}
          {step === 1 && (
            <form onSubmit={handleNext} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Nombre Completo <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={formData.nombre}
                  onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Nombre Apellido" 
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm" 
                  required 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  RUT Personal <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={formData.rut} 
                  onChange={handleRutChange}
                  placeholder="12.345.678-9" 
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm" 
                  maxLength={12} 
                  required 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Email <span className="text-red-500">*</span>
                </label>
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="tu@empresa.cl" 
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm" 
                  required 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Contraseña <span className="text-red-500">*</span>
                </label>
                <input 
                  type="password" 
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Mínimo 6 caracteres" 
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm" 
                  required 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Confirmar Contraseña <span className="text-red-500">*</span>
                </label>
                <input 
                  type="password" 
                  value={formData.confirmPassword}
                  onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="Repita la contraseña" 
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm" 
                  required 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    PIN de Firma (4 dígitos) <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="password" 
                    inputMode="numeric" 
                    maxLength={4} 
                    value={formData.pin}
                    onChange={e => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    placeholder="••••" 
                    className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-center transition-all text-sm" 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Confirmar PIN <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="password" 
                    inputMode="numeric" 
                    maxLength={4} 
                    value={formData.confirmPin}
                    onChange={e => setFormData({ ...formData, confirmPin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    placeholder="••••" 
                    className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-center transition-all text-sm" 
                    required 
                  />
                </div>
              </div>

              {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-center font-bold">{error}</p>}

              <button 
                type="submit"
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 hover:scale-[1.01]"
              >
                Continuar
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </form>
          )}

          {/* STEP 2: COMPANY DATA */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Razón Social <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={formData.empresa.razonSocial}
                  onChange={e => setEmpresa('razonSocial', e.target.value)}
                  placeholder="Constructora Ejemplo SpA" 
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm" 
                  required 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  RUT Empresa <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={formData.empresa.rut}
                  onChange={e => setEmpresa('rut', formatRut(e.target.value))}
                  placeholder="76.543.210-K" 
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm" 
                  maxLength={12} 
                  required 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Dirección <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={formData.empresa.direccion}
                  onChange={e => setEmpresa('direccion', e.target.value)}
                  placeholder="Av. Providencia 1234, Santiago" 
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm" 
                  required 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Nombre de Contacto <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={formData.empresa.contacto}
                  onChange={e => setEmpresa('contacto', e.target.value)}
                  placeholder="Nombre de quien gestiona la cuenta" 
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm" 
                  required 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Teléfono
                </label>
                <input 
                  type="tel" 
                  value={formData.empresa.telefono}
                  onChange={e => setEmpresa('telefono', e.target.value)}
                  placeholder="+56 9 1234 5678" 
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm" 
                />
              </div>

              <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300 font-semibold leading-relaxed">
                🎁 <strong>Finanzas Gratis Incluido</strong>: Se activará tu cuenta con acceso ilimitado al módulo de Finanzas y Contabilidad. El resto de módulos seleccionados se contratarán a continuación.
              </div>

              {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-center font-bold">{error}</p>}

              <button 
                type="submit" 
                disabled={loading}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60 shadow-lg shadow-blue-600/20 hover:scale-[1.01]"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creando cuenta...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Registrar y Continuar
                  </>
                )}
              </button>
            </form>
          )}

          {/* Bottom redirection actions */}
          <div className="flex justify-between text-xs text-slate-400 mt-5 pt-3 border-t border-slate-800 font-medium">
            <button 
              type="button" 
              onClick={() => navigate('/')} 
              className="hover:text-white transition-colors"
            >
              ← Volver al inicio
            </button>
            <div>
              ¿Ya tienes cuenta?{' '}
              <button
                type="button"
                onClick={() => navigate(`/login${modulesParam ? `?modules=${modulesParam}` : ''}`)}
                className="text-blue-400 hover:text-blue-300 font-bold hover:underline"
              >
                Iniciar Sesión
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
