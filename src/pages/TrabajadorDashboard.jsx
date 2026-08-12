import { useState, useEffect, useCallback } from 'react';
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, addDoc, serverTimestamp, onSnapshot, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const calcularDiasHabiles = (desde, hasta) => {
  if (!desde || !hasta) return 0;
  const start = new Date(desde + 'T00:00:00');
  const end = new Date(hasta + 'T00:00:00');
  if (end < start) return 0;

  let count = 0;
  let cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay(); // 0 = Domingo, 6 = Sábado
    if (day !== 0 && day !== 6) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
};

function fmt2(n) { return String(n).padStart(2, '0'); }
function fmtHora(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`;
}
function fmtFecha(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${fmt2(d.getDate())}/${fmt2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function fmtFechaString(str) {
  if (!str) return '';
  const parts = str.split('-');
  if (parts.length !== 3) return str;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
function diffHoras(ts1, ts2) {
  if (!ts1 || !ts2) return null;
  const d1 = ts1.toDate ? ts1.toDate() : new Date(ts1);
  const d2 = ts2.toDate ? ts2.toDate() : new Date(ts2);
  const mins = Math.round((d2 - d1) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${fmt2(m)}m`;
}

// Clave del documento de asistencia mensual
function claveDoc(uid, anio, mes) {
  return `${uid}_${anio}_${fmt2(mes + 1)}`;
}

