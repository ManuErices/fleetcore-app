import React, { useState, useCallback } from "react";
import { formatMiles } from '../../../utils/formatters';
import { matchWorker, matchMachine, shortName } from '../../../utils/searchHelpers';
import { PillButton } from "../../../components/ui/PillButton";
import { useKeyboardAvoidingView } from "../../../hooks/useKeyboardAvoidingView";

const SearchIcon = () => (
  <svg className="w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
  </svg>
);

const TruckIcon = () => (
  <svg className="w-4 h-4 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
    <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
    <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-.84.45L12.17 9H11V7h-1v8.05A2.5 2.5 0 0112.95 17H14a1 1 0 001-1v-5h1a1 1 0 00.82-1.57l-2-3A1 1 0 0014 7z" />
  </svg>
);

const CameraIcon = () => (
  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

export default function EntregaStep({
  datosEntrega, setDatosEntrega,
  machinesLocal,
  trabajadoresLocales,
  empresasLocal,
  esMPF, empresasMatch, resolverNombreEmpresa,
  firmaReceptor, setFirmaReceptor,
  setShowModalCamaraReceptor,
  setShowModalMaquina, setNuevaMaquinaData,
  setShowModalEmpleado, setNuevoEmpleadoData,
  setShowModalEmpresa,
  searchOperador, setSearchOperador,
  handleSubmit, loading,
  setPaso,
  nuevaMaquinaData,
  nuevoEmpleadoData,
  isAdmin,
  isReportesView,
}) {
  const [emailInput, setEmailInput] = useState('');
  const [searchMaquina, setSearchMaquina] = useState('');
  const [validationErrors, setValidationErrors] = useState([]);

  useKeyboardAvoidingView();

  const machineLabel = (m) => {
    if (!m) return 'S/P';
    if (m.codigo && m.patente && m.codigo !== m.patente) return `${m.codigo} · ${m.patente}`;
    return m.patente || m.codigo || m.code || m.modelo || 'S/P';
  };

  const FIELD_LABELS = {
    cantidadLitros: 'Litros entregados',
    machineId: 'Maquinaria que recibe',
    operadorId: 'Persona que recibe',
    firmaReceptor: 'Foto de identificación del receptor',
    horometroOdometro: 'Horómetro / KM de la maquinaria',
  };

  const getMissingFields = useCallback(() => {
    const missing = [];
    if (!datosEntrega.cantidadLitros || parseFloat(datosEntrega.cantidadLitros) === 0) missing.push('cantidadLitros');
    if (!datosEntrega.machineId) missing.push('machineId');
    if (!datosEntrega.operadorId) missing.push('operadorId');
    if (!datosEntrega.horometroOdometro) missing.push('horometroOdometro');
    if (!isReportesView && !firmaReceptor) missing.push('firmaReceptor');
    return missing;
  }, [datosEntrega, firmaReceptor, isReportesView]);

  const errSet = new Set(validationErrors);
  const hasErr = (key) => errSet.has(key);

  const handleSubmitWithValidation = () => {
    const missing = getMissingFields();
    if (missing.length > 0) { setValidationErrors(missing); return; }
    setValidationErrors([]);
    handleSubmit();
  };

  React.useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const blob = items[i].getAsFile();
          const reader = new FileReader();
          reader.onload = (event) => {
            setFirmaReceptor(event.target.result);
          };
          reader.readAsDataURL(blob);
          e.preventDefault();
          break;
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [setFirmaReceptor]);

  const addEmail = () => {
    const val = emailInput.trim();
    if (val && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) && !(datosEntrega.extraEmails || []).includes(val)) {
      setDatosEntrega({ ...datosEntrega, extraEmails: [...(datosEntrega.extraEmails || []), val] });
    }
    setEmailInput('');
  };

  const handleEmailKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addEmail(); }
  };

  const removeEmail = (idx) => {
    setDatosEntrega({ ...datosEntrega, extraEmails: datosEntrega.extraEmails.filter((_, i) => i !== idx) });
  };

  const filteredMachines = (machinesLocal || [])
    .filter(m => esMPF(datosEntrega.empresa) ? esMPF(m.empresa) : empresasMatch(m.empresa, resolverNombreEmpresa(datosEntrega.empresa)));

  const mpfNombre = empresasLocal.find(e => esMPF(e.id))?.nombre || 'Empresa Propia';

  return (
    <div className="flex flex-col space-y-3 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex-1 bg-white p-4 sm:p-5 rounded-[2.5rem] border-2 border-slate-100 shadow-xl space-y-5">

        {/* Destino de la entrega */}
        <div className="pt-4 border-t border-slate-100 space-y-6">
          <div className="flex items-center gap-3 px-1">
            <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-black">2</span>
            <h4 className="text-base font-black text-slate-800 uppercase tracking-wider">Destino de la Entrega</h4>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Empresa y Maquinaria */}
            <div className="space-y-5">
              {/* Empresa Receptora — única lista con empresa propia + externas */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <label className="block text-sm font-black text-slate-500 uppercase tracking-widest">Empresa Receptora</label>
                  {isAdmin && (
                    <button onClick={() => setShowModalEmpresa(true)} className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-lg shadow-lg hover:bg-blue-500 transition-all flex-shrink-0">+</button>
                  )}
                </div>
                <select
                  value={datosEntrega.empresa}
                  onChange={(e) => setDatosEntrega({ ...datosEntrega, empresa: e.target.value, machineId: '', operadorId: '' })}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-blue-500 font-bold text-sm text-slate-700 shadow-inner"
                >
                  <option value="">Seleccione empresa</option>
                  <option value="MPF">{mpfNombre}</option>
                  {empresasLocal.filter(e => !esMPF(e.id)).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Maquinaria (searchable) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <label className={`block text-sm font-black uppercase tracking-widest ${hasErr('machineId') ? 'text-red-600' : 'text-slate-500'}`}>
                    Maquinaria que recibe{hasErr('machineId') && <span className="ml-1 font-normal normal-case text-xs">— requerido</span>}
                  </label>
                  <button
                    onClick={() => { setNuevaMaquinaData({ ...nuevaMaquinaData, empresaId: datosEntrega.empresa || 'MPF' }); setShowModalMaquina(true); }}
                    className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-xl shadow-lg hover:bg-blue-500 transition-all flex-shrink-0"
                  >+</button>
                </div>
                {!datosEntrega.empresa ? (
                  <div className="py-3 px-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 font-bold text-center">
                    Selecciona primero la empresa receptora
                  </div>
                ) : datosEntrega.machineId ? (() => {
                  const sel = filteredMachines.find(m => m.id === datosEntrega.machineId);
                  return (
                    <div className="p-4 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl flex items-center gap-3 shadow-lg animate-in zoom-in duration-200">
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-sm uppercase">{sel?.tipo || 'Sin tipo'}</div>
                        <div className="text-xs opacity-75">{machineLabel(sel)}</div>
                      </div>
                      <button onClick={() => { setDatosEntrega({ ...datosEntrega, machineId: '' }); setSearchMaquina(''); }} className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center font-black transition-all">✕</button>
                    </div>
                  );
                })() : (
                  <>
                    <div className="relative">
                      <input type="text" placeholder="Buscar tipo o patente..." value={searchMaquina} onChange={e => setSearchMaquina(e.target.value)}
                        className={`w-full pl-10 pr-4 py-3 bg-white border-2 rounded-xl focus:border-blue-500 font-medium text-sm ${hasErr('machineId') ? 'border-red-300' : 'border-slate-200'}`} />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2"><SearchIcon /></span>
                    </div>
                    <div className="max-h-44 overflow-y-auto space-y-1">
                      {filteredMachines
                        .filter(m => matchMachine(m, searchMaquina))
                        .map(m => (
                          <button key={m.id} type="button"
                            onClick={() => { setDatosEntrega({ ...datosEntrega, machineId: m.id }); setSearchMaquina(''); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 bg-white border-2 border-slate-100 hover:border-blue-400 rounded-xl transition-all text-left">
                            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><TruckIcon /></div>
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

            {/* Persona que recibe */}
            <div className="space-y-4">
              <div className="bg-slate-50/50 p-6 rounded-[2.5rem] border-2 border-slate-100 space-y-4">
                <div className="flex items-center justify-between px-1">
                  <label className={`block text-sm font-black uppercase tracking-widest ${hasErr('operadorId') ? 'text-red-600' : 'text-slate-500'}`}>
                    Persona que recibe{hasErr('operadorId') && <span className="ml-1 font-normal normal-case text-xs">— requerido</span>}
                  </label>
                  <button
                    onClick={() => { setNuevoEmpleadoData({ ...nuevoEmpleadoData, empresaId: datosEntrega.empresa || 'MPF' }); setShowModalEmpleado(true); }}
                    className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-xl shadow-lg hover:bg-blue-500 transition-all flex-shrink-0"
                  >+</button>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar nombre o RUT..."
                    value={searchOperador}
                    onChange={(e) => setSearchOperador(e.target.value)}
                    className={`w-full pl-10 pr-5 py-3 bg-white border-2 rounded-2xl focus:border-blue-500 font-medium text-sm uppercase tracking-wide ${hasErr('operadorId') ? 'border-red-300' : 'border-slate-200'}`}
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2"><SearchIcon /></span>
                </div>

                {!datosEntrega.empresa ? (
                  <div className="py-3 px-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 font-bold text-center">
                    Selecciona primero la empresa receptora
                  </div>
                ) : datosEntrega.operadorId ? (() => {
                  const sel = trabajadoresLocales.find(e => e.id === datosEntrega.operadorId);
                  return (
                    <div className="p-4 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-3xl flex items-center gap-4 shadow-xl shadow-blue-200 animate-in zoom-in duration-300">
                      <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-xl font-black">{sel?.nombre?.charAt(0) || '?'}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-black uppercase tracking-widest opacity-60 mb-0.5">Seleccionado</div>
                        <div className="font-black text-base uppercase leading-tight break-words pr-2">{sel?.nombre || 'Nuevo Trabajador'}</div>
                        <div className="text-xs font-bold opacity-80">RUT: {sel?.rut || 'Sin RUT'}</div>
                      </div>
                      <button onClick={() => setDatosEntrega({ ...datosEntrega, operadorId: '' })} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg font-black transition-all">✕</button>
                    </div>
                  );
                })() : (
                  <div className="max-h-48 overflow-y-auto pr-1 space-y-1">
                    {(trabajadoresLocales || [])
                      .filter(emp => esMPF(datosEntrega.empresa) ? esMPF(emp.empresa) : empresasMatch(emp.empresa, resolverNombreEmpresa(datosEntrega.empresa)))
                      .filter(emp => matchWorker(emp, searchOperador))
                      .map(emp => (
                        <button key={emp.id} type="button"
                          onClick={() => setDatosEntrega({ ...datosEntrega, operadorId: emp.id })}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-white border-2 border-slate-100 hover:border-blue-400 rounded-xl transition-all text-left">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-sm font-black">{emp.nombre?.charAt(0)}</div>
                          <div className="min-w-0">
                            <div className="font-black text-slate-700 text-sm truncate">{shortName(emp.nombre)}</div>
                            <div className="text-xs text-slate-400 font-bold">{emp.rut}</div>
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Email + WhatsApp */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="space-y-2">
            <label className="block text-sm font-black text-slate-500 uppercase tracking-widest px-1">Enviar Copia</label>
            <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3 space-y-2 focus-within:border-blue-400 transition-colors min-h-[52px]">
              {(datosEntrega.extraEmails || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {datosEntrega.extraEmails.map((email, i) => (
                    <span key={i} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-lg">
                      {email}
                      <button type="button" onClick={() => removeEmail(i)} className="text-blue-600 hover:text-red-500 ml-0.5 leading-none text-sm">×</button>
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
            <input type="tel" disabled placeholder="+56 9 XXXX XXXX"
              className="w-full px-4 py-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl text-sm text-slate-400" />
            <p className="text-xs text-slate-400 px-1">Próximamente vía Twilio</p>
          </div>
        </div>

        {/* Cantidades */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`p-3 rounded-2xl border-2 flex flex-col justify-center text-center ${hasErr('cantidadLitros') ? 'bg-red-50/40 border-red-300' : 'bg-blue-50/40 border-blue-100'}`}>
            <label className={`block text-xs font-black uppercase tracking-widest mb-2 ${hasErr('cantidadLitros') ? 'text-red-600' : 'text-slate-500'}`}>
              Litros Entregados{hasErr('cantidadLitros') && <span className="ml-1 font-normal normal-case">— requerido</span>}
            </label>
            <input
              type="text" required inputMode="decimal"
              value={formatMiles(datosEntrega.cantidadLitros)}
              onChange={(e) => {
                const raw = e.target.value.replace(/\./g, '').replace(',', '.');
                if (raw === '' || /^\d*\.?\d*$/.test(raw)) setDatosEntrega({ ...datosEntrega, cantidadLitros: raw });
              }}
              className={`w-full px-3 py-3 bg-white border-2 rounded-xl focus:border-blue-500 font-black text-2xl text-center shadow-inner transition-all ${hasErr('cantidadLitros') ? 'border-red-300 text-red-700' : 'border-blue-200 text-blue-700'}`}
              placeholder="0"
            />
          </div>
          <div className={`p-3 rounded-2xl border-2 flex flex-col justify-center text-center ${hasErr('horometroOdometro') ? 'bg-red-50/40 border-red-300' : 'bg-slate-50 border-slate-100'}`}>
            <label className={`block text-xs font-black uppercase tracking-widest mb-2 ${hasErr('horometroOdometro') ? 'text-red-600' : 'text-slate-500'}`}>
              Horómetro / KM{hasErr('horometroOdometro') && <span className="ml-1 font-normal normal-case">— requerido</span>}
            </label>
            <input
              type="text" required inputMode="decimal"
              value={formatMiles(datosEntrega.horometroOdometro)}
              onChange={(e) => {
                const raw = e.target.value.replace(/\./g, '').replace(',', '.');
                if (raw === '' || /^\d*\.?\d*$/.test(raw)) setDatosEntrega({ ...datosEntrega, horometroOdometro: raw });
              }}
              className={`w-full px-3 py-3 bg-white border-2 rounded-xl focus:border-blue-500 font-black text-2xl text-center shadow-inner transition-all ${hasErr('horometroOdometro') ? 'border-red-300 text-red-700' : 'border-slate-200 text-slate-700'}`}
              placeholder="0"
            />
          </div>
        </div>

        {/* Foto de identificación */}
        <div className={`flex flex-col items-center justify-center py-4 px-4 rounded-2xl border-2 border-dashed text-center hover:bg-slate-100/50 transition-colors ${hasErr('firmaReceptor') ? 'bg-red-50/30 border-red-300' : 'bg-slate-50 border-slate-200'}`}>
          {firmaReceptor ? (
            <div className="relative group/photo inline-block">
              <img src={firmaReceptor} alt="Identificación" className="w-56 h-36 object-cover rounded-2xl border-4 border-white shadow-xl" />
              <button
                type="button"
                onClick={() => { setFirmaReceptor(null); setShowModalCamaraReceptor(true); }}
                className="absolute inset-0 bg-black/60 opacity-0 group-hover/photo:opacity-100 transition-opacity rounded-2xl flex flex-col items-center justify-center gap-2 backdrop-blur-sm"
              >
                <RefreshIcon />
                <span className="text-xs font-black text-white uppercase tracking-widest">Cambiar</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowModalCamaraReceptor(true)}
              className="flex items-center gap-3 group transition-all active:scale-95 w-full"
            >
              <div className="w-14 h-14 bg-blue-600 group-hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-blue-100 transition-all flex-shrink-0">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className={`text-sm font-black uppercase tracking-wide group-hover:text-blue-600 transition-colors text-left ${hasErr('firmaReceptor') ? 'text-red-600' : 'text-slate-500'}`}>
                Foto ID del receptor{isReportesView ? <span className="text-xs font-normal lowercase tracking-normal ml-1">(opcional)</span> : hasErr('firmaReceptor') ? <span className="ml-1 font-normal normal-case text-xs">— requerido</span> : <span className="text-red-500 ml-1">*</span>}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-slate-100">
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
            variant="primary"
            onClick={handleSubmitWithValidation}
            disabled={loading}
            isLoading={loading}
            loadingText="Guardando..."
            className="flex-[2]"
          >
            ✓ Finalizar Entrega
          </PillButton>
        </div>
      </div>
    </div>
  );
}
