import React, { useState } from "react";
import { formatMiles } from '../../../utils/formatters';

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

  const canSubmit = !loading
    && !!datosEntrada.cantidad
    && datosEntrada.numerosDocumento.filter(d => d).length > 0
    && !((datosEntrada.tipoOrigen === 'interno' || datosEntrada.tipoOrigen === 'externo')
      && (!datosEntrada.operadorId || !datosEntrada.machineId));

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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-xl space-y-8">

        {/* Documentación y notas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4 border-t border-slate-50">
          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <label className="block text-sm font-black text-slate-500 uppercase tracking-widest">Vales / Guías de Despacho</label>
              <span className="text-xs font-black text-green-600 bg-green-50 px-3 py-1 rounded-full">
                {datosEntrada.numerosDocumento.filter(d => d).length} / 10
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {datosEntrada.numerosDocumento.map((num, idx) => (
                <div key={idx} className="relative group">
                  <input
                    type="text" required={idx === 0} value={num}
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
              {datosEntrada.numerosDocumento.length < 10 && (
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
              <div className="space-y-2 opacity-50 pointer-events-none">
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
                  <label className="block text-sm font-black text-slate-500 uppercase tracking-wider">Receptor</label>
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
                          .filter(emp => !searchReceptor || emp.nombre?.toLowerCase().includes(searchReceptor.toLowerCase()) || emp.rut?.includes(searchReceptor))
                          .map(emp => (
                            <button key={emp.id} type="button"
                              onClick={() => { setDatosEntrada({ ...datosEntrada, operadorId: emp.id }); setSearchReceptor(''); }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 bg-white border-2 border-slate-100 hover:border-green-400 rounded-xl transition-all text-left">
                              <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center text-green-600"><PersonIcon /></div>
                              <div>
                                <div className="font-black text-sm text-slate-700 uppercase">{emp.nombre}</div>
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
                  <label className="block text-sm font-black text-slate-500 uppercase tracking-wider">Vehículo / Equipo</label>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-green-50/40 p-6 rounded-[2.5rem] border-2 border-green-100 flex flex-col justify-center">
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3 text-center">Litros Totales</label>
            <input
              type="text" required
              value={formatMiles(datosEntrada.cantidad)}
              onChange={(e) => {
                const raw = e.target.value.replace(/\./g, '').replace(',', '.');
                if (raw === '' || /^\d*\.?\d*$/.test(raw)) setDatosEntrada({ ...datosEntrada, cantidad: raw });
              }}
              className="w-full px-4 py-5 bg-white border-2 border-green-200 rounded-2xl focus:border-green-500 font-black text-3xl text-green-700 text-center shadow-inner transition-all"
              placeholder="0"
            />
          </div>
          <div className="bg-amber-50/40 p-6 rounded-[2.5rem] border-2 border-amber-100 flex flex-col justify-center">
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3 text-center">Horómetro / KM</label>
            <input
              type="text"
              value={formatMiles(datosEntrada.horometroOdometro)}
              onChange={(e) => {
                const raw = e.target.value.replace(/\./g, '').replace(',', '.');
                if (raw === '' || /^\d*\.?\d*$/.test(raw)) setDatosEntrada({ ...datosEntrada, horometroOdometro: raw });
              }}
              className="w-full px-4 py-5 bg-white border-2 border-amber-200 rounded-2xl focus:border-amber-500 font-black text-3xl text-amber-700 text-center shadow-inner transition-all"
              placeholder="0"
            />
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 p-4 bg-white/95 backdrop-blur-md border-t border-slate-100 flex gap-4 mt-4">
        <button
          onClick={() => setPaso(2)}
          className="flex-1 px-8 py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 font-black rounded-2xl transition-all uppercase text-sm tracking-wide"
        >
          ← Regresar
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-[2] px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-black rounded-2xl transition-all uppercase text-sm tracking-wide shadow-xl shadow-green-100 disabled:grayscale disabled:opacity-50 active:scale-95"
        >
          {loading ? 'Guardando...' : '✓ Finalizar Recepción'}
        </button>
      </div>
    </div>
  );
}
