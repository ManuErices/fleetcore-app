import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';

// Formatea RUT mientras escribe: 12345678-9
function formatRut(value) {
  const clean = value.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length <= 1) return clean;
  const body = clean.slice(0, -1);
  const dv   = clean.slice(-1);
  const fmt  = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${fmt}-${dv}`;
}

function rutToEmail(rut) {
  // "12.345.678-9" → "123456789@mpf.cl"
  return rut.replace(/[^0-9kK]/gi, '').toLowerCase() + '@mpf.cl';
}

export default function TrabajadorLogin() {
  const [rut,      setRut]      = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    if (!rut || !password) { setError('Ingresa tu RUT y contraseña.'); return; }
    setError('');
    setLoading(true);
    try {
      const email = rutToEmail(rut);
      await signInWithEmailAndPassword(auth, email, password);
      // El componente padre (TrabajadorApp) detecta el cambio de auth
    } catch (err) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('RUT o contraseña incorrectos.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Demasiados intentos. Intenta más tarde.');
      } else {
        setError('Error de conexión. Verifica tu internet.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');

        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

        :root {
          --bg:       #0f0f0f;
          --surface:  #1a1a1a;
          --surface2: #242424;
          --border:   #2e2e2e;
          --accent:   #F59E0B;
          --accent-d: #D97706;
          --text:     #f5f5f5;
          --text-2:   #a0a0a0;
          --text-3:   #606060;
          --error:    #ef4444;
          --sans:     'Sora', sans-serif;
          --mono:     'IBM Plex Mono', monospace;
        }

        body {
          font-family: var(--sans);
          background: var(--bg);
          color: var(--text);
          min-height: 100dvh;
          -webkit-font-smoothing: antialiased;
        }

        .login-shell {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px 20px;
          position: relative;
          overflow: hidden;
        }

        /* Textura de fondo sutil */
        .login-shell::before {
          content: '';
          position: fixed;
          inset: 0;
          background:
            radial-gradient(ellipse 60% 50% at 50% -10%, rgba(245,158,11,0.08) 0%, transparent 70%),
            radial-gradient(ellipse 40% 30% at 80% 110%, rgba(245,158,11,0.04) 0%, transparent 60%);
          pointer-events: none;
        }

        /* Grid pattern sutil */
        .login-shell::after {
          content: '';
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 32px 32px;
          pointer-events: none;
        }

        .login-card {
          width: 100%;
          max-width: 380px;
          position: relative;
          z-index: 1;
          animation: fadeUp 0.4s ease both;
        }

        @keyframes fadeUp {
          from { opacity:0; transform: translateY(16px); }
          to   { opacity:1; transform: translateY(0); }
        }

        /* Logo / marca */
        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 36px;
        }
        .brand-icon {
          width: 40px;
          height: 40px;
          background: var(--accent);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .brand-icon svg { color: #0f0f0f; }
        .brand-text {}
        .brand-name {
          font-size: 15px;
          font-weight: 700;
          color: var(--text);
          line-height: 1;
        }
        .brand-sub {
          font-size: 11px;
          color: var(--text-3);
          margin-top: 2px;
          font-family: var(--mono);
          letter-spacing: 0.5px;
        }

        /* Encabezado */
        .login-heading {
          font-size: 26px;
          font-weight: 800;
          color: var(--text);
          letter-spacing: -0.5px;
          line-height: 1.15;
          margin-bottom: 6px;
        }
        .login-sub {
          font-size: 13px;
          color: var(--text-2);
          margin-bottom: 32px;
          line-height: 1.5;
        }

        /* Form */
        .field { margin-bottom: 16px; }
        .field-label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--text-3);
          margin-bottom: 7px;
        }
        .field-wrap { position: relative; }
        .field-input {
          width: 100%;
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: 10px;
          color: var(--text);
          font-family: var(--mono);
          font-size: 15px;
          padding: 13px 16px;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          -webkit-appearance: none;
        }
        .field-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(245,158,11,0.12);
        }
        .field-input::placeholder { color: var(--text-3); font-size: 14px; }
        .field-input.has-toggle { padding-right: 48px; }

        .toggle-pass {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--text-3);
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          transition: color 0.15s;
        }
        .toggle-pass:hover { color: var(--text-2); }

        /* Error */
        .error-msg {
          display: flex;
          align-items: center;
          gap: 7px;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.2);
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 13px;
          color: #fca5a5;
          margin-bottom: 16px;
          animation: fadeUp 0.2s ease both;
        }

        /* Botón */
        .btn-login {
          width: 100%;
          background: var(--accent);
          color: #0f0f0f;
          border: none;
          border-radius: 10px;
          font-family: var(--sans);
          font-size: 15px;
          font-weight: 700;
          padding: 15px;
          cursor: pointer;
          margin-top: 8px;
          transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          letter-spacing: 0.2px;
          -webkit-tap-highlight-color: transparent;
        }
        .btn-login:hover:not(:disabled) {
          background: var(--accent-d);
          box-shadow: 0 4px 20px rgba(245,158,11,0.25);
        }
        .btn-login:active:not(:disabled) { transform: scale(0.98); }
        .btn-login:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Spinner */
        .spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(15,15,15,0.3);
          border-top-color: #0f0f0f;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Footer */
        .login-footer {
          margin-top: 32px;
          text-align: center;
          font-size: 11px;
          color: var(--text-3);
          font-family: var(--mono);
          line-height: 1.8;
        }
        .login-footer a {
          color: var(--accent);
          text-decoration: none;
        }

        /* Hint contraseña */
        .pass-hint {
          margin-top: 6px;
          font-size: 11px;
          color: var(--text-3);
          font-family: var(--mono);
        }
      `}</style>

      <div className="login-shell">
        <div className="login-card">

          {/* Brand */}
          <div className="brand">
            <div className="brand-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                <path d="M16 3H8l-2 4h12l-2-4z"/>
              </svg>
            </div>
            <div className="brand-text">
              <div className="brand-name">FleetCore</div>
              <div className="brand-sub">Portal Trabajadores</div>
            </div>
          </div>

          <h1 className="login-heading">Bienvenido/a</h1>
          <p className="login-sub">Ingresa tus credenciales para acceder a tu portal.</p>

          <form onSubmit={handleLogin} noValidate>
            <div className="field">
              <label className="field-label">RUT</label>
              <div className="field-wrap">
                <input
                  className="field-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="12.345.678-9"
                  value={rut}
                  onChange={e => setRut(formatRut(e.target.value))}
                  maxLength={12}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            <div className="field">
              <label className="field-label">Contraseña</label>
              <div className="field-wrap">
                <input
                  className={`field-input has-toggle`}
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button type="button" className="toggle-pass" onClick={() => setShowPass(v => !v)} tabIndex={-1}>
                  {showPass
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
              <div className="pass-hint">Primera vez: usa tu RUT sin puntos ni guión</div>
            </div>

            {error && (
              <div className="error-msg">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
              </div>
            )}

            <button className="btn-login" type="submit" disabled={loading}>
              {loading
                ? <><div className="spinner"/> Ingresando...</>
                : <>Ingresar<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></>
              }
            </button>
          </form>

          <div className="login-footer">
            ¿Problemas para ingresar?<br/>
            Contacta a <a href="mailto:rrhh@mpf.cl">rrhh@mpf.cl</a> o habla con tu supervisor.
          </div>

        </div>
      </div>
    </>
  );
}