export default function TrabajadorDashboard({ user, trabajador, empresaId }) {
  const now = new Date();
  const anio = now.getFullYear();
  const mes = now.getMonth(); // 0-indexed
  const dia = now.getDate();
  const diaKey = fmt2(dia);

  const [horaActual, setHoraActual] = useState(new Date());
  const [registroHoy, setRegistroHoy] = useState(null);   // { entrada, salida, gps_e, gps_s }
  const [registrosMes, setRegistrosMes] = useState({});     // { "01": {...}, "02": {...} }
  const [marcando, setMarcando] = useState(false);
  const [feedback, setFeedback] = useState(null);   // { tipo: 'ok'|'err', msg }
  const [tab, setTab] = useState('home'); // home | asistencia | docs | cuenta
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [loadingLiqs, setLoadingLiqs] = useState(false);

  // Estados cambio de contraseña
  const [passForm, setPassForm] = useState({ actual: '', nueva: '', confirma: '' });
  const [passLoading, setPassLoading] = useState(false);
  const [passMsg, setPassMsg] = useState(null); // { tipo: 'ok'|'err', msg }

  const [trabajadorInfo, setTrabajadorInfo] = useState(trabajador);
  const isRevoked = trabajadorInfo?.estado === 'finiquitado' || trabajadorInfo?.estado === 'inactivo';

  // Escucha en tiempo real el perfil del trabajador
  useEffect(() => {
    if (!empresaId || !trabajador?.id) return;
    const ref = doc(db, 'empresas', empresaId, 'trabajadores', trabajador.id);
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        setTrabajadorInfo({ id: snap.id, ...snap.data() });
      }
    }, err => {
      console.error("Error al escuchar trabajador:", err);
    });
    return unsub;
  }, [empresaId, trabajador?.id]);

  // Estados de vacaciones
  const [vacDesde, setVacDesde] = useState('');
  const [vacHasta, setVacHasta] = useState('');
  const [vacObs, setVacObs] = useState('');
  const [vacEnviando, setVacEnviando] = useState(false);
  const [vacFeedback, setVacFeedback] = useState(null);
  const [solicitudesVacaciones, setSolicitudesVacaciones] = useState([]);

  // Escucha en tiempo real las solicitudes de vacaciones del trabajador
  useEffect(() => {
    if (!empresaId || !trabajadorInfo?.id || tab !== 'vacaciones') return;
    const q = query(
      collection(db, 'empresas', empresaId, 'vacaciones'),
      where('trabajadorId', '==', trabajadorInfo.id),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setSolicitudesVacaciones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      console.error("Error al escuchar solicitudes de vacaciones:", err);
    });
    return unsub;
  }, [empresaId, trabajadorInfo?.id, tab]);

  async function solicitarVacacion(e) {
    e.preventDefault();
    if (vacEnviando || !empresaId || !trabajadorInfo?.id) return;
    setVacFeedback(null);

    const diasSolicitados = calcularDiasHabiles(vacDesde, vacHasta);
    const diasDisponibles = trabajadorInfo.diasVacacionesDisponibles ?? 15.0;

    if (!vacDesde || !vacHasta) {
      setVacFeedback({ tipo: 'err', msg: 'Debe especificar ambas fechas.' });
      return;
    }
    if (diasSolicitados <= 0) {
      setVacFeedback({ tipo: 'err', msg: 'Rango de fechas inválido o no contempla días hábiles.' });
      return;
    }
    if (diasSolicitados > diasDisponibles) {
      setVacFeedback({ tipo: 'err', msg: 'No tienes suficientes días disponibles.' });
      return;
    }

    setVacEnviando(true);
    try {
      await addDoc(collection(db, 'empresas', empresaId, 'vacaciones'), {
        trabajadorId: trabajadorInfo.id,
        trabajadorNombre: `${trabajadorInfo.nombre} ${trabajadorInfo.apellidoPaterno || ''} ${trabajadorInfo.apellidoMaterno || ''}`.trim(),
        diasSolicitados,
        diasDisponibles,
        desde: vacDesde,
        hasta: vacHasta,
        observaciones: vacObs,
        estado: 'pendiente',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setVacFeedback({ tipo: 'ok', msg: '✓ Solicitud de vacaciones creada exitosamente.' });
      setVacDesde('');
      setVacHasta('');
      setVacObs('');
    } catch (err) {
      console.error("Error al enviar solicitud:", err);
      setVacFeedback({ tipo: 'err', msg: 'Error al enviar la solicitud: ' + err.message });
    } finally {
      setVacEnviando(false);
    }
  }

  const nombre = trabajadorInfo
    ? `${trabajadorInfo.nombre} ${trabajadorInfo.apellidoPaterno}`
    : user.email.split('@')[0];

  // Reloj en tiempo real
  useEffect(() => {
    const t = setInterval(() => setHoraActual(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Escucha en tiempo real el documento de asistencia del mes actual
  useEffect(() => {
    if (!empresaId) return;
    const docId = claveDoc(user.uid, anio, mes);
    const ref = doc(db, 'empresas', empresaId, 'asistencia', docId);
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        const data = snap.data();
        setRegistrosMes(data.registros || {});
        setRegistroHoy(data.registros?.[diaKey] || null);
      } else {
        setRegistrosMes({});
        setRegistroHoy(null);
      }
    });
    return unsub;
  }, [empresaId, user.uid, anio, mes, diaKey]);

  // Cargar liquidaciones del trabajador
  // trabajadorId en remuneraciones = id del documento Firestore, NO el uid de Auth
  useEffect(() => {
    if (tab !== 'docs') return;
    const firestoreId = trabajadorInfo?.id;
    if (!firestoreId || !empresaId) { setLoadingLiqs(false); return; }
    setLoadingLiqs(true);
    const q = query(
      collection(db, 'empresas', empresaId, 'remuneraciones'),
      where('trabajadorId', '==', firestoreId),
      orderBy('anio', 'desc'),
      limit(12)
    );
    getDocs(q).then(snap => {
      setLiquidaciones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(() => { }).finally(() => setLoadingLiqs(false));
  }, [tab, trabajadorInfo?.id, empresaId]);

  // Obtener GPS en background (no bloqueante)
  function obtenerGPS() {
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
        () => resolve(null),
        { timeout: 5000, maximumAge: 60000 }
      );
    });
  }

  async function marcar() {
    if (marcando || !empresaId) return;
    setMarcando(true);
    setFeedback(null);
    try {
      const gps = await obtenerGPS();
      const mesStr = fmt2(mes + 1); // "03" — string, coincide con filtros del admin
      const docId = claveDoc(user.uid, anio, mes);
      const ref = doc(db, 'empresas', empresaId, 'asistencia', docId);
      const snap = await getDoc(ref);

      const regHoy = snap.exists() ? (snap.data().registros?.[diaKey] || {}) : {};
      const esEntrada = !regHoy.entrada;
      const esSalida = regHoy.entrada && !regHoy.salida;

      if (!esEntrada && !esSalida) {
        setFeedback({ tipo: 'info', msg: 'Ya registraste entrada y salida de hoy.' });
        return;
      }

      const campo = esEntrada ? 'entrada' : 'salida';
      const gpsKey = esEntrada ? 'gps_e' : 'gps_s';

      if (!snap.exists()) {
        // setDoc inicial con merge — crea el doc Y escribe el timestamp en una sola operación
        // mes como string "03" para coincidir con los filtros del panel admin
        const payload = {
          trabajadorId: user.uid,
          trabajadorNombre: nombre,
          anio: String(anio),
          mes: mesStr,
          registros: { [diaKey]: { [campo]: serverTimestamp() } },
          modificaciones: [],
        };
        if (gps) payload.registros[diaKey][gpsKey] = gps;
        await setDoc(ref, payload);
      } else {
        // Doc ya existe — usar dot notation para serverTimestamp en campo anidado
        const update = {
          [`registros.${diaKey}.${campo}`]: serverTimestamp(),
        };
        if (gps) update[`registros.${diaKey}.${gpsKey}`] = gps;
        await updateDoc(ref, update);
      }

      setFeedback({
        tipo: 'ok',
        msg: esEntrada ? '✓ Entrada registrada correctamente' : '✓ Salida registrada correctamente',
      });
    } catch (err) {
      console.error('Error marcar:', err);
      setFeedback({ tipo: 'err', msg: 'Error al registrar: ' + err.message });
    } finally {
      setMarcando(false);
    }
  }

  // Estado del botón
  const tieneEntrada = !!registroHoy?.entrada;
  const tieneSalida = !!registroHoy?.salida;
  const jornada = tieneEntrada && tieneSalida;

  let btnLabel, btnSub, btnColor, btnDisabled;
  if (jornada) {
    btnLabel = 'Jornada completa'; btnSub = 'Entrada y salida registradas';
    btnColor = '#22c55e'; btnDisabled = true;
  } else if (tieneEntrada) {
    btnLabel = 'Marcar salida'; btnSub = `Entrada: ${fmtHora(registroHoy.entrada)}`;
    btnColor = '#ef4444'; btnDisabled = false;
  } else {
    btnLabel = 'Marcar entrada'; btnSub = 'Toca para registrar tu inicio de jornada';
    btnColor = '#F59E0B'; btnDisabled = false;
  }

  // Calcular días trabajados en el mes
  const diasConRegistro = Object.values(registrosMes).filter(r => r.entrada).length;

  async function cerrarSesion() {
    await signOut(auth);
  }

  async function cambiarContrasena(e) {
    e.preventDefault();
    setPassMsg(null);
    const { actual, nueva, confirma } = passForm;
    if (!actual || !nueva || !confirma) { setPassMsg({ tipo: 'err', msg: 'Completa todos los campos.' }); return; }
    if (nueva.length < 6) { setPassMsg({ tipo: 'err', msg: 'La nueva contraseña debe tener al menos 6 caracteres.' }); return; }
    if (nueva !== confirma) { setPassMsg({ tipo: 'err', msg: 'Las contraseñas nuevas no coinciden.' }); return; }
    setPassLoading(true);
    try {
      // Reautenticar antes de cambiar contraseña (requisito Firebase)
      const credential = EmailAuthProvider.credential(user.email, actual);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, nueva);
      setPassMsg({ tipo: 'ok', msg: 'Contraseña actualizada correctamente.' });
      setPassForm({ actual: '', nueva: '', confirma: '' });
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setPassMsg({ tipo: 'err', msg: 'La contraseña actual es incorrecta.' });
      } else if (err.code === 'auth/weak-password') {
        setPassMsg({ tipo: 'err', msg: 'Contraseña demasiado débil. Usa al menos 6 caracteres.' });
      } else {
        setPassMsg({ tipo: 'err', msg: 'Error al cambiar contraseña. Intenta de nuevo.' });
      }
    } finally {
      setPassLoading(false);
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
          --surface2: #222222;
          --border:   #2e2e2e;
          --accent:   #F59E0B;
          --accent-d: #D97706;
          --green:    #22c55e;
          --red:      #ef4444;
          --text:     #f5f5f5;
          --text-2:   #a0a0a0;
          --text-3:   #555555;
          --sans:     'Sora', sans-serif;
          --mono:     'IBM Plex Mono', monospace;
          --safe-bot: env(safe-area-inset-bottom, 0px);
        }

        html, body { height: 100%; }

        body {
          font-family: var(--sans);
          background: var(--bg);
          color: var(--text);
          -webkit-font-smoothing: antialiased;
          overscroll-behavior: none;
        }

        .app {
          max-width: 480px;
          margin: 0 auto;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        /* ── TOPBAR ── */
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px 12px;
          position: sticky;
          top: 0;
          background: rgba(15,15,15,0.9);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          z-index: 10;
          border-bottom: 1px solid var(--border);
        }
        .topbar-brand {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .brand-dot {
          width: 8px; height: 8px;
          background: var(--accent);
          border-radius: 50%;
          box-shadow: 0 0 8px rgba(245,158,11,0.6);
        }
        .brand-name {
          font-size: 13px;
          font-weight: 700;
          color: var(--text);
          letter-spacing: 0.2px;
        }
        .topbar-actions { display: flex; align-items: center; gap: 8px; }
        .btn-logout {
          background: none;
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-3);
          font-family: var(--sans);
          font-size: 12px;
          padding: 6px 10px;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .btn-logout:hover { color: var(--text-2); border-color: var(--text-3); }
        .btn-back {
          background: rgba(245,158,11,0.1);
          border: 1px solid rgba(245,158,11,0.3);
          border-radius: 8px;
          color: var(--accent);
          font-family: var(--sans);
          font-size: 12px;
          font-weight: 600;
          padding: 6px 10px;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .btn-back:hover { background: rgba(245,158,11,0.18); border-color: rgba(245,158,11,0.5); }

        /* ── CONTENIDO ── */
        .content {
          flex: 1;
          overflow-y: auto;
          padding: 0 20px 100px;
          -webkit-overflow-scrolling: touch;
        }

        /* ── BIENVENIDA ── */
        .welcome {
          padding: 24px 0 8px;
          animation: fadeUp 0.3s ease both;
        }
        .welcome-saludo {
          font-size: 13px;
          color: var(--text-3);
          font-family: var(--mono);
          margin-bottom: 4px;
        }
        .welcome-nombre {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.5px;
          line-height: 1.2;
        }

        /* ── FECHA Y HORA ── */
        .datetime-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          margin: 16px 0;
        }
        .fecha-txt {
          font-size: 13px;
          color: var(--text-2);
          text-transform: capitalize;
        }
        .hora-txt {
          font-family: var(--mono);
          font-size: 20px;
          font-weight: 500;
          color: var(--accent);
          letter-spacing: 1px;
        }

        /* ── BOTÓN MARCAJE ── */
        .marcaje-wrap {
          margin: 8px 0 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .btn-marcaje {
          width: 200px;
          height: 200px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: transform 0.15s, box-shadow 0.2s;
          -webkit-tap-highlight-color: transparent;
          position: relative;
          overflow: hidden;
        }
        .btn-marcaje::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 50%;
          transition: opacity 0.2s;
          opacity: 0;
          background: rgba(255,255,255,0.08);
        }
        .btn-marcaje:hover:not(:disabled)::before { opacity: 1; }
        .btn-marcaje:active:not(:disabled) { transform: scale(0.95); }
        .btn-marcaje:disabled { cursor: default; }

        .btn-marcaje-icon { position: relative; z-index: 1; }
        .btn-marcaje-label {
          font-family: var(--sans);
          font-size: 15px;
          font-weight: 700;
          color: #0f0f0f;
          position: relative;
          z-index: 1;
          letter-spacing: 0.2px;
        }

        .marcaje-sub {
          font-size: 12px;
          color: var(--text-3);
          text-align: center;
          font-family: var(--mono);
          max-width: 240px;
          line-height: 1.5;
        }

        /* Ring animado mientras carga */
        .btn-marcaje.loading {
          pointer-events: none;
        }
        .ring {
          position: absolute;
          inset: -3px;
          border-radius: 50%;
          border: 3px solid transparent;
          border-top-color: rgba(15,15,15,0.4);
          animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── FEEDBACK ── */
        .feedback {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 11px 14px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 500;
          animation: fadeUp 0.2s ease both;
          margin-bottom: 4px;
        }
        .feedback.ok  { background: rgba(34,197,94,0.1);  border: 1px solid rgba(34,197,94,0.2);  color: #86efac; }
        .feedback.err { background: rgba(239,68,68,0.1);  border: 1px solid rgba(239,68,68,0.2);  color: #fca5a5; }
        .feedback.info{ background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.2); color: #fcd34d; }

        /* ── STATS MINI ── */
        .stats-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 20px;
        }
        .stat-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 12px 14px;
          animation: fadeUp 0.3s ease both;
        }
        .stat-lbl {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: var(--text-3);
          margin-bottom: 5px;
        }
        .stat-val {
          font-family: var(--mono);
          font-size: 17px;
          font-weight: 500;
          color: var(--text);
        }
        .stat-val.accent { color: var(--accent); }
        .stat-val.green  { color: var(--green); }

        /* ── REGISTRO HOY ── */
        .hoy-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 20px;
          animation: fadeUp 0.35s ease both;
        }
        .hoy-title {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--text-3);
          margin-bottom: 12px;
        }
        .hoy-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid var(--border);
        }
        .hoy-row:last-child { border-bottom: none; }
        .hoy-key { font-size: 13px; color: var(--text-2); }
        .hoy-val {
          font-family: var(--mono);
          font-size: 14px;
          font-weight: 500;
          color: var(--text);
        }
        .hoy-val.pending { color: var(--text-3); font-style: italic; font-family: var(--sans); font-size: 12px; }
        .hoy-val.green   { color: var(--green); }
        .hoy-val.accent  { color: var(--accent); }

        /* ── TABLA ASISTENCIA MES ── */
        .mes-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 0 12px;
        }
        .mes-title {
          font-size: 16px;
          font-weight: 700;
          letter-spacing: -0.3px;
        }
        .mes-badge {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--accent);
          background: rgba(245,158,11,0.08);
          border: 1px solid rgba(245,158,11,0.2);
          border-radius: 6px;
          padding: 3px 8px;
        }

        .tabla-asistencia {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 20px;
        }
        .tabla-head {
          display: grid;
          grid-template-columns: 44px 1fr 1fr 72px;
          padding: 8px 16px;
          background: var(--surface2);
          border-bottom: 1px solid var(--border);
        }
        .th {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: var(--text-3);
        }
        .th:not(:first-child) { text-align: center; }

        .tabla-row {
          display: grid;
          grid-template-columns: 44px 1fr 1fr 72px;
          padding: 9px 16px;
          border-bottom: 1px solid rgba(46,46,46,0.5);
          align-items: center;
          transition: background 0.1s;
        }
        .tabla-row:last-child { border-bottom: none; }
        .tabla-row:hover { background: var(--surface2); }
        .tabla-row.hoy-row-highlight { background: rgba(245,158,11,0.04); border-left: 2px solid var(--accent); }

        .td-dia {
          font-family: var(--mono);
          font-size: 13px;
          color: var(--text-2);
        }
        .td-hora {
          font-family: var(--mono);
          font-size: 13px;
          text-align: center;
          color: var(--text);
        }
        .td-hora.empty { color: var(--text-3); }
        .td-horas {
          font-family: var(--mono);
          font-size: 12px;
          text-align: center;
          color: var(--green);
        }
        .td-horas.empty { color: var(--text-3); }

        /* ── LIQUIDACIONES ── */
        .liq-list { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
        .liq-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          transition: border-color 0.15s;
        }
        .liq-card:hover { border-color: var(--accent); }
        .liq-periodo {
          font-size: 14px;
          font-weight: 600;
          color: var(--text);
        }
        .liq-monto {
          font-family: var(--mono);
          font-size: 13px;
          color: var(--accent);
        }
        .liq-empty {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-3);
          font-size: 13px;
          font-family: var(--mono);
        }

        /* ── TAB BAR ── */
        .tabbar {
          position: fixed;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 100%;
          max-width: 480px;
          background: rgba(20,20,20,0.95);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-top: 1px solid var(--border);
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          padding-bottom: var(--safe-bot);
          z-index: 20;
        }
        .tab-btn {
          background: none;
          border: none;
          color: var(--text-3);
          padding: 12px 8px 10px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          transition: color 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .tab-btn.active { color: var(--accent); }
        .tab-btn svg { flex-shrink: 0; }
        .tab-lbl {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        @keyframes fadeUp {
          from { opacity:0; transform: translateY(10px); }
          to   { opacity:1; transform: translateY(0); }
        }

        /* ── CUENTA ── */
        .cuenta-section { padding: 20px 0; }
        .cuenta-titulo {
          font-size: 16px; font-weight: 700;
          letter-spacing: -0.3px; margin-bottom: 4px;
        }
        .cuenta-sub { font-size: 12px; color: var(--text-3); margin-bottom: 24px; font-family: var(--mono); }

        .pass-field { margin-bottom: 14px; }
        .pass-label {
          display: block; font-size: 10px; font-weight: 600;
          letter-spacing: 1.5px; text-transform: uppercase;
          color: var(--text-3); margin-bottom: 6px;
        }
        .pass-input {
          width: 100%; background: var(--surface);
          border: 1.5px solid var(--border); border-radius: 10px;
          color: var(--text); font-family: var(--mono);
          font-size: 15px; padding: 12px 14px; outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          -webkit-appearance: none;
        }
        .pass-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(245,158,11,0.12);
        }
        .btn-pass {
          width: 100%; background: var(--accent); color: #0f0f0f;
          border: none; border-radius: 10px; font-family: var(--sans);
          font-size: 14px; font-weight: 700; padding: 13px;
          cursor: pointer; margin-top: 6px;
          transition: background 0.15s, box-shadow 0.15s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .btn-pass:hover:not(:disabled) {
          background: var(--accent-d);
          box-shadow: 0 4px 16px rgba(245,158,11,0.25);
        }
        .btn-pass:disabled { opacity: 0.5; cursor: not-allowed; }

        .cuenta-info-card {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 12px; padding: 16px; margin-bottom: 20px;
        }
        .ci-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 7px 0; border-bottom: 1px solid rgba(46,46,46,0.5);
        }
        .ci-row:last-child { border-bottom: none; }
        .ci-key { font-size: 12px; color: var(--text-3); }
        .ci-val { font-family: var(--mono); font-size: 12px; color: var(--text-2); }
        .content::-webkit-scrollbar { display: none; }
        .content { -ms-overflow-style: none; scrollbar-width: none; }

        /* Icono de calendario visible en modo oscuro */
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(1);
          cursor: pointer;
        }
      `}</style>

      <div className="app">

        {/* TOPBAR */}
        <div className="topbar">
          <div className="topbar-brand">
            <div className="brand-dot" />
            <span className="brand-name">FleetCore · Portal</span>
          </div>
          <div className="topbar-actions">
            {!/(@trabajador\.app|@mpf\.cl)$/i.test(user?.email || '') && (
              <button className="btn-back" onClick={() => { window.location.href = '/'; }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></svg>
                Volver
              </button>
            )}
            <button className="btn-logout" onClick={cerrarSesion}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" /></svg>
              Salir
            </button>
          </div>
        </div>

        {/* CONTENIDO */}
        {isRevoked ? (
          <div className="content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: 20 }}>
            <div className="hoy-card" style={{ width: '100%', textAlign: 'center', padding: '40px 24px', border: '1px solid var(--red)' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'rgba(239,68,68,0.1)',
                marginBottom: 20,
                border: '1.5px solid rgba(239,68,68,0.2)'
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', marginBottom: 12, letterSpacing: '-0.3px' }}>
                Acceso Revocado
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.6', marginBottom: 24 }}>
                Tu relación contractual o estado administrativo ha sido registrado como <strong>{trabajadorInfo?.estado === 'finiquitado' ? 'Finiquitado' : 'Inactivo'}</strong>. Por motivos de seguridad y de conformidad con las políticas de la empresa, se han revocado tus permisos de portal y firma de documentos.
              </p>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                <p style={{ fontSize: '11px', color: 'var(--text-3)', lineHeight: '1.5' }}>
                  Si crees que esto es un error, por favor contacta al departamento de Recursos Humanos de {trabajadorInfo?.empresa || 'la empresa'}.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="content">

          {/* ── TAB HOME ── */}
          {tab === 'home' && (
            <>
              <div className="welcome">
                <div className="welcome-saludo">
                  {horaActual.getHours() < 12 ? 'Buenos días,' : horaActual.getHours() < 19 ? 'Buenas tardes,' : 'Buenas noches,'}
                </div>
                <div className="welcome-nombre">{nombre}</div>
              </div>

              {/* Fecha y hora */}
              <div className="datetime-row">
                <span className="fecha-txt">
                  {['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][horaActual.getDay()]},&nbsp;
                  {horaActual.getDate()} de {MESES[horaActual.getMonth()]}
                </span>
                <span className="hora-txt">
                  {fmt2(horaActual.getHours())}:{fmt2(horaActual.getMinutes())}:{fmt2(horaActual.getSeconds())}
                </span>
              </div>

              {/* BOTÓN MARCAJE */}
              <div className="marcaje-wrap">
                <button
                  className={`btn-marcaje${marcando ? ' loading' : ''}`}
                  style={{ background: btnColor, boxShadow: `0 0 40px ${btnColor}40, 0 8px 32px ${btnColor}30` }}
                  onClick={marcar}
                  disabled={btnDisabled || marcando}
                >
                  {marcando && <div className="ring" />}
                  <div className="btn-marcaje-icon">
                    {jornada ? (
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0f0f0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    ) : tieneEntrada ? (
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0f0f0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                    ) : (
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0f0f0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                        <polyline points="10 17 15 12 10 7" />
                        <line x1="15" y1="12" x2="3" y2="12" />
                      </svg>
                    )}
                  </div>
                  <span className="btn-marcaje-label">
                    {marcando ? 'Registrando...' : btnLabel}
                  </span>
                </button>
                <span className="marcaje-sub">{btnSub}</span>
              </div>

              {/* Feedback */}
              {feedback && (
                <div className={`feedback ${feedback.tipo}`}>
                  {feedback.tipo === 'ok' && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>}
                  {feedback.tipo === 'err' && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
                  {feedback.tipo === 'info' && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>}
                  {feedback.msg}
                </div>
              )}

              {/* Stats rápidas */}
              <div className="stats-row">
                <div className="stat-card">
                  <div className="stat-lbl">Días</div>
                  <div className="stat-val accent">{diasConRegistro}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-lbl">Entrada hoy</div>
                  <div className="stat-val">{registroHoy?.entrada ? fmtHora(registroHoy.entrada) : '—'}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-lbl">Salida hoy</div>
                  <div className="stat-val green">{registroHoy?.salida ? fmtHora(registroHoy.salida) : '—'}</div>
                </div>
              </div>

              {/* Registro de hoy */}
              <div className="hoy-card">
                <div className="hoy-title">Registro de hoy — {fmt2(dia)}/{fmt2(mes + 1)}/{anio}</div>
                <div className="hoy-row">
                  <span className="hoy-key">Entrada</span>
                  <span className={`hoy-val ${registroHoy?.entrada ? 'accent' : 'pending'}`}>
                    {registroHoy?.entrada ? fmtHora(registroHoy.entrada) : 'Pendiente'}
                  </span>
                </div>
                <div className="hoy-row">
                  <span className="hoy-key">Salida</span>
                  <span className={`hoy-val ${registroHoy?.salida ? 'green' : 'pending'}`}>
                    {registroHoy?.salida ? fmtHora(registroHoy.salida) : 'Pendiente'}
                  </span>
                </div>
                <div className="hoy-row">
                  <span className="hoy-key">Horas trabajadas</span>
                  <span className={`hoy-val ${registroHoy?.salida ? 'green' : 'pending'}`}>
                    {registroHoy?.entrada && registroHoy?.salida
                      ? diffHoras(registroHoy.entrada, registroHoy.salida)
                      : '—'
                    }
                  </span>
                </div>
              </div>
            </>
          )}

          {/* ── TAB ASISTENCIA ── */}
          {tab === 'asistencia' && (
            <>
              <div className="mes-header">
                <span className="mes-title">{MESES[mes]} {anio}</span>
                <span className="mes-badge">{diasConRegistro} días</span>
              </div>

              <div className="tabla-asistencia">
                <div className="tabla-head">
                  <span className="th">Día</span>
                  <span className="th" style={{ textAlign: 'center' }}>Entrada</span>
                  <span className="th" style={{ textAlign: 'center' }}>Salida</span>
                  <span className="th" style={{ textAlign: 'center' }}>Horas</span>
                </div>
                {Array.from({ length: dia }, (_, i) => {
                  const d = fmt2(i + 1);
                  const r = registrosMes[d];
                  const esHoy = (i + 1) === dia;
                  return (
                    <div key={d} className={`tabla-row${esHoy ? ' hoy-row-highlight' : ''}`}>
                      <span className="td-dia">{d}</span>
                      <span className={`td-hora ${r?.entrada ? '' : 'empty'}`}>{r?.entrada ? fmtHora(r.entrada) : '—'}</span>
                      <span className={`td-hora ${r?.salida ? '' : 'empty'}`}>{r?.salida ? fmtHora(r.salida) : '—'}</span>
                      <span className={`td-horas ${r?.entrada && r?.salida ? '' : 'empty'}`}>
                        {r?.entrada && r?.salida ? diffHoras(r.entrada, r.salida) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── TAB DOCS ── */}
          {tab === 'docs' && (
            <>
              <div className="mes-header">
                <span className="mes-title">Mis documentos</span>
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 10 }}>Liquidaciones</div>
                {loadingLiqs ? (
                  <div className="liq-empty">Cargando...</div>
                ) : liquidaciones.length === 0 ? (
                  <div className="liq-empty">No hay liquidaciones disponibles</div>
                ) : (
                  <div className="liq-list">
                    {liquidaciones.map(l => (
                      <div key={l.id} className="liq-card">
                        <div>
                          <div className="liq-periodo">{MESES[(l.mes || 1) - 1]} {l.anio}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, fontFamily: 'var(--mono)' }}>
                            {l.empresa || trabajadorInfo?.empresa || ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="liq-monto">${(l._calc?.liquido || 0).toLocaleString('es-CL')}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── TAB VACACIONES ── */}
          {tab === 'vacaciones' && (
            <>
              <div className="mes-header">
                <span className="mes-title">Mis Vacaciones</span>
              </div>

              {!trabajadorInfo?.id ? (
                <div style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--red)',
                  borderRadius: '12px',
                  padding: '24px 20px',
                  textAlign: 'center',
                  marginTop: '16px'
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2.5" style={{ marginBottom: '12px' }}>
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text)', marginBottom: '8px' }}>
                    Sin perfil de trabajador vinculado
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-2)', lineHeight: '1.6' }}>
                    Esta cuenta de usuario no está asociada a una ficha de trabajador activa en la empresa.
                    Para poder solicitar vacaciones, un administrador debe vincular tu correo desde el panel de RRHH sección Trabajadores.
                  </div>
                </div>
              ) : (
                <>

                  {/* Saldo de vacaciones y resúmenes */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '12px',
                    marginBottom: '20px'
                  }}>
                    <div style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '14px 16px'
                    }}>
                      <div style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        color: 'var(--text-3)',
                        marginBottom: '5px'
                      }}>Días Disponibles</div>
                      <div style={{
                        fontFamily: 'var(--mono)',
                        fontSize: '24px',
                        fontWeight: 'bold',
                        color: 'var(--accent)'
                      }}>{(trabajadorInfo?.diasVacacionesDisponibles ?? 15.0).toFixed(1)}</div>
                    </div>
                    <div style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '14px 16px'
                    }}>
                      <div style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        color: 'var(--text-3)',
                        marginBottom: '5px'
                      }}>Por Autorizar</div>
                      <div style={{
                        fontFamily: 'var(--mono)',
                        fontSize: '24px',
                        fontWeight: 'bold',
                        color: 'var(--text)'
                      }}>{solicitudesVacaciones.filter(s => s.estado === 'pendiente').reduce((sum, s) => sum + s.diasSolicitados, 0)}</div>
                    </div>
                  </div>

                  {/* Formulario de solicitud */}
                  <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '18px',
                    marginBottom: '24px'
                  }}>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                      color: 'var(--text-2)',
                      marginBottom: '16px'
                    }}>Solicitar Vacaciones</div>

                    <form onSubmit={solicitarVacacion} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={{
                            display: 'block',
                            fontSize: '10px',
                            fontWeight: 600,
                            letterSpacing: '1px',
                            textTransform: 'uppercase',
                            color: 'var(--text-3)',
                            marginBottom: '6px'
                          }}>Desde</label>
                          <input
                            type="date"
                            className="pass-input"
                            style={{ padding: '10px 12px', fontSize: '13px' }}
                            value={vacDesde}
                            onChange={e => { setVacDesde(e.target.value); setVacFeedback(null); }}
                          />
                        </div>
                        <div>
                          <label style={{
                            display: 'block',
                            fontSize: '10px',
                            fontWeight: 600,
                            letterSpacing: '1px',
                            textTransform: 'uppercase',
                            color: 'var(--text-3)',
                            marginBottom: '6px'
                          }}>Hasta</label>
                          <input
                            type="date"
                            className="pass-input"
                            style={{ padding: '10px 12px', fontSize: '13px' }}
                            value={vacHasta}
                            onChange={e => { setVacHasta(e.target.value); setVacFeedback(null); }}
                          />
                        </div>
                      </div>

                      {vacDesde && vacHasta && (
                        <div style={{
                          padding: '12px 14px',
                          background: 'rgba(245, 158, 11, 0.04)',
                          border: '1px solid rgba(245, 158, 11, 0.15)',
                          borderRadius: '10px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '12px'
                        }}>
                          <div>
                            <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', tracking: '0.5px' }}>Días Hábiles</span>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent)' }}>{calcularDiasHabiles(vacDesde, vacHasta)} días</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', tracking: '0.5px' }}>Saldo Proyectado</span>
                            <span style={{
                              fontSize: '14px',
                              fontWeight: 700,
                              color: ((trabajadorInfo?.diasVacacionesDisponibles ?? 15.0) - calcularDiasHabiles(vacDesde, vacHasta)) < 0 ? 'var(--red)' : 'var(--text)'
                            }}>
                              {((trabajadorInfo?.diasVacacionesDisponibles ?? 15.0) - calcularDiasHabiles(vacDesde, vacHasta)).toFixed(1)} días
                            </span>
                          </div>
                        </div>
                      )}

                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '10px',
                          fontWeight: 600,
                          letterSpacing: '1px',
                          textTransform: 'uppercase',
                          color: 'var(--text-3)',
                          marginBottom: '6px'
                        }}>Observaciones</label>
                        <textarea
                          className="pass-input"
                          style={{ padding: '10px 12px', fontSize: '13px', resize: 'none', height: '64px', fontFamily: 'var(--sans)' }}
                          placeholder="Ej: Vacaciones de invierno."
                          value={vacObs}
                          onChange={e => setVacObs(e.target.value)}
                        />
                      </div>

                      {vacFeedback && (
                        <div className={`feedback ${vacFeedback.tipo}`} style={{ marginBottom: 0 }}>
                          {vacFeedback.tipo === 'ok'
                            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                          }
                          {vacFeedback.msg}
                        </div>
                      )}

                      <button className="btn-pass" type="submit" disabled={vacEnviando} style={{ marginTop: '4px' }}>
                        {vacEnviando
                          ? 'Enviando...'
                          : <>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                            Enviar Solicitud
                          </>
                        }
                      </button>
                    </form>
                  </div>

                  {/* Historial de solicitudes */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      letterSpacing: '1.5px',
                      textTransform: 'uppercase',
                      color: 'var(--text-3)',
                      marginBottom: '10px'
                    }}>Historial de solicitudes</div>

                    {solicitudesVacaciones.length === 0 ? (
                      <div style={{
                        textAlign: 'center',
                        padding: '30px 20px',
                        color: 'var(--text-3)',
                        fontSize: '13px',
                        fontFamily: 'var(--mono)',
                        border: '1px dashed var(--border)',
                        borderRadius: '12px'
                      }}>No tienes solicitudes anteriores</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {solicitudesVacaciones.map(v => {
                          let badgeStyle = {
                            fontSize: '10px',
                            fontWeight: '700',
                            textTransform: 'uppercase',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            color: 'var(--text-3)',
                            background: 'rgba(255,255,255,0.02)'
                          };
                          if (v.estado === 'pendiente') {
                            badgeStyle = {
                              fontSize: '10px',
                              fontWeight: '700',
                              textTransform: 'uppercase',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              color: '#fcd34d',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                              background: 'rgba(245, 158, 11, 0.08)'
                            };
                          } else if (v.estado === 'aprobado') {
                            badgeStyle = {
                              fontSize: '10px',
                              fontWeight: '700',
                              textTransform: 'uppercase',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              color: '#86efac',
                              border: '1px solid rgba(34, 197, 94, 0.3)',
                              background: 'rgba(34, 197, 94, 0.08)'
                            };
                          } else if (v.estado === 'rechazado') {
                            badgeStyle = {
                              fontSize: '10px',
                              fontWeight: '700',
                              textTransform: 'uppercase',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              color: '#fca5a5',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              background: 'rgba(239, 68, 68, 0.08)'
                            };
                          }

                          return (
                            <div key={v.id} style={{
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: '12px',
                              padding: '14px 16px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '12px'
                            }}>
                              <div>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>
                                  Del {fmtFechaString(v.desde)} al {fmtFechaString(v.hasta)}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>
                                  {v.diasSolicitados} {v.diasSolicitados === 1 ? 'día hábil' : 'días hábiles'}
                                  {v.observaciones && ` • "${v.observaciones}"`}
                                </div>
                              </div>
                              <span style={badgeStyle}>{v.estado}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── TAB CUENTA ── */}
          {tab === 'cuenta' && (
            <div className="cuenta-section">
              <div className="cuenta-titulo">Mi cuenta</div>
              <div className="cuenta-sub">{user.email}</div>

              {/* Info de sesión */}
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 10 }}>
                Información
              </div>
              <div className="cuenta-info-card">
                <div className="ci-row">
                  <span className="ci-key">Nombre</span>
                  <span className="ci-val">{nombre}</span>
                </div>
                <div className="ci-row">
                  <span className="ci-key">RUT</span>
                  <span className="ci-val">{trabajadorInfo?.rut || user.email.replace(/@(trabajador\.app|mpf\.cl)$/, '')}</span>
                </div>
                <div className="ci-row">
                  <span className="ci-key">Empresa</span>
                  <span className="ci-val">{trabajadorInfo?.empresa || '—'}</span>
                </div>
                <div className="ci-row">
                  <span className="ci-key">Cargo</span>
                  <span className="ci-val">{trabajadorInfo?.cargo || '—'}</span>
                </div>
              </div>

              {/* Cambiar contraseña */}
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 10, marginTop: 24 }}>
                Cambiar contraseña
              </div>

              <form onSubmit={cambiarContrasena} noValidate>
                <div className="pass-field">
                  <label className="pass-label">Contraseña actual</label>
                  <input className="pass-input" type="password" placeholder="••••••••"
                    value={passForm.actual}
                    onChange={e => setPassForm(f => ({ ...f, actual: e.target.value }))}
                    autoComplete="current-password"
                  />
                </div>
                <div className="pass-field">
                  <label className="pass-label">Nueva contraseña</label>
                  <input className="pass-input" type="password" placeholder="Mínimo 6 caracteres"
                    value={passForm.nueva}
                    onChange={e => setPassForm(f => ({ ...f, nueva: e.target.value }))}
                    autoComplete="new-password"
                  />
                </div>
                <div className="pass-field">
                  <label className="pass-label">Confirmar nueva contraseña</label>
                  <input className="pass-input" type="password" placeholder="Repite la nueva contraseña"
                    value={passForm.confirma}
                    onChange={e => setPassForm(f => ({ ...f, confirma: e.target.value }))}
                    autoComplete="new-password"
                  />
                </div>

                {passMsg && (
                  <div className={`feedback ${passMsg.tipo}`} style={{ marginBottom: 12 }}>
                    {passMsg.tipo === 'ok'
                      ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                      : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    }
                    {passMsg.msg}
                  </div>
                )}

                <button className="btn-pass" type="submit" disabled={passLoading}>
                  {passLoading
                    ? <><div className="spinner" />Actualizando...</>
                    : <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                      Cambiar contraseña
                    </>
                  }
                </button>
              </form>

              {/* Cerrar sesión */}
              <button
                onClick={cerrarSesion}
                style={{
                  width: '100%', marginTop: 24, background: 'none',
                  border: '1px solid var(--border)', borderRadius: 10,
                  color: 'var(--text-3)', fontFamily: 'var(--sans)',
                  fontSize: 14, fontWeight: 600, padding: 12,
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8, transition: 'border-color 0.15s, color 0.15s'
                }}
                onMouseEnter={e => { e.target.style.borderColor = 'var(--red)'; e.target.style.color = 'var(--red)'; }}
                onMouseLeave={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.color = 'var(--text-3)'; }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                Cerrar sesión
              </button>
            </div>
          )}

        </div>{/* /content */}

        {/* TAB BAR */}
        <div className="tabbar">
          <button className={`tab-btn ${tab === 'home' ? 'active' : ''}`} onClick={() => setTab('home')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={tab === 'home' ? 2.5 : 2}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
            <span className="tab-lbl">Inicio</span>
          </button>
          <button className={`tab-btn ${tab === 'asistencia' ? 'active' : ''}`} onClick={() => setTab('asistencia')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={tab === 'asistencia' ? 2.5 : 2}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            <span className="tab-lbl">Asistencia</span>
          </button>
          <button className={`tab-btn ${tab === 'docs' ? 'active' : ''}`} onClick={() => setTab('docs')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={tab === 'docs' ? 2.5 : 2}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
            <span className="tab-lbl">Documentos</span>
          </button>
          <button className={`tab-btn ${tab === 'vacaciones' ? 'active' : ''}`} onClick={() => setTab('vacaciones')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={tab === 'vacaciones' ? 2.5 : 2}><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" /></svg>
            <span className="tab-lbl">Vacaciones</span>
          </button>
          <button className={`tab-btn ${tab === 'cuenta' ? 'active' : ''}`} onClick={() => setTab('cuenta')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={tab === 'cuenta' ? 2.5 : 2}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            <span className="tab-lbl">Cuenta</span>
          </button>
        </div>
          </>
        )}

      </div>
    </>
  );
}
