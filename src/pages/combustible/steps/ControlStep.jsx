import React, { useState, useCallback, useEffect } from "react";
import { matchWorker, matchMachine, shortName } from '../../../utils/searchHelpers';
import { PillButton } from "../../../components/ui/PillButton";
import { useKeyboardAvoidingView } from "../../../hooks/useKeyboardAvoidingView";

const SearchIcon = () => (
  <svg className="w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
  </svg>
);

const PersonIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
  </svg>
);

const TruckIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
    <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
    <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-.84.45L12.17 9H11V7h-1v8.05A2.5 2.5 0 0112.95 17H14a1 1 0 001-1v-5h1a1 1 0 00.82-1.57l-2-3A1 1 0 0014 7z" />
  </svg>
);

/* SVG icons replacing broken emojis */
const BuildingIcon = ({ className = "w-7 h-7" }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
  </svg>
);

const FuelIcon = ({ className = "w-7 h-7" }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
  </svg>
);

const TankIcon = ({ className = "w-7 h-7" }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" />
    <path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" />
    <path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" />
  </svg>
);

const TruckLargeIcon = ({ className = "w-7 h-7" }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
    <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-.84.45L12.17 9H11V7h-1v8.05A2.5 2.5 0 0112.95 17H14a1 1 0 001-1v-5h1a1 1 0 00.82-1.57l-2-3A1 1 0 0014 7z" />
  </svg>
);

