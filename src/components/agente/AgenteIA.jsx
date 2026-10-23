/**
 * AgenteIA.jsx — Botón flotante + panel de chat del asistente, por texto o voz.
 *
 * Voz:
 *   - Dictado con la Web Speech API del navegador (Chrome/Edge/Android y
 *     Safari reciente). Donde no existe, el botón de micrófono no aparece.
 *   - Lectura en voz alta con speechSynthesis, activable desde el panel.
 *     Si el mensaje se dictó, la respuesta se lee aunque esté apagada.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEmpresa } from '../../lib/useEmpresa';
import { useUserRole } from '../../lib/useUserRole';
import { useAgente } from '../../lib/agente/useAgente';

const Reconocimiento = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

const EJEMPLOS = [
  '¿Qué hay para hoy?',
  '¿Cómo viene la caja las próximas semanas?',
  'Ayúdame a armar el flujo de caja del próximo mes',
  '¿Puedo pagar 15 millones esta semana?',
  '¿Cuánto combustible se entregó esta semana?',
];

function leerEnVozAlta(texto) {
  if (!('speechSynthesis' in window)) return;
  const limpio = texto.replace(/[*_#`>]/g, '').replace(/^\s*-\s*/gm, '');
  const frase = new SpeechSynthesisUtterance(limpio);
  frase.lang = 'es-CL';
  const voz = window.speechSynthesis.getVoices().find(v => v.lang?.startsWith('es'));
  if (voz) frase.voice = voz;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(frase);
}

function useDictado(alTerminar) {
  const [escuchando, setEscuchando] = useState(false);
  const [parcial, setParcial] = useState('');
  const recRef = useRef(null);

  const detener = useCallback(() => recRef.current?.stop(), []);

  const iniciar = useCallback(() => {
    if (!Reconocimiento || recRef.current) return;
    window.speechSynthesis?.cancel();
    const rec = new Reconocimiento();
    rec.lang = 'es-CL';
    rec.interimResults = true;
    rec.continuous = false;
    let final = '';

    rec.onresult = (e) => {
      let provisional = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t; else provisional += t;
      }
      setParcial((final + provisional).trim());
    };
    rec.onerror = () => { final = ''; };
    rec.onend = () => {
      recRef.current = null;
      setEscuchando(false);
      setParcial('');
      if (final.trim()) alTerminar(final.trim());
    };

    recRef.current = rec;
    setEscuchando(true);
    rec.start();
  }, [alTerminar]);

  useEffect(() => () => recRef.current?.abort(), []);

  return { disponible: !!Reconocimiento, escuchando, parcial, iniciar, detener };
}

