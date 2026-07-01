import React, { useState, useEffect, useRef } from "react";
import { signInWithPopup, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, googleProvider, db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useSearchParams, useNavigate } from "react-router-dom";
import jsQR from "jsqr";
import { calculateTotal } from "../lib/plans";

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const modulesParam = searchParams.get('modules');
  const landingModules = modulesParam ? modulesParam.split(',') : ['finanzas'];

  const [activeTab, setActiveTab] = useState('email'); // 'email' | 'qr'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Email form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // QR scanner states
  const [scanning, setScanning] = useState(false);
  const [qrError, setQrError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

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

  // Control camera on tab change
  useEffect(() => {
    if (activeTab === 'qr') {
      setScanning(true);
      startCamera();
    } else {
      setScanning(false);
      stopCamera();
    }
    return () => stopCamera();
  }, [activeTab]);

  const startCamera = async () => {
    try {
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      scanQRCode();
    } catch (err) {
      console.error('Camera access error:', err);
      setQrError('No se pudo acceder a la cámara. Revisa permisos o usa entrada manual.');
      setScanning(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const scanQRCode = () => {
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
          console.log("📱 QR scanned:", code.data);
          setScanning(false);
          stopCamera();
          try {
            const credentials = JSON.parse(code.data);
            if (credentials.email && credentials.password) {
              handleAuthSuccess(credentials.email, credentials.password);
            } else {
              setQrError('❌ Código QR no contiene credenciales válidas');
            }
          } catch (err) {
            setQrError('❌ Formato de código QR inválido');
          }
          return;
        }
      }
      requestAnimationFrame(scanQRCode);
    } catch (err) {
      console.error('Scanning error:', err);
      requestAnimationFrame(scanQRCode);
    }
  };

  const handleAuthSuccess = async (emailVal, passVal) => {
    setLoading(true);
    setError('');
    try {
      const userCredential = await signInWithEmailAndPassword(auth, emailVal, passVal);
      const user = userCredential.user;

      // Verificar tombstone y obtener rol para redirect directo
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (userSnap.exists()) {
          const userData = userSnap.data();
          if (userData.deleted) {
            await signOut(auth);
            setError("Email o contraseña incorrectos");
            return;
          }
          if (userData.role === 'operador') {
            navigate('/workfleet-m');
            return;
          }
          if (userData.role === 'trabajador') {
            navigate('/trabajador');
            return;
          }
        }
      } catch (permErr) {
        if (permErr.code === 'permission-denied') {
          // App.jsx ya hizo signOut por la race condition (onSnapshot detectó deleted:true primero)
          setError("Email o contraseña incorrectos");
          return;
        }
        // Otro error (red, etc.) — dejar pasar, App.jsx maneja el estado
      }

      await processPostLoginCheckout(user);
    } catch (err) {
      console.error("Auth error:", err);
      let msg = "Error al iniciar sesión";
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = "Email o contraseña incorrectos";
      } else if (err.code === 'auth/invalid-email') {
        msg = "Email inválido";
      } else if (err.code === 'auth/too-many-requests') {
        msg = "Demasiados intentos. Intenta más tarde.";
      }
      setError(msg);
      // Restart camera if QR failed
      if (activeTab === 'qr') {
        setActiveTab('email');
      }
    } finally {
      setLoading(false);
    }
  };

  const processPostLoginCheckout = async (user) => {
    const { totalUf } = calculateTotal(landingModules);
    if (totalUf > 0) {
      const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL
        || 'https://us-central1-mpf-maquinaria.cloudfunctions.net';

      const planIdStr = landingModules.sort().join(',');

      try {
        const res = await fetch(`${FUNCTIONS_URL}/createWebpaySubscription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: planIdStr,
            userId: user.uid,
            userEmail: user.email,
            priceUf: totalUf,
            modules: landingModules,
          }),
        });

        const data = await res.json();
        if (data.success) {
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = data.url;
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = 'token_ws';
          input.value = data.token;
          form.appendChild(input);
          document.body.appendChild(form);
          form.submit();
          return;
        }
      } catch (err) {
        console.error('Post-login checkout generation failed:', err);
      }
    }
    // Default redirect to selector
    navigate('/');
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await processPostLoginCheckout(result.user);
    } catch (err) {
      console.error("Google login error:", err);
      setError("Error al iniciar sesión con Google");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = (e) => {
    e.preventDefault();
    if (email.trim() && password) {
      handleAuthSuccess(email.trim(), password);
    }
  };

  return (
    <div className="min-h-screen text-slate-100 font-sans flex flex-col justify-center items-center p-4 relative overflow-hidden" style={{ backgroundColor: '#0A1628' }}>
      {/* Grid background */}
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

      {/* Floating logo link */}
      <div className="mb-6 flex flex-col items-center gap-2 relative z-10">
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
        className="w-full max-w-md border rounded-3xl shadow-2xl overflow-hidden relative z-10"
        style={{ 
          backgroundColor: 'rgba(15, 28, 46, 0.95)', 
          borderColor: 'rgba(255, 255, 255, 0.08)' 
        }}
      >
        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 bg-slate-900/60 p-1">
          <button
            onClick={() => setActiveTab('email')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider rounded-2xl transition-all ${
              activeTab === 'email' 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Email
          </button>
          <button
            onClick={() => setActiveTab('qr')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider rounded-2xl transition-all ${
              activeTab === 'qr' 
                ? 'bg-purple-600 text-white shadow-md' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Escáner QR
          </button>
        </div>

        {/* Content Card Body */}
        <div className="p-6">
          {/* TAB 1: EMAIL LOGIN */}
          {activeTab === 'email' && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@empresa.cl"
                  className="w-full px-4 py-3 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-4 py-3 bg-slate-950/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm pr-12"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                  <div className="text-xs font-bold text-red-400">{error}</div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-blue-600/25 disabled:opacity-50 hover:scale-[1.01]"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Entrando...
                  </div>
                ) : (
                  'Ingresar'
                )}
              </button>
            </form>
          )}

          {/* TAB 2: QR CODE SCANNER */}
          {activeTab === 'qr' && (
            <div className="space-y-4">
              {scanning ? (
                <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-slate-800">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-32 h-32 border-4 border-purple-500 rounded-xl shadow-lg shadow-purple-500/30 animate-pulse" />
                  </div>
                </div>
              ) : (
                <div className="aspect-video flex flex-col items-center justify-center bg-slate-950/60 border border-slate-800 border-dashed rounded-2xl p-4 text-center">
                  <p className="text-xs text-slate-400 mb-3">{qrError || 'Cámara desactivada'}</p>
                  <button
                    onClick={() => {
                      setScanning(true);
                      startCamera();
                    }}
                    className="px-4 py-2 bg-purple-600/20 hover:bg-purple-600/35 border border-purple-500/30 text-purple-300 text-xs font-bold rounded-xl transition-all"
                  >
                    Activar Cámara
                  </button>
                </div>
              )}

              {qrError && !scanning && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                  <div className="text-xs font-bold text-red-400">{qrError}</div>
                </div>
              )}
            </div>
          )}

          {/* Corporative Google Auth */}
          <div className="mt-5 pt-5 border-t border-slate-800 space-y-4">
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/50 rounded-xl text-sm font-bold flex items-center justify-center gap-3 transition-all hover:scale-[1.01]"
            >
              <svg className="w-4 h-4 text-white flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
              </svg>
              Ingresar con Google
            </button>

            {/* Bottom Actions */}
            <div className="flex justify-between text-xs text-slate-400 pt-1 font-medium">
              <button 
                type="button" 
                onClick={() => navigate('/')} 
                className="hover:text-white transition-colors"
              >
                ← Volver al inicio
              </button>
              <div>
                ¿No tienes cuenta?{' '}
                <button
                  type="button"
                  onClick={() => navigate(`/register${modulesParam ? `?modules=${modulesParam}` : ''}`)}
                  className="text-blue-400 hover:text-blue-300 font-bold hover:underline"
                >
                  Registrarse
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
