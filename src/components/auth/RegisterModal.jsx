import React, { useState } from 'react';
import PhoneInput from '../ui/PhoneInput';

export default function RegisterModal({ onRegister, onClose, loading }) {
  const [formData, setFormData] = useState({
    // Datos del usuario administrador
    nombre: '',
    rut: '',
    email: '',
    password: '',
    confirmPassword: '',
    pin: '',
    confirmPin: '',
    // Datos de la empresa
    empresa: {
      razonSocial: '',
      rut: '',
      direccion: '',
      contacto: '',
      telefono: '',
    },
  });
  const [step, setStep] = useState(1); // 1: datos personales, 2: datos empresa
  const [error, setError] = useState('');

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

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!formData.empresa.razonSocial.trim()) { setError('La razón social es obligatoria'); return; }
    if (!formData.empresa.rut.trim()) { setError('El RUT de empresa es obligatorio'); return; }
    if (!validateRut(formData.empresa.rut)) { setError('RUT de empresa inválido'); return; }
    if (!formData.empresa.direccion.trim()) { setError('La dirección es obligatoria'); return; }
    if (!formData.empresa.contacto.trim()) { setError('El nombre de contacto es obligatorio'); return; }
    onRegister(formData);
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md relative animate-scaleIn max-h-[90dvh] flex flex-col">
        
        {/* Close button above */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white/70 hover:text-white transition-colors flex items-center gap-1 text-sm bg-slate-900/60 px-3 py-1.5 rounded-full border border-white/10"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Cerrar
        </button>

        <div 
          className="border rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          style={{ 
            backgroundColor: 'rgba(15, 28, 46, 0.98)', 
            borderColor: 'rgba(255, 255, 255, 0.08)' 
          }}
        >
          {/* Header */}
          <div 
            className="p-5 relative border-b shrink-0"
            style={{ 
              background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.8) 0%, rgba(29, 78, 216, 0.8) 100%)',
              borderColor: 'rgba(255, 255, 255, 0.08)'
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
            
            <div className="relative flex items-center gap-3">
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
                <h3 className="font-black text-base text-white tracking-tight">Registrar Empresa</h3>
                <p className="text-xs text-blue-200 font-semibold">Paso {step} de 2 — {step === 1 ? 'Tu cuenta' : 'Datos de empresa'}</p>
              </div>
            </div>
          </div>

          {/* Step indicators */}
          <div className="flex gap-2 px-6 pt-4 shrink-0">
            <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step >= 1 ? 'bg-blue-500 shadow-sm shadow-blue-500/50' : 'bg-slate-800'}`} />
            <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step >= 2 ? 'bg-blue-500 shadow-sm shadow-blue-500/50' : 'bg-slate-800'}`} />
          </div>

          {/* Form scroll container */}
          <div className="overflow-y-auto max-h-[60dvh] custom-scrollbar">
            {/* PASO 1: Datos personales */}
            {step === 1 && (
              <form onSubmit={handleNext} className="p-6 space-y-4">
                <p className="text-xs text-slate-400 font-medium leading-relaxed">
                  Configura tus datos de acceso como administrador de la empresa.
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Nombre Completo <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={formData.nombre}
                    onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                    placeholder="Juan Pérez" 
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
                    placeholder="Repite tu contraseña" 
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

            {/* PASO 2: Datos de la empresa */}
            {step === 2 && (
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <p className="text-xs text-slate-400 font-medium leading-relaxed">
                  Ingresa la información comercial y tributaria de tu empresa.
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Razón Social <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={formData.empresa.razonSocial}
                    onChange={e => setEmpresa('razonSocial', e.target.value)}
                    placeholder="Constructora Alfa SpA" 
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
                    placeholder="Av. Providencia 1234, Of. 501" 
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
                    placeholder="Persona encargada de la cuenta" 
                    className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm" 
                    required 
                  />
                </div>

                <PhoneInput
                  value={formData.empresa.telefono}
                  onChange={val => setEmpresa('telefono', val)}
                  variant="dark"
                />

                {/* Free plan notice in matching blue */}
                <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-2.5">
                  <span className="text-lg mt-0.5">🎁</span>
                  <p className="text-xs text-blue-300 font-semibold leading-relaxed">
                    <strong>Finanzas Gratis Incluido</strong>: Tu cuenta se activará con el módulo de Finanzas y Contabilidad 100% gratuito. Otros módulos seleccionados se procesarán a continuación.
                  </p>
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
                      Crear Cuenta y Continuar
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