export default function AgenteIA() {
  const { empresaId, empresa } = useEmpresa();
  const { role } = useUserRole();
  const navigate = useNavigate();
  const location = useLocation();

  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [vozActiva, setVozActiva] = useState(() => {
    try { return localStorage.getItem('agenteIA:voz') === '1'; } catch { return false; }
  });
  const dictadoRef = useRef(false);
  const finRef = useRef(null);

  const alResponder = useCallback((respuesta) => {
    if (vozActiva || dictadoRef.current) leerEnVozAlta(respuesta);
    dictadoRef.current = false;
  }, [vozActiva]);

  const agente = useAgente({
    empresaId,
    empresaNombre: empresa?.nombre,
    rol: role,
    navigate,
    pantalla: location.pathname,
    alResponder,
  });

  const enviarDictado = useCallback((t) => {
    dictadoRef.current = true;
    agente.enviar(t);
  }, [agente.enviar]); // eslint-disable-line react-hooks/exhaustive-deps

  const dictado = useDictado(enviarDictado);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agente.vista, agente.estado, agente.confirmacion, abierto]);

  const cambiarVoz = () => {
    const nuevo = !vozActiva;
    setVozActiva(nuevo);
    if (!nuevo) window.speechSynthesis?.cancel();
    try { localStorage.setItem('agenteIA:voz', nuevo ? '1' : '0'); } catch { /* sin almacenamiento */ }
  };

  const enviarTexto = (e) => {
    e.preventDefault();
    if (!texto.trim() || agente.trabajando) return;
    agente.enviar(texto);
    setTexto('');
  };

  if (!empresaId) return null;

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="fixed bottom-20 right-4 sm:bottom-5 sm:right-5 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-xl hover:scale-105 active:scale-95 transition-transform flex items-center justify-center"
        title="Asistente IA"
        aria-label="Abrir asistente IA"
      >
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 sm:inset-auto sm:bottom-5 sm:right-5 z-[60] sm:w-[400px] sm:h-[600px] sm:max-h-[85vh] bg-white sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
      {/* Encabezado */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-4 py-3 flex items-center gap-2 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <p className="font-semibold leading-tight">Asistente FleetCore</p>
          <p className="text-xs text-white/80 truncate">{empresa?.nombre || 'Tu empresa'}</p>
        </div>
        <button onClick={cambiarVoz} className={`p-2 rounded-lg ${vozActiva ? 'bg-white/25' : 'hover:bg-white/15'}`} title={vozActiva ? 'Silenciar respuestas' : 'Leer respuestas en voz alta'}>
          {vozActiva ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
          )}
        </button>
        <button onClick={agente.reiniciar} disabled={agente.trabajando} className="p-2 rounded-lg hover:bg-white/15 disabled:opacity-40" title="Nueva conversación">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
        </button>
        <button onClick={() => { setAbierto(false); window.speechSynthesis?.cancel(); }} className="p-2 rounded-lg hover:bg-white/15" title="Cerrar">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {agente.desactualizado && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-xs text-amber-900 flex items-center gap-2 flex-shrink-0">
          <span className="flex-1">Hay una versión nueva del asistente con más funciones.</span>
          <button onClick={() => window.location.reload()} className="bg-amber-600 hover:bg-amber-700 text-white rounded-md px-2.5 py-1 font-medium">Recargar</button>
        </div>
      )}

      {/* Conversación */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 bg-slate-50">
        {agente.vista.length === 0 && (
          <div className="text-center text-slate-500 text-sm px-4 pt-6">
            <p className="font-medium text-slate-700 mb-1">¿En qué te ayudo?</p>
            <p className="mb-4">Escribe o toca el micrófono y habla. Reviso datos, armo y ajusto el flujo de caja, te doy mi opinión y hago cambios con tu confirmación.</p>
            <div className="space-y-2">
              {EJEMPLOS.map(ej => (
                <button key={ej} onClick={() => agente.enviar(ej)} className="block w-full text-left text-sm bg-white border border-slate-200 rounded-xl px-3 py-2 hover:border-indigo-300 hover:bg-indigo-50">
                  {ej}
                </button>
              ))}
            </div>
          </div>
        )}

        {agente.vista.map((b, i) => {
          if (b.de === 'usuario') {
            return <div key={i} className="ml-10 bg-indigo-600 text-white rounded-2xl rounded-br-sm px-3 py-2 text-sm whitespace-pre-wrap">{b.texto}</div>;
          }
          if (b.de === 'agente') {
            return <div key={i} className="mr-10 bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-bl-sm px-3 py-2 text-sm whitespace-pre-wrap">{b.texto}</div>;
          }
          if (b.de === 'accion') {
            return <div key={i} className="text-xs text-center text-slate-500">{b.texto}</div>;
          }
          return <div key={i} className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-sm">{b.texto}</div>;
        })}

        {agente.confirmacion && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-sm">
            <p className="font-semibold text-amber-900 mb-1">¿Confirmas esta acción?</p>
            <p className="text-amber-900 mb-3 whitespace-pre-wrap max-h-48 overflow-y-auto">{agente.confirmacion.descripcion}</p>
            <div className="flex gap-2">
              <button onClick={() => agente.responderConfirmacion(true)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2 font-medium">Confirmar</button>
              <button onClick={() => agente.responderConfirmacion(false)} className="flex-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg py-2 font-medium">Cancelar</button>
            </div>
          </div>
        )}

        {agente.trabajando && !agente.confirmacion && (
          <div className="flex items-center gap-2 text-xs text-slate-500 px-1">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            {agente.estado || 'Pensando…'}
          </div>
        )}
        <div ref={finRef} />
      </div>

      {/* Entrada */}
      <form onSubmit={enviarTexto} className="border-t border-slate-200 p-2 flex items-center gap-2 flex-shrink-0 bg-white">
        {dictado.disponible && (
          <button
            type="button"
            onClick={dictado.escuchando ? dictado.detener : dictado.iniciar}
            disabled={agente.trabajando && !dictado.escuchando}
            className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 ${dictado.escuchando ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            title={dictado.escuchando ? 'Detener' : 'Hablar'}
            aria-label={dictado.escuchando ? 'Detener dictado' : 'Hablar'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>
          </button>
        )}
        <input
          value={dictado.escuchando ? dictado.parcial : texto}
          onChange={e => setTexto(e.target.value)}
          placeholder={dictado.escuchando ? 'Te escucho…' : 'Escribe una instrucción…'}
          disabled={dictado.escuchando}
          className="flex-1 min-w-0 border border-slate-300 rounded-full px-4 py-2.5 text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <button
          type="submit"
          disabled={!texto.trim() || agente.trabajando}
          className="w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          aria-label="Enviar"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
        </button>
      </form>
    </div>
  );
}