export default function ControlStep({
  tipoReporte,
  datosControl, setDatosControl,
  datosEntrada, setDatosEntrada,
  datosEntrega, setDatosEntrega,
  projects,
  equiposSurtidores,
  estacionesLocal,
  empresasLocal,
  machinesLocal, machines,
  trabajadoresLocales,
  surtidoresPersonas,
  currentUserData, isAdmin,
  isReportesView,
  cargarEstaciones,
  esMPF, empresasMatch, resolverNombreEmpresa,
  setPaso,
  setShowModalEquipoSurtidor,
  setShowModalEmpresa,
  setShowModalMaquina, setNuevaMaquinaData,
  setShowModalEmpleado, setNuevoEmpleadoData,
  setShowModalProyecto,
  setShowModalEstacion,
}) {
  const [searchRepartidor, setSearchRepartidor] = useState('');
  const [searchEquipo, setSearchEquipo] = useState('');
  const [searchMaquinaProveedor, setSearchMaquinaProveedor] = useState('');
  const [searchOperadorProveedor, setSearchOperadorProveedor] = useState('');
  const [searchReceptor, setSearchReceptor] = useState('');
  const [validationErrors, setValidationErrors] = useState([]);

  useKeyboardAvoidingView();

  const FIELD_LABELS = {
    projectId: 'Obra / Proyecto',
    tipoOrigen: 'Tipo de origen (Interno / Estación)',
    repartidorId: 'Repartidor',
    equipoSurtidorId: 'Equipo Surtidor',
    origen: 'Estación / Empresa de origen',
    destinoCarga: 'Destino de carga (Camión / Estanque)',
    maquinaProveedorId: 'Maquinaria del Proveedor',
    operadorProveedorId: 'Operador del Proveedor',
  };

  const getMissingFields = useCallback(() => {
    const missing = [];
    if (!datosControl.projectId) missing.push('projectId');
    if (tipoReporte === 'entrada') {
      if (!datosEntrada.tipoOrigen) { missing.push('tipoOrigen'); return missing; }
      if (datosEntrada.tipoOrigen === 'interno') {
        if (!datosControl.repartidorId) missing.push('repartidorId');
        if (!datosControl.equipoSurtidorId) missing.push('equipoSurtidorId');
      } else if (datosEntrada.tipoOrigen === 'estacion') {
        if (!datosEntrada.origen) missing.push('origen');
        if (!datosControl.equipoSurtidorId) missing.push('equipoSurtidorId');
        if (!datosEntrada.destinoCarga) missing.push('destinoCarga');
      } else if (datosEntrada.tipoOrigen === 'externo') {
        if (!datosEntrada.origen) missing.push('origen');
        if (!datosEntrada.maquinaProveedorId) missing.push('maquinaProveedorId');
        if (!datosEntrada.operadorProveedorId) missing.push('operadorProveedorId');
      }
    } else {
      if (!datosControl.repartidorId) missing.push('repartidorId');
      if (!datosControl.equipoSurtidorId) missing.push('equipoSurtidorId');
    }
    return missing;
  }, [datosControl, datosEntrada, tipoReporte]);

  const errSet = new Set(validationErrors);
  const hasErr = (key) => errSet.has(key);

  // Auto-select única estación disponible al cambiar a tipoOrigen 'estacion'
  useEffect(() => {
    if (datosEntrada.tipoOrigen === 'estacion' && estacionesLocal.length === 1 && !datosEntrada.origen) {
      setDatosEntrada(prev => ({ ...prev, origen: estacionesLocal[0].id }));
    }
  }, [datosEntrada.tipoOrigen, datosEntrada.origen, estacionesLocal]);

  const handleNext = () => {
    const missing = getMissingFields();
    if (missing.length > 0) { setValidationErrors(missing); return; }
    setValidationErrors([]);
    setPaso(3);
  };

  const repartidorSel = surtidoresPersonas.find(e => e.id === datosControl.repartidorId);
  const equipoSel = equiposSurtidores.find(m => m.id === datosControl.equipoSurtidorId);

  const proveedorMachines = (machinesLocal || []).filter(m =>
    empresasMatch(m.empresa, resolverNombreEmpresa(datosEntrada.origen))
  );
  const proveedorWorkers = (trabajadoresLocales || []).filter(emp =>
    empresasMatch(emp.empresa, resolverNombreEmpresa(datosEntrada.origen))
  );

  return (
    <div className="flex flex-col space-y-3 pb-32 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex-1 bg-white p-3 sm:p-5 rounded-[2.5rem] border-2 border-slate-100 shadow-xl space-y-4">

        <div>
          <h3 className="text-lg font-black text-slate-800 mb-2 flex items-center gap-3">
            <span className="w-7 h-7 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-black">1</span>
            {tipoReporte === 'entrada' ? "¿De dónde viene el combustible?" : "¿Quién entrega el combustible?"}
          </h3>

          {/* Obra / Fecha / Folio */}
          <div className="pt-3 border-t border-slate-100">
            <div className="grid grid-cols-12 gap-3">
              <div className={`col-span-12 ${isReportesView ? 'md:col-span-8' : 'md:col-span-6'}`}>
                <label className={`block text-xs font-black uppercase mb-1 px-1 tracking-wider ${hasErr('projectId') ? 'text-red-600' : 'text-slate-500'}`}>Obra / Proyecto{hasErr('projectId') && <span className="ml-1 font-normal normal-case">— requerido</span>}</label>
                <div className="flex gap-2">
                  <select
                    value={datosControl.projectId}
                    onChange={(e) => {
                      setDatosControl({ ...datosControl, projectId: e.target.value });
                      cargarEstaciones(e.target.value);
                    }}
                    className={`flex-1 w-full px-3 py-2 bg-slate-50 border-2 rounded-xl focus:border-orange-500 font-bold text-slate-700 text-sm transition-all ${hasErr('projectId') ? 'border-red-400 bg-red-50/30' : 'border-slate-100'}`}
                  >
                    <option value="">Seleccione obra</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name || p.id}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setShowModalProyecto(true)} className="px-3 bg-orange-500 text-white rounded-xl font-black shadow-lg shadow-orange-100 hover:bg-orange-400 text-lg">+</button>
                </div>
              </div>
              <div className={`col-span-12 ${isReportesView ? 'sm:col-span-4 md:col-span-4' : 'sm:col-span-6 md:col-span-3'}`}>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1 px-1 tracking-wider">Fecha</label>
                <input
                  type="date"
                  value={datosControl.fecha}
                  onChange={(e) => setDatosControl({ ...datosControl, fecha: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-orange-500 font-bold text-slate-700 text-sm transition-all"
                />
              </div>
              {isReportesView && (
                <div className="col-span-12 sm:col-span-4 md:col-span-6">
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1 px-1 tracking-wider">N° Folio</label>
                  <input
                    type="text"
                    placeholder="Ej: 1234"
                    value={datosControl.folio || ''}
                    onChange={(e) => setDatosControl({ ...datosControl, folio: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-orange-500 font-bold text-slate-700 text-sm transition-all"
                  />
                </div>
              )}
              <div className={`col-span-12 ${isReportesView ? 'sm:col-span-4 md:col-span-6' : 'sm:col-span-6 md:col-span-3'}`}>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1 px-1 tracking-wider">N° Código</label>
                <input
                  type="text"
                  placeholder="Ej: 527"
                  value={datosControl.codigo || ''}
                  onChange={(e) => setDatosControl({ ...datosControl, codigo: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-orange-500 font-bold text-slate-700 text-sm transition-all"
                />
              </div>
            </div>
          </div>

          {/* Tipo origen (entrada) o toggle empresa (entrega) */}
          {tipoReporte === 'entrada' ? (
            <div className={`mt-4 flex flex-wrap gap-2 justify-center ${hasErr('tipoOrigen') ? 'rounded-2xl ring-2 ring-red-300 p-2' : ''}`}>
              <button
                onClick={() => setDatosEntrada({ ...datosEntrada, tipoOrigen: 'interno', destinoCarga: '', origen: '', maquinaProveedorId: '', operadorProveedorId: '' })}
                className={`px-5 py-2 rounded-xl border-2 transition-all flex items-center gap-2 ${datosEntrada.tipoOrigen === 'interno' ? 'bg-green-50 border-green-500 shadow-md' : 'bg-white border-slate-200 hover:border-green-200'}`}
              >
                <span className={datosEntrada.tipoOrigen === 'interno' ? 'text-green-600' : 'text-slate-400'}>
                  <BuildingIcon className="w-5 h-5" />
                </span>
                <span className={`font-black text-xs uppercase tracking-wider ${datosEntrada.tipoOrigen === 'interno' ? 'text-green-700' : 'text-slate-500'}`}>Interno</span>
              </button>
              <button
                onClick={() => setDatosEntrada({ ...datosEntrada, tipoOrigen: 'estacion', destinoCarga: '', origen: '', machineId: '', maquinaProveedorId: '', operadorProveedorId: '' })}
                className={`px-5 py-2 rounded-xl border-2 transition-all flex items-center gap-2 ${datosEntrada.tipoOrigen === 'estacion' ? 'bg-green-50 border-green-500 shadow-md' : 'bg-white border-slate-200 hover:border-green-200'}`}
              >
                <span className={datosEntrada.tipoOrigen === 'estacion' ? 'text-green-600' : 'text-slate-400'}>
                  <FuelIcon className="w-5 h-5" />
                </span>
                <span className={`font-black text-xs uppercase tracking-wider ${datosEntrada.tipoOrigen === 'estacion' ? 'text-green-700' : 'text-slate-500'}`}>Estación</span>
              </button>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {/* <button
                onClick={() => setDatosEntrega({ ...datosEntrega, empresa: 'MPF Ingeniería Civil' })}
                className={`px-6 py-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 group min-w-[120px] ${esMPF(datosEntrega.empresa) ? 'bg-blue-50 border-blue-500 shadow-lg scale-105' : 'bg-white border-slate-200 hover:border-blue-200'}`}
              >
                <span className={esMPF(datosEntrega.empresa) ? 'text-blue-600' : 'text-slate-400'}>
                  <BuildingIcon />
                </span>
                <span className={`font-black text-xs uppercase tracking-wider ${esMPF(datosEntrega.empresa) ? 'text-blue-700' : 'text-slate-500'}`}>Interno (MPF)</span>
              </button> */}
            </div>
          )}
        </div>

        {/* Selectores por tipoOrigen */}
        <div className="animate-in fade-in slide-in-from-top-4 duration-500">
          {tipoReporte === 'entrada' ? (
            <div className="space-y-4">

              {/* INTERNO */}
              {datosEntrada.tipoOrigen === 'interno' && (
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

                    {/* Repartidor - searchable */}
                    <div className="space-y-2">
                      <label className={`block text-sm font-black uppercase tracking-wider px-1 ${hasErr('repartidorId') ? 'text-red-600' : 'text-slate-500'}`}>
                        Repartidor{hasErr('repartidorId') && <span className="ml-1 font-normal normal-case text-xs">— requerido</span>}
                      </label>
                      {isAdmin ? (
                        datosControl.repartidorId ? (
                          <div className="p-3 bg-gradient-to-br from-green-600 to-emerald-700 text-white rounded-2xl flex items-center gap-3 shadow-md animate-in zoom-in duration-200">
                            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center font-black">{repartidorSel?.nombre?.charAt(0) || '?'}</div>
                            <div className="flex-1 min-w-0">
                              <div className="font-black text-sm uppercase truncate">{repartidorSel?.nombre}</div>
                            </div>
                            <button onClick={() => setDatosControl(prev => ({ ...prev, repartidorId: '' }))} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center font-black transition-all">✕</button>
                          </div>
                        ) : (
                          <>
                            <div className="relative">
                              <input type="text" placeholder="Buscar repartidor..." value={searchRepartidor} onChange={e => setSearchRepartidor(e.target.value)}
                                className={`w-full pl-10 pr-4 py-3 bg-white border-2 rounded-xl focus:border-green-500 font-medium text-sm ${hasErr('repartidorId') ? 'border-red-300' : 'border-slate-200'}`} />
                              <span className="absolute left-3 top-1/2 -translate-y-1/2"><SearchIcon /></span>
                            </div>
                            <div className="max-h-52 overflow-y-auto space-y-1">
                              {surtidoresPersonas.filter(emp => matchWorker(emp, searchRepartidor)).map(emp => (
                                <button key={emp.id} type="button"
                                  onClick={() => { setDatosControl(prev => ({ ...prev, repartidorId: emp.id })); setSearchRepartidor(''); }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 bg-white border-2 border-slate-100 hover:border-green-400 rounded-xl transition-all text-left">
                                  <div className="w-7 h-7 rounded-lg bg-green-50 text-green-600 flex items-center justify-center"><PersonIcon /></div>
                                  <div className="font-black text-sm text-slate-700">{shortName(emp.nombre)}</div>
                                </button>
                              ))}
                            </div>
                          </>
                        )
                      ) : (
                        <div className="px-4 py-3 bg-blue-50 border-2 border-blue-100 rounded-xl font-bold text-blue-900 flex items-center gap-2 text-sm">
                          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center"><PersonIcon /></div>
                          {currentUserData?.nombre || 'Mi usuario'}
                        </div>
                      )}
                    </div>

                    {/* Equipo Surtidor - searchable */}
                    <div className="space-y-2">
                      <label className={`block text-sm font-black uppercase tracking-wider px-1 ${hasErr('equipoSurtidorId') ? 'text-red-600' : 'text-slate-500'}`}>
                        Equipo Surtidor{hasErr('equipoSurtidorId') && <span className="ml-1 font-normal normal-case text-xs">— requerido</span>}
                      </label>
                      {datosControl.equipoSurtidorId ? (
                        <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-2xl flex items-center gap-3 shadow-md animate-in zoom-in duration-200">
                          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center"><TruckIcon /></div>
                          <div className="flex-1 min-w-0">
                            <div className="font-black text-sm uppercase truncate">{equipoSel?.patente || equipoSel?.code}</div>
                            <div className="text-xs opacity-75">{equipoSel?.nombre}</div>
                          </div>
                          <button onClick={() => setDatosControl(prev => ({ ...prev, equipoSurtidorId: '' }))} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center font-black transition-all">✕</button>
                        </div>
                      ) : (
                        <>
                          <div className="relative">
                            <input type="text" placeholder="Buscar equipo..." value={searchEquipo} onChange={e => setSearchEquipo(e.target.value)}
                              className={`w-full pl-10 pr-4 py-3 bg-white border-2 rounded-xl focus:border-green-500 font-medium text-sm ${hasErr('equipoSurtidorId') ? 'border-red-300' : 'border-slate-200'}`} />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2"><SearchIcon /></span>
                          </div>
                          <div className="max-h-52 overflow-y-auto space-y-1">
                            {equiposSurtidores.filter(m => matchMachine({ ...m, tipo: m.nombre }, searchEquipo)).map(m => (
                              <button key={m.id} type="button"
                                onClick={() => { setDatosControl(prev => ({ ...prev, equipoSurtidorId: m.id })); setSearchEquipo(''); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 bg-white border-2 border-slate-100 hover:border-amber-400 rounded-xl transition-all text-left">
                                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center"><TruckLargeIcon className="w-4 h-4" /></div>
                                <div>
                                  <div className="font-black text-sm text-slate-700 uppercase">{m.patente || m.code}</div>
                                  <div className="text-xs text-slate-400">{m.nombre}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                          <button type="button" onClick={() => setShowModalEquipoSurtidor(true)} className="w-full py-2 text-xs font-black text-orange-600 hover:underline">
                            + Registrar nuevo equipo surtidor
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ESTACIÓN */}
              {datosEntrada.tipoOrigen === 'estacion' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                      <label className="block text-sm font-black text-slate-500 uppercase tracking-widest px-1">Seleccione Estación</label>
                      <div className="flex gap-2">
                        <select
                          value={datosEntrada.origen}
                          onChange={(e) => setDatosEntrada({ ...datosEntrada, origen: e.target.value })}
                          className="flex-1 w-full px-4 py-3 bg-white border-2 border-slate-100 rounded-xl focus:border-green-500 font-bold text-slate-700 text-base shadow-sm"
                        >
                          <option value="">Seleccione estación</option>
                          {estacionesLocal.map(est => (
                            <option key={est.id} value={est.id}>{(est.marca ? est.marca + ' - ' : '') + est.nombre}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => setShowModalEstacion(true)} className="px-4 bg-green-600 text-white rounded-xl font-black shadow-lg shadow-green-100 hover:bg-green-500 text-lg">+</button>
                      </div>
                    </div>

                    {/* Equipo Surtidor - searchable */}
                    <div className="bg-amber-50/30 p-4 rounded-2xl border border-amber-100 space-y-2">
                      <label className="block text-sm font-black text-slate-500 uppercase tracking-widest px-1">Equipo que recibe</label>
                      {datosControl.equipoSurtidorId ? (
                        <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-xl flex items-center gap-3 shadow-md">
                          <div className="flex-1 min-w-0">
                            <div className="font-black text-sm uppercase truncate">{equipoSel?.patente || equipoSel?.code}</div>
                          </div>
                          <button onClick={() => setDatosControl(prev => ({ ...prev, equipoSurtidorId: '' }))} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center font-black">✕</button>
                        </div>
                      ) : (
                        <>
                          <div className="relative">
                            <input type="text" placeholder="Buscar equipo..." value={searchEquipo} onChange={e => setSearchEquipo(e.target.value)}
                              className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-amber-100 rounded-xl focus:border-amber-500 font-medium text-sm" />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2"><SearchIcon /></span>
                          </div>
                          <div className="max-h-52 overflow-y-auto space-y-1">
                            {equiposSurtidores.filter(m => matchMachine({ ...m, tipo: m.nombre }, searchEquipo)).map(m => (
                              <button key={m.id} type="button"
                                onClick={() => { setDatosControl(prev => ({ ...prev, equipoSurtidorId: m.id })); setSearchEquipo(''); }}
                                className="w-full flex items-center gap-3 px-3 py-2 bg-white border-2 border-slate-100 hover:border-amber-400 rounded-xl transition-all text-left">
                                <div className="font-black text-sm text-slate-700 uppercase">{m.patente || m.code}</div>
                                <div className="text-xs text-slate-400">{m.nombre}</div>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Destino de carga */}
                  <div className="bg-orange-50/50 p-4 rounded-3xl border-2 border-orange-100 space-y-4">
                    <div className="flex items-center gap-3 border-b border-orange-100 pb-3">
                      <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-black">2</div>
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">¿A qué parte del equipo se carga?</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setDatosEntrada({ ...datosEntrada, destinoCarga: 'camion' })}
                        className={`py-4 rounded-xl border-2 transition-all font-black text-sm uppercase flex flex-col items-center justify-center gap-2 ${datosEntrada.destinoCarga === 'camion' ? 'bg-amber-500 border-amber-600 text-white shadow-lg scale-105' : 'bg-white border-slate-100 text-slate-400 hover:border-amber-200 shadow-sm'}`}
                      >
                        <TruckLargeIcon className="w-7 h-7" />
                        <span>Al Camión</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDatosEntrada({ ...datosEntrada, destinoCarga: 'estanque' })}
                        className={`py-4 rounded-xl border-2 transition-all font-black text-sm uppercase flex flex-col items-center justify-center gap-2 ${datosEntrada.destinoCarga === 'estanque' ? 'bg-blue-600 border-blue-700 text-white shadow-lg scale-105' : 'bg-white border-slate-100 text-slate-400 hover:border-blue-200 shadow-sm'}`}
                      >
                        <TankIcon className="w-7 h-7" />
                        <span>Al Estanque</span>
                      </button>
                    </div>
                    {/* Removes Estanque Receptor select */}
                  </div>

                  {/* Quién recibe */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                    <label className="block text-sm font-black text-slate-500 uppercase tracking-wider px-1">Quién recibe</label>
                    {isAdmin ? (
                      datosEntrada.receptorNombre ? (
                        <div className="p-3 bg-gradient-to-br from-green-600 to-emerald-700 text-white rounded-2xl flex items-center gap-3 shadow-md animate-in zoom-in duration-200">
                          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center font-black text-sm">{datosEntrada.receptorNombre.charAt(0)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="font-black text-sm uppercase truncate">{datosEntrada.receptorNombre}</div>
                          </div>
                          <button onClick={() => setDatosEntrada(prev => ({ ...prev, receptorNombre: '' }))} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center font-black transition-all">✕</button>
                        </div>
                      ) : (
                        <>
                          <div className="relative">
                            <input type="text" placeholder="Buscar receptor..." value={searchReceptor} onChange={e => setSearchReceptor(e.target.value)}
                              className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-green-500 font-medium text-sm" />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2"><SearchIcon /></span>
                          </div>
                          <div className="max-h-52 overflow-y-auto space-y-1">
                            {(trabajadoresLocales || [])
                              .filter(emp => matchWorker(emp, searchReceptor))
                              .map(emp => (
                                <button key={emp.id} type="button"
                                  onClick={() => { setDatosEntrada(prev => ({ ...prev, receptorNombre: emp.nombre })); setSearchReceptor(''); }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 bg-white border-2 border-slate-100 hover:border-green-400 rounded-xl transition-all text-left">
                                  <div className="w-7 h-7 rounded-lg bg-green-50 text-green-600 flex items-center justify-center"><PersonIcon /></div>
                                  <div className="font-black text-sm text-slate-700">{shortName(emp.nombre)}</div>
                                </button>
                              ))}
                          </div>
                          {currentUserData?.nombre && (
                            <button type="button"
                              onClick={() => setDatosEntrada(prev => ({ ...prev, receptorNombre: currentUserData.nombre }))}
                              className="w-full py-2 text-xs font-black text-green-700 hover:underline">
                              Usar mi nombre ({currentUserData.nombre})
                            </button>
                          )}
                        </>
                      )
                    ) : (
                      <div className="px-4 py-3 bg-blue-50 border-2 border-blue-100 rounded-xl font-bold text-blue-900 flex items-center gap-2 text-sm">
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center"><PersonIcon /></div>
                        {currentUserData?.nombre || 'Mi usuario'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* EXTERNO */}
              {datosEntrada.tipoOrigen === 'externo' && (
                <div className="space-y-5 bg-slate-50 p-5 rounded-[2rem] border border-slate-200">
                  <div>
                    <label className="block text-sm font-black text-slate-500 uppercase tracking-widest px-1 mb-2">Empresa Proveedora</label>
                    <div className="flex gap-2">
                      <select
                        value={datosEntrada.origen}
                        onChange={(e) => setDatosEntrada({ ...datosEntrada, origen: e.target.value, maquinaProveedorId: '', operadorProveedorId: '' })}
                        className="flex-1 px-4 py-3 bg-white border-2 border-slate-100 rounded-xl focus:border-green-500 font-bold text-slate-700 text-base shadow-sm"
                      >
                        <option value="">Seleccione empresa</option>
                        {empresasLocal.filter(e => !esMPF(e.id)).map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => setShowModalEmpresa(true)} className="px-4 bg-green-600 text-white rounded-xl font-black shadow-lg shadow-green-100 hover:bg-green-500 text-lg">+</button>
                    </div>
                  </div>

                  {datosEntrada.origen && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-5">
                      {/* Maquinaria Proveedor - searchable */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <label className="block text-sm font-black text-slate-500 uppercase tracking-widest">Maquinaria del Proveedor</label>
                          <button type="button"
                            onClick={() => { setNuevaMaquinaData({ patente: '', tipo: '', modelo: '', empresaId: datosEntrada.origen, targetField: 'maquinaProveedor' }); setShowModalMaquina(true); }}
                            className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-black text-base hover:bg-amber-200">+</button>
                        </div>
                        {datosEntrada.maquinaProveedorId ? (() => {
                          const sel = proveedorMachines.find(m => m.id === datosEntrada.maquinaProveedorId);
                          return (
                            <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-2xl flex items-center gap-3 shadow-md">
                              <div className="flex-1 min-w-0"><div className="font-black text-sm uppercase">{sel?.patente || sel?.code}</div><div className="text-xs opacity-75">{sel?.name || sel?.tipo}</div></div>
                              <button onClick={() => setDatosEntrada(prev => ({ ...prev, maquinaProveedorId: '' }))} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center font-black">✕</button>
                            </div>
                          );
                        })() : (
                          <>
                            <div className="relative">
                              <input type="text" placeholder="Buscar patente o tipo..." value={searchMaquinaProveedor} onChange={e => setSearchMaquinaProveedor(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-green-500 font-medium text-sm" />
                              <span className="absolute left-3 top-1/2 -translate-y-1/2"><SearchIcon /></span>
                            </div>
                            <div className="max-h-52 overflow-y-auto space-y-1">
                              {proveedorMachines.filter(m => matchMachine(m, searchMaquinaProveedor)).map(m => (
                                <button key={m.id} type="button"
                                  onClick={() => { setDatosEntrada(prev => ({ ...prev, maquinaProveedorId: m.id })); setSearchMaquinaProveedor(''); }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 bg-white border-2 border-slate-100 hover:border-amber-400 rounded-xl transition-all text-left">
                                  <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center"><TruckLargeIcon className="w-4 h-4" /></div>
                                  <div><div className="font-black text-sm text-slate-700 uppercase">{m.patente || m.code}</div><div className="text-xs text-slate-400">{m.name || m.tipo}</div></div>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Operador Proveedor - searchable */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <label className="block text-sm font-black text-slate-500 uppercase tracking-widest">Operador del Proveedor</label>
                          <button type="button"
                            onClick={() => { setNuevoEmpleadoData({ nombre: '', rut: '', empresaId: datosEntrada.origen, targetField: 'operadorProveedor' }); setShowModalEmpleado(true); }}
                            className="w-7 h-7 rounded-lg bg-green-100 text-green-700 flex items-center justify-center font-black text-base hover:bg-green-200">+</button>
                        </div>
                        {datosEntrada.operadorProveedorId ? (() => {
                          const sel = proveedorWorkers.find(e => e.id === datosEntrada.operadorProveedorId);
                          return (
                            <div className="p-3 bg-gradient-to-br from-green-600 to-emerald-700 text-white rounded-2xl flex items-center gap-3 shadow-md">
                              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center font-black">{sel?.nombre?.charAt(0) || '?'}</div>
                              <div className="flex-1 min-w-0"><div className="font-black text-sm uppercase truncate">{sel?.nombre}</div><div className="text-xs opacity-75">{sel?.rut}</div></div>
                              <button onClick={() => setDatosEntrada(prev => ({ ...prev, operadorProveedorId: '' }))} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center font-black">✕</button>
                            </div>
                          );
                        })() : (
                          <>
                            <div className="relative">
                              <input type="text" placeholder="Buscar nombre o RUT..." value={searchOperadorProveedor} onChange={e => setSearchOperadorProveedor(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-green-500 font-medium text-sm" />
                              <span className="absolute left-3 top-1/2 -translate-y-1/2"><SearchIcon /></span>
                            </div>
                            <div className="max-h-52 overflow-y-auto space-y-1">
                              {proveedorWorkers.filter(emp => matchWorker(emp, searchOperadorProveedor)).map(emp => (
                                <button key={emp.id} type="button"
                                  onClick={() => { setDatosEntrada(prev => ({ ...prev, operadorProveedorId: emp.id })); setSearchOperadorProveedor(''); }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 bg-white border-2 border-slate-100 hover:border-green-400 rounded-xl transition-all text-left">
                                  <div className="w-7 h-7 rounded-lg bg-green-50 text-green-600 flex items-center justify-center"><PersonIcon /></div>
                                  <div><div className="font-black text-sm text-slate-700">{shortName(emp.nombre)}</div><div className="text-xs text-slate-400">{emp.rut}</div></div>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ENTREGA: identificación del emisor */
            <div className="space-y-4">
              <div className="bg-blue-50/20 p-4 rounded-[2rem] border border-blue-100 space-y-4">
                <div className="flex items-center gap-3 mb-1 px-1">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-black">1</span>
                  <h4 className={`text-sm font-black uppercase tracking-wider ${hasErr('repartidorId') ? 'text-red-600' : 'text-blue-800'}`}>Identificación del Repartidor{hasErr('repartidorId') && <span className="ml-1 font-normal normal-case text-xs">— requerido</span>}</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

                  {/* Repartidor - searchable */}
                  <div className="space-y-2">
                    {isAdmin ? (
                      datosControl.repartidorId ? (
                        <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl flex items-center gap-3 shadow-md animate-in zoom-in duration-200">
                          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center font-black">{repartidorSel?.nombre?.charAt(0) || '?'}</div>
                          <div className="flex-1 min-w-0"><div className="font-black text-sm uppercase truncate">{repartidorSel?.nombre}</div></div>
                          <button onClick={() => setDatosControl(prev => ({ ...prev, repartidorId: '' }))} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center font-black">✕</button>
                        </div>
                      ) : (
                        <>
                          <div className="relative">
                            <input type="text" placeholder="Buscar repartidor..." value={searchRepartidor} onChange={e => setSearchRepartidor(e.target.value)}
                              className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-blue-500 font-medium text-sm" />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2"><SearchIcon /></span>
                          </div>
                          <div className="max-h-52 overflow-y-auto space-y-1">
                            {surtidoresPersonas.filter(emp => matchWorker(emp, searchRepartidor)).map(emp => (
                              <button key={emp.id} type="button"
                                onClick={() => { setDatosControl(prev => ({ ...prev, repartidorId: emp.id })); setSearchRepartidor(''); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 bg-white border-2 border-slate-100 hover:border-blue-400 rounded-xl transition-all text-left">
                                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><PersonIcon /></div>
                                <div className="font-black text-sm text-slate-700">{shortName(emp.nombre)}</div>
                              </button>
                            ))}
                          </div>
                        </>
                      )
                    ) : (
                      <div className="px-4 py-3 bg-white/50 border-2 border-blue-200 rounded-xl font-bold text-blue-900 flex items-center gap-2 text-sm">
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center"><PersonIcon /></div>
                        {currentUserData?.nombre || 'Mi usuario'}
                      </div>
                    )}
                  </div>

                  {/* Equipo Surtidor - searchable */}
                  <div className="space-y-2">
                    <label className={`block text-sm font-black uppercase tracking-wider px-1 ${hasErr('equipoSurtidorId') ? 'text-red-600' : 'text-slate-500'}`}>
                      Equipo que entrega{hasErr('equipoSurtidorId') && <span className="ml-1 font-normal normal-case text-xs">— requerido</span>}
                    </label>
                    {datosControl.equipoSurtidorId ? (
                      <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-2xl flex items-center gap-3 shadow-md animate-in zoom-in duration-200">
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-sm uppercase truncate">{equipoSel?.patente || equipoSel?.code}</div>
                          <div className="text-xs opacity-75">{equipoSel?.nombre}</div>
                        </div>
                        <button onClick={() => setDatosControl(prev => ({ ...prev, equipoSurtidorId: '' }))} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center font-black">✕</button>
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <input type="text" placeholder="Buscar equipo..." value={searchEquipo} onChange={e => setSearchEquipo(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-blue-500 font-medium text-sm" />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2"><SearchIcon /></span>
                        </div>
                        <div className="max-h-52 overflow-y-auto space-y-1">
                          {equiposSurtidores.filter(m => matchMachine({ ...m, tipo: m.nombre }, searchEquipo)).map(m => (
                            <button key={m.id} type="button"
                              onClick={() => { setDatosControl(prev => ({ ...prev, equipoSurtidorId: m.id })); setSearchEquipo(''); }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 bg-white border-2 border-slate-100 hover:border-amber-400 rounded-xl transition-all text-left">
                              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center"><TruckLargeIcon className="w-4 h-4" /></div>
                              <div>
                                <div className="font-black text-sm text-slate-700 uppercase">{m.patente || m.code}</div>
                                <div className="text-xs text-slate-400">{m.nombre}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                        <button type="button" onClick={() => setShowModalEquipoSurtidor(true)} className="w-full py-2 text-xs font-black text-blue-600 hover:underline">
                          + Registrar nuevo equipo surtidor
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Validación */}
        {validationErrors.length > 0 && (
          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-3 flex items-start gap-3">
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

        <div className="flex gap-3 pt-3 border-t border-slate-100">
          <PillButton
            variant="outline"
            onClick={() => setPaso(1)}
            className="flex-1"
          >
            ← Atrás
          </PillButton>
          <PillButton
            variant="primary"
            onClick={handleNext}
            className="flex-1 bg-orange-600 hover:bg-orange-500 text-white shadow-orange-100 hover:shadow-lg"
          >
            Siguiente →
          </PillButton>
        </div>
      </div>
    </div>
  );
}
