import React, { useState, useEffect, useRef } from "react";
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import jsQR from "jsqr";

export default function LoginPage() {
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Error en login con Google:", err);
      alert("Error al iniciar sesión con Google");
    } finally {
      setLoading(false);
    }
  };

  const handleQRLogin = async (credentials) => {
    setLoading(true);
    try {
      const { email, password } = credentials;
      await signInWithEmailAndPassword(auth, email, password);
      setShowQRScanner(false);
      console.log("✅ Login exitoso con QR");
    } catch (err) {
      console.error("Error en login con QR:", err);
      alert("Error al iniciar sesión: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (userData) => {
    setLoading(true);
    try {
      const { email, password, nombre, rut } = userData;
      
      // Crear usuario en Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Actualizar perfil con nombre
      await updateProfile(user, {
        displayName: nombre
      });
      
      // Guardar datos adicionales en Firestore
      await setDoc(doc(db, "users", user.uid), {
        email: email,
        nombre: nombre,
        rut: rut,
        createdAt: new Date().toISOString(),
        role: 'operador' // Rol por defecto
      });
      
      setShowRegister(false);
      console.log("✅ Cuenta creada exitosamente");
      alert("✅ Cuenta creada exitosamente. Ahora puedes iniciar sesión.");
    } catch (err) {
      console.error("Error al crear cuenta:", err);
      let errorMessage = "Error al crear cuenta";
      
      if (err.code === 'auth/email-already-in-use') {
        errorMessage = "Este email ya está registrado";
      } else if (err.code === 'auth/weak-password') {
        errorMessage = "La contraseña debe tener al menos 6 caracteres";
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = "Email inválido";
      }
      
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorativo */}
      <div className="absolute inset-0 bg-grid opacity-10 pointer-events-none" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-3xl" />

      {/* Login Card */}
      <div className="relative w-full max-w-md">
        <div className="glass-card rounded-3xl shadow-2xl overflow-hidden border border-white/10 animate-fadeInUp">
          {/* Header */}
          <div className="bg-gradient-to-br from-blue-900 to-blue-700 p-8 text-center relative">
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
            
            <div className="relative">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-xl">
                <img
                  src="/favicon.svg"
                  alt="FleetCore"
                  className="w-14 h-14 object-contain"
                />
              </div>

              <h1 className="text-3xl font-black text-white tracking-tight mb-2">
                Fleet<span className="text-blue-200">Core</span>
              </h1>
              <p className="text-blue-100 text-sm font-medium">
                Sistema de Gestión de Maquinaria
              </p>
            </div>
          </div>

          {/* Contenido */}
          <div className="p-8 space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">¡Bienvenido!</h2>
              <p className="text-slate-600">Selecciona tu método de inicio de sesión</p>
            </div>

            {/* Botón QR */}
            <button
              onClick={() => setShowQRScanner(true)}
              disabled={loading}
              className="w-full group relative overflow-hidden"
            >
              <div className="relative flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-slate-200 rounded-2xl shadow-lg hover:shadow-xl hover:border-purple-400 hover:bg-purple-50 transition-all">
                <svg className="w-6 h-6 text-purple-600 hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                <span className="font-bold text-slate-700">
                  Escanear código QR
                </span>
              </div>
            </button>

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center gap-2 text-blue-600">
                <div className="spinner w-5 h-5 border-blue-600" />
                <span className="text-sm font-medium">Iniciando sesión...</span>
              </div>
            )}

            {/* Enlace a registro */}
            <div className="text-center pt-4 border-t border-slate-200">
              <p className="text-sm text-slate-600">
                ¿No tienes cuenta?{" "}
                <button
                  onClick={() => setShowRegister(true)}
                  className="text-blue-600 hover:text-blue-700 font-semibold underline"
                >
                  Crear cuenta
                </button>
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 pb-8 pt-4 border-t border-slate-100">
            <p className="text-center text-xs text-slate-500">
              © {new Date().getFullYear()} Manuel Erices
              <br />
              Todos los derechos reservados
            </p>
          </div>
        </div>

        {/* Info adicional */}
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-300">
            ¿Problemas para iniciar sesión?{" "}
            <a href="mailto:soporte@mpf.cl" className="text-blue-400 hover:text-blue-300 font-medium underline">
              Contacta soporte
            </a>
          </p>
        </div>
      </div>

      {/* Modal QR Scanner */}
      {showQRScanner && (
        <QRLoginModal 
          onScan={handleQRLogin} 
          onClose={() => setShowQRScanner(false)} 
        />
      )}

      {/* Modal Registro */}
      {showRegister && (
        <RegisterModal 
          onRegister={handleRegister} 
          onClose={() => setShowRegister(false)}
          loading={loading}
        />
      )}
    </div>
  );
}

