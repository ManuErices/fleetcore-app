import React, { useState, useCallback } from "react";
import { formatMiles } from '../../../utils/formatters';
import { matchWorker, matchMachine, shortName } from '../../../utils/searchHelpers';
import { PillButton } from "../../../components/ui/PillButton";
import { useKeyboardAvoidingView } from "../../../hooks/useKeyboardAvoidingView";

const incrementDocNumber = (numStr) => {
  if (!numStr) return '';
  const match = numStr.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const num = parseInt(match[2], 10);
    const length = match[2].length;
    const nextNum = (num + 1).toString().padStart(length, '0');
    return prefix + nextNum;
  }
  const parsed = parseInt(numStr, 10);
  if (!isNaN(parsed)) {
    return (parsed + 1).toString();
  }
  return numStr;
};


const SearchIcon = () => (
  <svg className="w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
  </svg>
);

const TruckIcon = () => (
  <svg className="w-4 h-4 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
    <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
    <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-.84.45L12.17 9H11V7h-1v8.05A2.5 2.5 0 0112.95 17H14a1 1 0 001-1v-5h1a1 1 0 00.82-1.57l-2-3A1 1 0 0014 7z" />
  </svg>
);

const PersonIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
  </svg>
);

export default function EntradaStep({
  datosEntrada, setDatosEntrada,
  datosControl,
  isAdmin, currentUserData,
  machinesLocal,
  trabajadoresLocales,
  esMPF,
  setShowModalMaquina, setNuevaMaquinaData,
  setShowModalEmpleado, setNuevoEmpleadoData,
  handleSubmit, loading,
  setPaso,
}) {
  const [emailInput, setEmailInput] = useState('');
  const [searchReceptor, setSearchReceptor] = useState('');
  const [searchMaquina, setSearchMaquina] = useState('');
  const [validationErrors, setValidationErrors] = useState([]);

  useKeyboardAvoidingView();

  const isEstacion = datosEntrada.tipoOrigen === 'estacion';
  const firstValidRow = (datosEntrada.documentosEstacion || []).find(r => parseFloat(r.cantidad) > 0 && parseFloat(r.total) > 0);
  const precioPorLitro = firstValidRow ? (parseFloat(firstValidRow.total) / parseFloat(firstValidRow.cantidad)) : 0;

  const hasEstacionDocs = isEstacion
    ? (datosEntrada.documentosEstacion || []).some(d => d.numero && d.numero.trim() && parseFloat(d.cantidad) > 0 && parseFloat(d.total) > 0)
    : false;

  const FIELD_LABELS = {
    documentos: 'Documento de compra (N°, Litros y Monto)',
    cantidad: 'Litros totales recibidos',
    numerosDocumento: 'N° de documento o guía de despacho',
    operadorId: 'Receptor (persona que recibe)',
    machineId: 'Vehículo / Equipo que recibe',
  };

  const getMissingFields = useCallback(() => {
    const missing = [];
    if (isEstacion) {
      if (!hasEstacionDocs) missing.push('documentos');
    } else {
      if (!datosEntrada.cantidad || parseFloat(datosEntrada.cantidad) === 0) missing.push('cantidad');
      if (datosEntrada.numerosDocumento.filter(d => d).length === 0) missing.push('numerosDocumento');
    }
    if (datosEntrada.tipoOrigen === 'interno' || datosEntrada.tipoOrigen === 'externo') {
      if (!datosEntrada.operadorId) missing.push('operadorId');
      if (!datosEntrada.machineId) missing.push('machineId');
    }
    return missing;
  }, [datosEntrada, isEstacion, hasEstacionDocs]);

  const errSet = new Set(validationErrors);
  const hasErr = (key) => errSet.has(key);

  const handleSubmitWithValidation = () => {
    const missing = getMissingFields();
    if (missing.length > 0) { setValidationErrors(missing); return; }
    setValidationErrors([]);
    handleSubmit();
  };

  const addEmail = () => {
    const val = emailInput.trim();
    if (val && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) && !(datosEntrada.extraEmails || []).includes(val)) {
      setDatosEntrada({ ...datosEntrada, extraEmails: [...(datosEntrada.extraEmails || []), val] });
    }
    setEmailInput('');
  };

  const handleEmailKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addEmail(); }
  };

  const removeEmail = (idx) => {
    setDatosEntrada({ ...datosEntrada, extraEmails: datosEntrada.extraEmails.filter((_, i) => i !== idx) });
  };

  const mpfMachines = (machinesLocal || []).filter(m => esMPF(m.empresa));
  const mpfWorkers = (trabajadoresLocales || []).filter(emp => esMPF(emp.empresa));

  const machineLabel = (m) => {
    if (!m) return 'S/P';
    if (m.codigo && m.patente && m.codigo !== m.patente) return `${m.codigo} · ${m.patente}`;
    return m.patente || m.codigo || m.code || m.modelo || 'S/P';
  };

  return (
    <div className="flex flex-col space-y-3 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex-1 bg-white p-4 sm:p-5 rounded-[2.5rem] border-2 border-slate-100 shadow-xl space-y-5">

        {/* Documentación y notas */}
        {isEstacion ? (
          <div className="space-y-6 pt-4 border-t border-slate-50">
            <div className="bg-slate-50/50 border border-slate-200/60 p-6 rounded-3xl space-y-4">
              <div className="flex justify-between items-center px-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                  <label className="block text-sm font-black text-slate-600 uppercase tracking-widest">Documentos de Compra (Estación de Servicio)</label>
                </div>
                <span className="text-xs font-black text-green-600 bg-green-50 px-3 py-1 rounded-full">
                  {(datosEntrada.documentosEstacion || []).length} / 20
                </span>
              </div>
              
              <div className="space-y-4">
                {/* Cabecera — solo visible en desktop */}
                <div className="hidden sm:grid grid-cols-12 gap-3 px-2 text-xs font-black text-slate-500 uppercase tracking-wider">
                  <div className="col-span-4 px-1">N° Doc</div>
                  <div className="col-span-3 px-1 text-right">Litros</div>
                  <div className="col-span-3 px-1 text-right">Monto ($)</div>
                  <div className="col-span-2"></div>
                </div>

                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                  {(datosEntrada.documentosEstacion || [{ numero: '', cantidad: '', total: '' }]).map((docRow, idx) => (
                    <div key={idx} className="animate-in fade-in duration-200 bg-white border-2 border-slate-100 rounded-2xl p-3 sm:p-0 sm:bg-transparent sm:border-0 sm:rounded-none">
                      {/* Mobile: etiqueta del documento */}
                      <div className="flex items-center justify-between mb-2 sm:hidden">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-wider">Documento {idx + 1}</span>
                        {idx > 0 && (
                          <button type="button"
                            onClick={() => {
                              const arr = (datosEntrada.documentosEstacion || []).filter((_, i) => i !== idx);
                              const totalLitros = arr.reduce((acc, row) => acc + (parseFloat(row.cantidad) || 0), 0);
                              setDatosEntrada({ ...datosEntrada, documentosEstacion: arr, numerosDocumento: arr.map(r => r.numero), cantidad: totalLitros > 0 ? String(totalLitros) : '' });
                            }}
                            className="w-7 h-7 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-sm font-black hover:bg-red-500 hover:text-white transition-all"
                          >×</button>
                        )}
                      </div>

                      {/* N° Doc — fila completa en mobile, col-span-4 en desktop */}
                      <div className="sm:grid sm:grid-cols-12 sm:gap-3 sm:items-center space-y-2 sm:space-y-0">
                        <div className="sm:col-span-4">
                          <label className="block text-xs font-bold text-slate-500 mb-1 sm:hidden">N° Documento</label>
                          <input
                            type="text" required={idx === 0} value={docRow.numero}
                            onChange={(e) => {
                              const arr = [...(datosEntrada.documentosEstacion || [])];
                              arr[idx] = { ...arr[idx], numero: e.target.value };
                              const totalLitros = arr.reduce((acc, row) => acc + (parseFloat(row.cantidad) || 0), 0);
                              setDatosEntrada({ ...datosEntrada, documentosEstacion: arr, numerosDocumento: arr.map(r => r.numero), cantidad: totalLitros > 0 ? String(totalLitros) : '' });
                            }}
                            placeholder={`N° Doc ${idx + 1}`}
                            className="w-full px-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-green-500 text-base font-bold text-slate-700 shadow-inner"
                          />
                        </div>

                        {/* Litros y Monto — side by side en mobile también */}
                        <div className="grid grid-cols-2 gap-2 sm:contents">
                          <div className="sm:col-span-3">
                            <label className="block text-xs font-bold text-slate-500 mb-1 sm:hidden">⛽ Litros</label>
                            <input
                              type="text" inputMode="decimal" required={idx === 0}
                              value={formatMiles(docRow.cantidad)}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/\./g, '').replace(',', '.');
                                if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
                                  const arr = [...(datosEntrada.documentosEstacion || [])];
                                  arr[idx] = { ...arr[idx], cantidad: raw };
                                  const totalLitros = arr.reduce((acc, row) => acc + (parseFloat(row.cantidad) || 0), 0);
                                  setDatosEntrada({ ...datosEntrada, documentosEstacion: arr, cantidad: totalLitros > 0 ? String(totalLitros) : '' });
                                }
                              }}
                              placeholder="0"
                              className="w-full px-3 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-green-500 text-base font-bold text-slate-700 shadow-inner text-right"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <label className="block text-xs font-bold text-slate-500 mb-1 sm:hidden">💰 Monto ($)</label>
                            <input
                              type="text" inputMode="decimal" required={idx === 0}
                              value={formatMiles(docRow.total)}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/\./g, '').replace(',', '.');
                                if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
                                  const arr = [...(datosEntrada.documentosEstacion || [])];
                                  arr[idx] = { ...arr[idx], total: raw };
                                  setDatosEntrada({ ...datosEntrada, documentosEstacion: arr });
                                }
                              }}
                              placeholder="0"
                              className="w-full px-3 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-green-500 text-base font-bold text-slate-700 shadow-inner text-right"
                            />
                          </div>
                        </div>

                        {/* Botones — solo desktop (mobile los tiene arriba o al final) */}
                        <div className="sm:col-span-2 hidden sm:flex items-center justify-end gap-1.5">
                          <button type="button"
                            onClick={() => {
                              const rowToDup = (datosEntrada.documentosEstacion || [])[idx];
                              const arr = [...(datosEntrada.documentosEstacion || [])];
                              if (arr.length >= 20) return;
                              arr.splice(idx + 1, 0, { numero: incrementDocNumber(rowToDup.numero), cantidad: rowToDup.cantidad, total: rowToDup.total });
                              const totalLitros = arr.reduce((acc, row) => acc + (parseFloat(row.cantidad) || 0), 0);
                              setDatosEntrada({ ...datosEntrada, documentosEstacion: arr, numerosDocumento: arr.map(r => r.numero), cantidad: totalLitros > 0 ? String(totalLitros) : '' });
                            }}
                            title="Duplicar y autoincrementar N° Doc"
                            className="px-2 py-2 bg-green-50 hover:bg-green-500 hover:text-white text-green-600 rounded-xl text-[10px] font-black transition-all border border-green-200 flex items-center justify-center gap-1"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                            </svg>
                          </button>
                          {idx > 0 && (
                            <button type="button"
                              onClick={() => {
                                const arr = (datosEntrada.documentosEstacion || []).filter((_, i) => i !== idx);
                                const totalLitros = arr.reduce((acc, row) => acc + (parseFloat(row.cantidad) || 0), 0);
                                setDatosEntrada({ ...datosEntrada, documentosEstacion: arr, numerosDocumento: arr.map(r => r.numero), cantidad: totalLitros > 0 ? String(totalLitros) : '' });
                              }}
                              className="w-7 h-7 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-xs shadow-sm hover:bg-red-500 hover:text-white transition-all font-black"
                            >×</button>
                          )}
                        </div>
                      </div>

                      {/* Botón duplicar — solo mobile, al pie del card */}
                      <button type="button"
                        onClick={() => {
                          const rowToDup = (datosEntrada.documentosEstacion || [])[idx];
                          const arr = [...(datosEntrada.documentosEstacion || [])];
                          if (arr.length >= 20) return;
                          arr.splice(idx + 1, 0, { numero: incrementDocNumber(rowToDup.numero), cantidad: rowToDup.cantidad, total: rowToDup.total });
                          const totalLitros = arr.reduce((acc, row) => acc + (parseFloat(row.cantidad) || 0), 0);
                          setDatosEntrada({ ...datosEntrada, documentosEstacion: arr, numerosDocumento: arr.map(r => r.numero), cantidad: totalLitros > 0 ? String(totalLitros) : '' });
                        }}
                        className="sm:hidden mt-2 w-full py-2 bg-green-50 text-green-700 rounded-xl text-xs font-black uppercase tracking-wider border border-green-200 hover:bg-green-100 transition-all"
                      >
                        + Duplicar este documento
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add button */}
                {(datosEntrada.documentosEstacion || []).length < 20 && (
                  <button
                    type="button"
                    onClick={() => {
                      const arr = [...(datosEntrada.documentosEstacion || [{ numero: '', cantidad: '', total: '' }]), { numero: '', cantidad: '', total: '' }];
                      setDatosEntrada({ ...datosEntrada, documentosEstacion: arr });
                    }}
                    className="w-full flex items-center justify-center border-2 border-dashed border-slate-300 rounded-xl text-slate-400 hover:border-green-500 hover:text-green-600 transition-all bg-slate-50 hover:bg-green-50/50 py-3 font-bold text-xs uppercase tracking-wider"
                  >
                    + Añadir otro documento de compra
                  </button>
                )}
              </div>
            </div>

            {/* Calculated price per liter and observations / email copy */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-100/70 p-5 rounded-2xl flex items-center justify-between font-bold text-slate-700 shadow-sm">
                  <div className="flex flex-col">
                    <span className="text-xs uppercase text-slate-400 tracking-wider font-black">Precio Unitario Promedio</span>
                    <span className="text-sm font-semibold text-slate-600 mt-0.5">Calculado a partir de tus vales</span>
                  </div>
                  <span className="text-2xl font-black text-orange-600">${precioPorLitro > 0 ? precioPorLitro.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '0.0'} <span className="text-xs font-bold text-orange-400">/ Lts</span></span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-black text-slate-500 uppercase tracking-widest px-1">Enviar Copia</label>
                  <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3 space-y-2 focus-within:border-green-400 transition-colors min-h-[52px]">
                    {(datosEntrada.extraEmails || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {datosEntrada.extraEmails.map((email, i) => (
                          <span key={i} className="flex items-center gap-1 bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded-lg">
                            {email}
                            <button type="button" onClick={() => removeEmail(i)} className="text-green-600 hover:text-red-500 ml-0.5 leading-none text-sm">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <input
                      type="email"
                      value={emailInput}
                      onChange={e => setEmailInput(e.target.value)}
                      onKeyDown={handleEmailKeyDown}
                      onBlur={addEmail}
                      placeholder="correo@ejemplo.com + Enter"
                      className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>
                <div className="hidden sm:block space-y-2 opacity-50 pointer-events-none">
                  <label className="block text-sm font-black text-slate-500 uppercase tracking-widest px-1">WhatsApp</label>
                  <input
                    type="tel"
                    disabled
                    placeholder="+56 9 XXXX XXXX"
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl text-sm text-slate-400"
                  />
                  <p className="text-xs text-slate-400 px-1">Próximamente vía Twilio</p>
                </div>
              </div>
            </div>

            {/* Observaciones al fondo, sobre total litros y más pequeño */}
            <div className="space-y-1.5 pt-2">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest px-1">Observaciones</label>
              <input
                type="text"
                value={datosEntrada.observaciones || ''}
                onChange={(e) => setDatosEntrada({ ...datosEntrada, observaciones: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-green-500 text-xs font-medium text-slate-600 shadow-inner"
                placeholder="Notas adicionales (opcional)..."
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4 border-t border-slate-50">
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <label className="block text-sm font-black text-slate-500 uppercase tracking-widest">Vales / Guías de Despacho</label>
                <span className="text-xs font-black text-green-600 bg-green-50 px-3 py-1 rounded-full">
                  {datosEntrada.numerosDocumento.filter(d => d).length} / 20
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {datosEntrada.numerosDocumento.map((num, idx) => (
                  <div key={idx} className="relative group">
                    <input
                      type="text" required={idx === 0} value={num}
                      autoFocus={idx === datosEntrada.numerosDocumento.length - 1 && idx > 0}
                      onChange={(e) => {
                        const arr = [...datosEntrada.numerosDocumento];
                        arr[idx] = e.target.value;
                        setDatosEntrada({ ...datosEntrada, numerosDocumento: arr });
                      }}
                      placeholder={`N° Doc ${idx + 1}`}
                      className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-green-500 text-sm font-bold text-slate-700 shadow-inner"
                    />
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => setDatosEntrada({ ...datosEntrada, numerosDocumento: datosEntrada.numerosDocumento.filter((_, i) => i !== idx) })}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-white border border-red-100 text-red-500 rounded-full flex items-center justify-center text-xs shadow-md hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                      >×</button>
                    )}
                  </div>
                ))}
                {datosEntrada.numerosDocumento.length < 20 && (
                  <button
                    type="button"
                    onClick={() => setDatosEntrada({ ...datosEntrada, numerosDocumento: [...datosEntrada.numerosDocumento, ''] })}
                    className="flex items-center justify-center border-2 border-dashed border-slate-300 rounded-xl text-slate-400 hover:border-green-500 hover:text-green-600 transition-all bg-slate-50 hover:bg-green-50/50 py-3"
                  >
                    <span className="text-xl font-black">+</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <div className="space-y-2">
                <label className="block text-sm font-black text-slate-500 uppercase tracking-widest px-1">Observaciones</label>
                <textarea
                  value={datosEntrada.observaciones}
                  onChange={(e) => setDatosEntrada({ ...datosEntrada, observaciones: e.target.value })}
                  className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-green-500 font-medium text-slate-600 shadow-inner h-[90px] text-sm"
                  placeholder="Notas adicionales..."
                />
              </div>

              {/* Multi-email + WhatsApp */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-black text-slate-500 uppercase tracking-widest px-1">Enviar Copia</label>
                  <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3 space-y-2 focus-within:border-green-400 transition-colors min-h-[52px]">
                    {(datosEntrada.extraEmails || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {datosEntrada.extraEmails.map((email, i) => (
                          <span key={i} className="flex items-center gap-1 bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded-lg">
                            {email}
                            <button type="button" onClick={() => removeEmail(i)} className="text-green-600 hover:text-red-500 ml-0.5 leading-none text-sm">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <input
                      type="email"
                      value={emailInput}
                      onChange={e => setEmailInput(e.target.value)}
                      onKeyDown={handleEmailKeyDown}
                      onBlur={addEmail}
                      placeholder="correo@ejemplo.com + Enter"
                      className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>
                <div className="hidden sm:block space-y-2 opacity-50 pointer-events-none">
                  <label className="block text-sm font-black text-slate-500 uppercase tracking-widest px-1">WhatsApp</label>
                  <input
                    type="tel"
                    disabled
                    placeholder="+56 9 XXXX XXXX"
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl text-sm text-slate-400"
                  />
                  <p className="text-xs text-slate-400 px-1">Próximamente vía Twilio</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quién recibe (interno/externo) */}
        {(datosEntrada.tipoOrigen === 'interno' || datosEntrada.tipoOrigen === 'externo') && (
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div className="flex items-center gap-3 px-1">
              <span className="w-7 h-7 rounded-lg bg-green-100 text-green-600 flex items-center justify-center text-sm font-black">2</span>
              <h4 className="text-base font-black text-slate-800 uppercase tracking-wider">¿Quién recibe?</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 bg-slate-50 p-5 rounded-2xl border border-slate-200">

              {/* Receptor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <label className={`block text-sm font-black uppercase tracking-wider ${hasErr('operadorId') ? 'text-red-600' : 'text-slate-500'}`}>
                    Receptor{hasErr('operadorId') && <span className="ml-1 font-normal normal-case text-xs">— requerido</span>}
                  </label>
                  <button type="button"
                    onClick={() => { setNuevoEmpleadoData({ nombre: '', rut: '', empresaId: 'MPF', targetField: 'operadorEntrada' }); setShowModalEmpleado(true); }}
                    className="w-7 h-7 rounded-lg bg-green-100 text-green-700 flex items-center justify-center font-black text-base hover:bg-green-200 transition-colors"
                  >+</button>
                </div>
                {isAdmin ? (
                  datosEntrada.operadorId ? (() => {
                    const sel = mpfWorkers.find(e => e.id === datosEntrada.operadorId);
                    return (
                      <div className="p-4 bg-gradient-to-br from-green-600 to-emerald-700 text-white rounded-2xl flex items-center gap-3 shadow-lg animate-in zoom-in duration-200">
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-black text-lg">{sel?.nombre?.charAt(0) || '?'}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-sm uppercase truncate">{sel?.nombre}</div>
                          <div className="text-xs opacity-75">{sel?.rut || 'Sin RUT'}</div>
                        </div>
                        <button onClick={() => setDatosEntrada({ ...datosEntrada, operadorId: '' })} className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center font-black transition-all">✕</button>
                      </div>
                    );
                  })() : (
                    <>
                      <div className="relative">
                        <input type="text" placeholder="Buscar nombre o RUT..." value={searchReceptor} onChange={e => setSearchReceptor(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-green-500 font-medium text-sm text-slate-700" />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2"><SearchIcon /></span>
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {mpfWorkers
                          .filter(emp => matchWorker(emp, searchReceptor))
                          .map(emp => (
                            <button key={emp.id} type="button"
                              onClick={() => { setDatosEntrada({ ...datosEntrada, operadorId: emp.id }); setSearchReceptor(''); }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 bg-white border-2 border-slate-100 hover:border-green-400 rounded-xl transition-all text-left">
                              <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center text-green-600"><PersonIcon /></div>
                              <div>
                                <div className="font-black text-sm text-slate-700 uppercase">{shortName(emp.nombre)}</div>
                                <div className="text-xs text-slate-400">{emp.rut}</div>
                              </div>
                            </button>
                          ))}
                      </div>
                    </>
                  )
                ) : (
                  <div className="px-4 py-3 bg-white border-2 border-green-100 rounded-xl font-bold text-green-900 flex items-center gap-2 text-sm">
                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-600"><PersonIcon /></div>
                    {currentUserData?.nombre || 'Mi usuario'}
                  </div>
                )}
              </div>

              {/* Vehículo que recibe */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <label className={`block text-sm font-black uppercase tracking-wider ${hasErr('machineId') ? 'text-red-600' : 'text-slate-500'}`}>
                    Vehículo / Equipo{hasErr('machineId') && <span className="ml-1 font-normal normal-case text-xs">— requerido</span>}
                  </label>
                  <button type="button"
                    onClick={() => { setNuevaMaquinaData({ patente: '', tipo: '', modelo: '', empresaId: 'MPF', targetField: 'machine_entrada' }); setShowModalMaquina(true); }}
                    className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-black text-base hover:bg-amber-200 transition-colors"
                  >+</button>
                </div>
                {datosEntrada.machineId ? (() => {
                  const sel = mpfMachines.find(m => m.id === datosEntrada.machineId);
                  return (
                    <div className="p-4 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-2xl flex items-center gap-3 shadow-lg animate-in zoom-in duration-200">
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-sm uppercase">{sel?.tipo || 'Sin tipo'}</div>
                        <div className="text-xs opacity-80">{machineLabel(sel)}</div>
                      </div>
                      <button onClick={() => setDatosEntrada({ ...datosEntrada, machineId: '' })} className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center font-black transition-all">✕</button>
                    </div>
                  );
                })() : (
                  <>
                    <div className="relative">
                      <input type="text" placeholder="Buscar tipo o patente..." value={searchMaquina} onChange={e => setSearchMaquina(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-amber-500 font-medium text-sm text-slate-700" />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2"><SearchIcon /></span>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {mpfMachines
                        .filter(m => !searchMaquina || (m.tipo || '').toLowerCase().includes(searchMaquina.toLowerCase()) || (m.patente || m.codigo || m.code || '').toLowerCase().includes(searchMaquina.toLowerCase()) || (m.modelo || '').toLowerCase().includes(searchMaquina.toLowerCase()))
                        .map(m => (
                          <button key={m.id} type="button"
                            onClick={() => { setDatosEntrada({ ...datosEntrada, machineId: m.id }); setSearchMaquina(''); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 bg-white border-2 border-slate-100 hover:border-amber-400 rounded-xl transition-all text-left">
                            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500"><TruckIcon /></div>
                            <div>
                              <div className="font-black text-sm text-slate-700 uppercase">{m.tipo || 'Sin tipo'}</div>
                              <div className="text-xs text-slate-400">{machineLabel(m)}</div>
                            </div>
                          </button>
                        ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Cantidades */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`p-3 rounded-2xl border-2 flex flex-col justify-center ${hasErr('cantidad') ? 'bg-red-50/40 border-red-300' : 'bg-green-50/40 border-green-100'}`}>
            <label className={`block text-xs font-black uppercase tracking-widest mb-2 text-center ${hasErr('cantidad') ? 'text-red-600' : 'text-slate-500'}`}>
              Litros Totales{hasErr('cantidad') && <span className="ml-1 font-normal normal-case">— requerido</span>}
            </label>
            <input
              type="text" required inputMode="decimal"
              disabled={isEstacion}
              value={formatMiles(datosEntrada.cantidad)}
              onChange={(e) => {
                if (isEstacion) return;
                const raw = e.target.value.replace(/\./g, '').replace(',', '.');
                if (raw === '' || /^\d*\.?\d*$/.test(raw)) setDatosEntrada({ ...datosEntrada, cantidad: raw });
              }}
              className={`w-full px-3 py-3 bg-white border-2 rounded-xl focus:border-green-500 font-black text-2xl text-center shadow-inner transition-all disabled:bg-slate-50 disabled:text-slate-500 ${hasErr('cantidad') ? 'border-red-300 text-red-700' : 'border-green-200 text-green-700'}`}
              placeholder="0"
            />
          </div>
          <div className="bg-amber-50/40 p-3 rounded-2xl border-2 border-amber-100 flex flex-col justify-center">
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2 text-center">Horómetro / KM</label>
            <input
              type="text" inputMode="decimal"
              value={formatMiles(datosEntrada.horometroOdometro)}
              onChange={(e) => {
                const raw = e.target.value.replace(/\./g, '').replace(',', '.');
                if (raw === '' || /^\d*\.?\d*$/.test(raw)) setDatosEntrada({ ...datosEntrada, horometroOdometro: raw });
              }}
              className="w-full px-3 py-3 bg-white border-2 border-amber-200 rounded-xl focus:border-amber-500 font-black text-2xl text-amber-700 text-center shadow-inner transition-all"
              placeholder="0"
            />
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-slate-100 mt-2">
        {validationErrors.length > 0 && (
          <div className="mx-4 mt-3 bg-red-50 border-2 border-red-200 rounded-2xl p-3 flex items-start gap-2">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="font-black text-red-700 text-xs uppercase tracking-wider">Faltan campos requeridos</p>
              <ul className="mt-1 space-y-0.5">
                {validationErrors.map(key => (
                  <li key={key} className="text-sm text-red-600 font-bold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                    {FIELD_LABELS[key] || key}
                  </li>
                ))}
              </ul>
            </div>
            <button onClick={() => setValidationErrors([])} className="text-red-400 hover:text-red-600 font-black text-lg leading-none">×</button>
          </div>
        )}
        <div className="p-4 flex gap-4">
          <PillButton
            variant="outline"
            onClick={() => setPaso(2)}
            className="flex-1"
          >
            ← Regresar
          </PillButton>
          <PillButton
            variant="secondary"
            onClick={handleSubmitWithValidation}
            disabled={loading}
            isLoading={loading}
            loadingText="Guardando..."
            className="flex-[2]"
          >
            ✓ Finalizar Recepción
          </PillButton>
        </div>
      </div>
    </div>
  );
}