// Componente Register Modal
function RegisterModal({ onRegister, onClose, loading }) {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    nombre: '',
    rut: ''
  });
  const [error, setError] = useState('');

  const formatRut = (value) => {
    // Remover puntos y guión
    let rut = value.replace(/\./g, '').replace(/-/g, '');
    
    // Validar que solo tenga números y k
    rut = rut.replace(/[^0-9kK]/g, '');
    
    // Formatear
    if (rut.length > 1) {
      const body = rut.slice(0, -1);
      const dv = rut.slice(-1).toUpperCase();
      
      // Agregar puntos
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
    // Remover formato
    const cleanRut = rut.replace(/\./g, '').replace(/-/g, '');
    
    if (cleanRut.length < 2) return false;
    
    const body = cleanRut.slice(0, -1);
    const dv = cleanRut.slice(-1).toUpperCase();
    
    // Calcular dígito verificador
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

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    // Validaciones
    if (!formData.nombre.trim()) {
      setError('El nombre es obligatorio');
      return;
    }

    if (!formData.rut.trim()) {
      setError('El RUT es obligatorio');
      return;
    }

    if (!validateRut(formData.rut)) {
      setError('RUT inválido');
      return;
    }

    if (!formData.email.trim()) {
      setError('El email es obligatorio');
      return;
    }

    if (formData.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    onRegister(formData);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className="max-w-md w-full bg-white rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden animate-scaleIn">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-3 sm:p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            <h3 className="font-black text-base sm:text-lg">Crear Cuenta</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Nombre Completo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              placeholder="Nombre Apellido"
              className="input-modern w-full"
              required
            />
          </div>

          {/* RUT */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              RUT <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.rut}
              onChange={handleRutChange}
              placeholder="12.345.678-9"
              className="input-modern w-full"
              maxLength={12}
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="usuario@ejemplo.cl"
              className="input-modern w-full"
              required
            />
          </div>

          {/* Contraseña */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Contraseña <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Mínimo 6 caracteres"
              className="input-modern w-full"
              minLength={6}
              required
            />
          </div>

          {/* Confirmar Contraseña */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Confirmar Contraseña <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              placeholder="Repite la contraseña"
              className="input-modern w-full"
              minLength={6}
              required
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3">
              <div className="text-sm font-bold text-red-700">{error}</div>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-slate-100 text-slate-700 font-bold text-sm rounded-xl hover:bg-slate-200 transition-all"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="spinner w-4 h-4 border-white" />
                  Creando...
                </span>
              ) : (
                'Crear Cuenta'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Componente QR Login Modal
function QRLoginModal({ onScan, onClose }) {
  const [scanning, setScanning] = useState(true);
  const [manualEmail, setManualEmail] = useState('');
  const [manualPassword, setManualPassword] = useState('');
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (scanning) {
      startCamera();
    }
    return () => stopCamera();
  }, [scanning]);

  const startCamera = async () => {
    try {
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      scanQRCode();
    } catch (err) {
      console.error('Error accediendo a la cámara:', err);
      setError('No se pudo acceder a la cámara. Usa entrada manual.');
      setScanning(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const scanQRCode = async () => {
    if (!videoRef.current || !scanning) return;

    try {
      const video = videoRef.current;
      
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        
        if (code) {
          console.log("📱 QR detectado:", code.data);
          setScanning(false);
          stopCamera();
          
          try {
            const credentials = JSON.parse(code.data);
            if (credentials.email && credentials.password) {
              onScan(credentials);
            } else {
              setError('❌ QR inválido: falta email o password');
            }
          } catch (err) {
            setError('❌ QR inválido: formato incorrecto');
            console.error('Error parseando QR:', err);
          }
          return;
        }
      }
      
      if (scanning) {
        requestAnimationFrame(scanQRCode);
      }
    } catch (err) {
      console.error('Error escaneando:', err);
      if (scanning) {
        requestAnimationFrame(scanQRCode);
      }
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualEmail.trim() && manualPassword.trim()) {
      onScan({ email: manualEmail.trim(), password: manualPassword.trim() });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className="max-w-md w-full bg-white rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden animate-scaleIn">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-3 sm:p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            <h3 className="font-black text-base sm:text-lg">Login con QR</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
          {/* Camera View */}
          {scanning && (
            <div className="relative aspect-square rounded-lg sm:rounded-xl overflow-hidden bg-slate-900">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 sm:w-64 sm:h-64 border-4 border-purple-500 rounded-2xl shadow-lg shadow-purple-500/50">
                  <div className="absolute top-0 left-0 w-6 h-6 sm:w-8 sm:h-8 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
                  <div className="absolute top-0 right-0 w-6 h-6 sm:w-8 sm:h-8 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
                  <div className="absolute bottom-0 left-0 w-6 h-6 sm:w-8 sm:h-8 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
                  <div className="absolute bottom-0 right-0 w-6 h-6 sm:w-8 sm:h-8 border-b-4 border-r-4 border-white rounded-br-xl"></div>
                </div>
              </div>
              
              <div className="absolute bottom-3 sm:bottom-4 left-0 right-0 text-center px-3">
                <div className="inline-block bg-black/50 backdrop-blur-sm text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold">
                  📱 Apunta al código QR
                </div>
              </div>
            </div>
          )}

          {/* Manual Input */}
          <form onSubmit={handleManualSubmit}>
            <div className="text-[10px] sm:text-xs font-bold text-slate-600 mb-2 text-center">
              O ingresa credenciales manualmente:
            </div>
            <div className="space-y-2">
              <input
                type="email"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                placeholder="Email"
                className="input-modern w-full text-sm sm:text-base"
                required
              />
              <input
                type="password"
                value={manualPassword}
                onChange={(e) => setManualPassword(e.target.value)}
                placeholder="Contraseña"
                className="input-modern w-full text-sm sm:text-base"
                required
              />
              <button
                type="submit"
                className="w-full px-4 py-3 bg-purple-600 text-white font-bold text-sm sm:text-base rounded-lg sm:rounded-xl hover:bg-purple-700 transition-all"
              >
                Iniciar Sesión
              </button>
            </div>
          </form>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg sm:rounded-xl p-3">
              <div className="text-xs sm:text-sm font-bold text-red-700">{error}</div>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setScanning(!scanning)}
              className="flex-1 py-2 sm:py-3 px-3 sm:px-4 bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm rounded-lg sm:rounded-xl hover:bg-slate-200 transition-all"
            >
              {scanning ? '⏸️ Pausar' : '▶️ Iniciar'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2 sm:py-3 px-3 sm:px-4 bg-slate-600 text-white font-bold text-xs sm:text-sm rounded-lg sm:rounded-xl hover:bg-slate-700 transition-all"
            >
              ✕ Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
