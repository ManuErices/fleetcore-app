import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { useEmpresa } from '../../lib/useEmpresa';

const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL || 'https://us-central1-mpf-maquinaria.cloudfunctions.net';

export default function EmailsSection() {
  const { empresaId } = useEmpresa();
  const [userId, setUserId] = useState(null);

  // Firestore states
  const [domains, setDomains] = useState([]);
  const [selectedDomainName, setSelectedDomainName] = useState('');
  const [mailboxes, setMailboxes] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI action states
  const [newDomainName, setNewDomainName] = useState('');
  const [registeringDomain, setRegisteringDomain] = useState(false);
  const [verifyingDomain, setVerifyingDomain] = useState(false);
  const [deletingDomain, setDeletingDomain] = useState(false);
  const [showRegForm, setShowRegForm] = useState(false);
  
  // Mailbox modal state
  const [mailboxModal, setMailboxModal] = useState(false);
  const [mailboxForm, setMailboxForm] = useState({ localPart: '', password: '', quotaMb: 1024 });
  const [creatingMailbox, setCreatingMailbox] = useState(false);
  const [deletingMailboxId, setDeletingMailboxId] = useState(null);

  // Error/Success alerts
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch current user UID
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(user => {
      if (user) setUserId(user.uid);
    });
    return () => unsub();
  }, []);

  // Listen to domain and mailboxes in Firestore
  useEffect(() => {
    if (!empresaId) return;

    setLoading(true);

    // Listen to domain
    const qDomain = query(collection(db, 'domains'), where('empresaId', '==', empresaId));
    const unsubDomain = onSnapshot(qDomain, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDomains(list);
      if (list.length > 0) {
        setSelectedDomainName(prev => {
          const stillExists = list.some(d => d.domainName === prev);
          return stillExists ? prev : list[0].domainName;
        });
      } else {
        setSelectedDomainName('');
      }
      setLoading(false);
    }, err => {
      console.error("Error listening to domains:", err);
      setLoading(false);
    });

    // Listen to mailboxes
    const qMailboxes = query(collection(db, 'mailboxes'), where('empresaId', '==', empresaId));
    const unsubMailboxes = onSnapshot(qMailboxes, (snap) => {
      setMailboxes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      console.error("Error listening to mailboxes:", err);
    });

    return () => {
      unsubDomain();
      unsubMailboxes();
    };
  }, [empresaId]);

  const domain = domains.find(d => d.domainName === selectedDomainName) || null;
  const filteredMailboxes = mailboxes.filter(mb => mb.domainName === selectedDomainName);

  // Actions
  const handleRegisterDomain = async (e) => {
    e.preventDefault();
    if (!newDomainName.trim() || registeringDomain || !userId) return;

    setRegisteringDomain(true);
    setError('');
    setSuccess('');

    const targetDomain = newDomainName.toLowerCase().trim();

    try {
      const res = await fetch(`${FUNCTIONS_URL}/emailRegisterDomain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domainName: targetDomain,
          empresaId,
          userId
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fallo al registrar dominio');

      setSuccess('Dominio registrado en la plataforma. Configure sus registros DNS detallados a continuación.');
      setSelectedDomainName(targetDomain);
      setNewDomainName('');
      setShowRegForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setRegisteringDomain(false);
    }
  };

  const handleDeleteDomain = async () => {
    if (!domain || deletingDomain || !userId) return;

    if (!window.confirm(`¿Seguro que deseas eliminar el dominio ${domain.domainName}? Esto eliminará permanentemente todas sus casillas asociadas en Migadu y Firestore.`)) {
      return;
    }

    setDeletingDomain(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${FUNCTIONS_URL}/emailDeleteDomain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domainName: domain.domainName,
          userId
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fallo al eliminar el dominio');

      setSuccess(`Dominio ${domain.domainName} y casillas asociadas eliminados con éxito.`);
      setShowRegForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingDomain(false);
    }
  };

  const handleVerifyDomain = async () => {
    if (!domain || verifyingDomain || !userId) return;

    setVerifyingDomain(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${FUNCTIONS_URL}/emailVerifyDomain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domainName: domain.domainName,
          userId
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fallo al verificar el dominio en los servidores DNS');

      setSuccess('¡Felicidades! Dominio verificado exitosamente. Ahora puedes aprovisionar casillas de correo.');
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifyingDomain(false);
    }
  };

  const handleCreateMailbox = async (e) => {
    e.preventDefault();
    if (!domain || !mailboxForm.localPart.trim() || creatingMailbox || !userId) return;

    setCreatingMailbox(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${FUNCTIONS_URL}/emailCreateMailbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domainName: domain.domainName,
          localPart: mailboxForm.localPart.trim(),
          password: mailboxForm.password || undefined,
          quotaMb: parseInt(mailboxForm.quotaMb) || 1024,
          userId
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fallo al crear casilla de correo');

      setSuccess(`Casilla ${data.mailbox?.emailAddress || `${mailboxForm.localPart.trim()}@${domain.domainName}`} creada con éxito.`);
      setMailboxModal(false);
      setMailboxForm({ localPart: '', password: '', quotaMb: 1024 });
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingMailbox(false);
    }
  };

  const handleDeleteMailbox = async (mailbox) => {
    if (!window.confirm(`¿Seguro que deseas eliminar la casilla ${mailbox.emailAddress}? Esta acción borrará permanentemente sus correos y buzón.`)) return;

    setDeletingMailboxId(mailbox.id);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${FUNCTIONS_URL}/emailDeleteMailbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domainName: mailbox.domainName,
          localPart: mailbox.localPart,
          userId
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fallo al eliminar la casilla de correo');

      setSuccess(`Casilla ${mailbox.emailAddress} eliminada con éxito.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingMailboxId(null);
    }
  };

  // Billing preview calculations
  const totalCasillas = mailboxes.length;
  const precioUnitario = 5000;
  const neto = totalCasillas * precioUnitario;
  const iva = Math.round(neto * 0.19);
  const totalBilling = neto + iva;

  if (loading) {
    return <div className="p-12 text-center text-slate-400 text-sm">Cargando modulo de emails...</div>;
  }

  return (
    <div className="space-y-6">
      
      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm font-semibold flex items-start gap-3">
          <span>❌</span>
          <div className="flex-1">{error}</div>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-800 text-sm font-semibold flex items-start gap-3">
          <span>✅</span>
          <div className="flex-1">{success}</div>
        </div>
      )}

      {/* Selector de Dominio */}
      {domains.length > 0 && (
        <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-xl">🌐</span>
            <div className="flex-1 sm:flex-none">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                Dominio Activo
              </label>
              <select
                value={selectedDomainName}
                onChange={e => {
                  setSelectedDomainName(e.target.value);
                  setShowRegForm(false);
                }}
                className="bg-transparent font-bold text-slate-800 text-sm focus:outline-none cursor-pointer border-b-2 border-slate-200 hover:border-blue-400 transition-colors"
              >
                {domains.map(d => (
                  <option key={d.id} value={d.domainName}>
                    {d.domainName} {d.isVerified ? ' (Activo)' : ' (Pendiente)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {!showRegForm ? (
              <>
                <button
                  onClick={() => setShowRegForm(true)}
                  className="px-3 py-1.5 border-2 border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs rounded-xl transition-all"
                >
                  + Registrar Otro
                </button>
                {domain && (
                  <button
                    onClick={handleDeleteDomain}
                    disabled={deletingDomain}
                    className="px-3 py-1.5 border-2 border-red-100 hover:bg-red-50 text-red-600 font-bold text-xs rounded-xl transition-all disabled:opacity-50"
                  >
                    {deletingDomain ? 'Eliminando...' : '🗑️ Desvincular'}
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => setShowRegForm(false)}
                className="px-3 py-1.5 border-2 border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs rounded-xl transition-all"
              >
                ← Volver al Dominio
              </button>
            )}
          </div>
        </div>
      )}

      {/* VIEW 1: DOMAIN REGISTRATION (No domain configured or showRegForm is active) */}
      {(!domain || showRegForm) && (
        <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6 sm:p-8 max-w-xl mx-auto">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100 shadow-sm">
              <span className="text-3xl">📧</span>
            </div>
            <h3 className="text-slate-900 font-black text-xl">Correos Corporativos</h3>
            <p className="text-slate-500 text-sm mt-1">Registra tu dominio para configurar y gestionar tus casillas de correo corporativo.</p>
          </div>

          <form onSubmit={handleRegisterDomain} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Nombre del Dominio
              </label>
              <input
                type="text"
                value={newDomainName}
                onChange={e => setNewDomainName(e.target.value)}
                placeholder="ej: miempresa.cl"
                className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 text-sm transition-colors"
                required
              />
              <p className="text-slate-400 text-[11px] mt-1.5">Asegúrate de ser el propietario y tener acceso a la zona DNS de este dominio.</p>
            </div>

            <button
              type="submit"
              disabled={registeringDomain}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {registeringDomain && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Registrar Dominio
            </button>
          </form>
        </div>
      )}

      {/* VIEW 2: DOMAIN PENDING DNS VERIFICATION */}
      {domain && !domain.isVerified && !showRegForm && (
        <div className="bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="text-white font-black text-lg">Configuración de DNS requerida</h3>
                <p className="text-blue-100 text-xs mt-0.5">Configura los registros de tu dominio <strong>{domain.domainName}</strong></p>
              </div>
            </div>
            <button
              onClick={handleVerifyDomain}
              disabled={verifyingDomain}
              className="px-4 py-2 bg-white text-blue-700 text-xs font-black rounded-xl hover:bg-blue-50 transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              {verifyingDomain && <div className="w-3.5 h-3.5 border-2 border-blue-700/30 border-t-blue-700 rounded-full animate-spin" />}
              Verificar DNS
            </button>
          </div>

          <div className="p-6 space-y-6">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 leading-relaxed">
              <strong>Instrucciones Importantes:</strong> Ve al panel de control de tu proveedor de DNS (Vercel, Cloudflare, GoDaddy o tu hosting) y agrega los siguientes registros. Una vez configurados, haz clic en el botón <strong>Verificar DNS</strong> de arriba. La propagación puede tardar entre 5 minutos y un par de horas.
            </div>

            {/* Verification & DNS Records Table */}
            <div className="space-y-4">
              <h4 className="font-bold text-slate-800 text-sm border-b pb-2">1. Registros de Verificación (TXT)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border divide-y">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Host/Nombre</th>
                      <th className="p-3">Valor / Destino</th>
                      <th className="p-3">Explicación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-mono">
                    <tr>
                      <td className="p-3 font-sans font-bold text-blue-600">TXT</td>
                      <td className="p-3">@</td>
                      <td className="p-3 text-slate-700 break-all select-all">{domain.verificationToken}</td>
                      <td className="p-3 font-sans text-slate-500 text-[10px]">Registro de verificación de dominio requerido por Migadu</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h4 className="font-bold text-slate-800 text-sm border-b pb-2 pt-2">2. Servidores de Correo (MX)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border divide-y">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Host/Nombre</th>
                      <th className="p-3">Prioridad</th>
                      <th className="p-3">Valor / Intercambiador</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-mono">
                    <tr>
                      <td className="p-3 font-sans font-bold text-blue-600">MX</td>
                      <td className="p-3">@</td>
                      <td className="p-3">10</td>
                      <td className="p-3 text-slate-700 select-all">aspmx1.migadu.com.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-sans font-bold text-blue-600">MX</td>
                      <td className="p-3">@</td>
                      <td className="p-3">20</td>
                      <td className="p-3 text-slate-700 select-all">aspmx2.migadu.com.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h4 className="font-bold text-slate-800 text-sm border-b pb-2 pt-2">3. Firma y Antispam (TXT/CNAME)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border divide-y">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Host/Nombre</th>
                      <th className="p-3">Valor / Destino</th>
                      <th className="p-3">Función</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-mono">
                    <tr>
                      <td className="p-3 font-sans font-bold text-blue-600">TXT</td>
                      <td className="p-3">@</td>
                      <td className="p-3 text-slate-700 select-all">v=spf1 include:spf.migadu.com ~all</td>
                      <td className="p-3 font-sans text-slate-500 text-[10px]">SPF (Validador de remitentes)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-sans font-bold text-blue-600">CNAME</td>
                      <td className="p-3">key1._domainkey</td>
                      <td className="p-3 text-slate-700 break-all select-all">key1.{domain.domainName}._domainkey.migadu.com.</td>
                      <td className="p-3 font-sans text-slate-500 text-[10px]">DKIM 1 (Firma digital de correo)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-sans font-bold text-blue-600">CNAME</td>
                      <td className="p-3">key2._domainkey</td>
                      <td className="p-3 text-slate-700 break-all select-all">key2.{domain.domainName}._domainkey.migadu.com.</td>
                      <td className="p-3 font-sans text-slate-500 text-[10px]">DKIM 2</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-sans font-bold text-blue-600">CNAME</td>
                      <td className="p-3">key3._domainkey</td>
                      <td className="p-3 text-slate-700 break-all select-all">key3.{domain.domainName}._domainkey.migadu.com.</td>
                      <td className="p-3 font-sans text-slate-500 text-[10px]">DKIM 3</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: DOMAIN IS VERIFIED (Active dashboard) */}
      {domain && domain.isVerified && !showRegForm && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Col 1: Mailboxes list */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-900 to-slate-800 p-5 flex items-center justify-between">
              <div>
                <h3 className="text-white font-black text-lg">Casillas de Correo</h3>
                <p className="text-blue-100 text-xs mt-0.5">Gestión de cuentas para el dominio <strong>{domain.domainName}</strong></p>
              </div>
              <button
                onClick={() => setMailboxModal(true)}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-black rounded-xl hover:bg-blue-500 transition-all shadow-sm flex items-center gap-1.5"
              >
                <span>+</span> Crear Casilla
              </button>
            </div>

            {filteredMailboxes.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-blue-100">
                  <span className="text-2xl">📥</span>
                </div>
                <p className="text-slate-600 font-semibold mb-1">Sin casillas de correo creadas</p>
                <p className="text-slate-400 text-xs mb-4">Crea tu primera cuenta corporativa para el personal.</p>
                <button
                  onClick={() => setMailboxModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-500 transition-all"
                >
                  Crear Casilla
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase">Dirección</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase">Cuota Asignada</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMailboxes.map(mb => (
                      <tr key={mb.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-4">
                          <div className="font-semibold text-slate-800">{mb.emailAddress}</div>
                          <div className="text-[10px] text-slate-400 font-mono">ID: {mb.id}</div>
                        </td>
                        <td className="p-4 text-slate-600">
                          {mb.storageQuotaMb} MB
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleDeleteMailbox(mb)}
                            disabled={deletingMailboxId === mb.id}
                            className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors border border-red-100 disabled:opacity-50"
                            title="Eliminar Casilla"
                          >
                            {deletingMailboxId === mb.id ? '...' : '🗑️'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Col 2: Invoicing details & configuration card */}
          <div className="space-y-6">
            
            {/* Metered Invoicing Details */}
            <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6">
              <h3 className="text-slate-900 font-black text-base border-b pb-3 mb-4">Resumen de Cobro Activo</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Casillas creadas:</span>
                  <span className="font-bold text-slate-800">{totalCasillas}</span>
                </div>
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Valor unitario:</span>
                  <span className="font-semibold text-slate-700">$5.000 / mes</span>
                </div>
                <div className="border-t my-2 pt-2">
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Monto Neto:</span>
                    <span className="font-semibold text-slate-800">${neto.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>IVA (19%):</span>
                    <span className="font-semibold text-slate-700">${iva.toLocaleString('es-CL')}</span>
                  </div>
                </div>
                <div className="border-t-2 border-slate-100 pt-3 flex justify-between items-baseline">
                  <span className="font-bold text-slate-900 text-sm">Total a Facturar:</span>
                  <span className="font-black text-blue-600 text-xl">${totalBilling.toLocaleString('es-CL')} CLP</span>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5 mt-4 text-[11px] text-blue-700 leading-relaxed">
                ℹ️ <strong>Factura Automática:</strong> Al finalizar el ciclo de facturación se emitirá una Factura afecta a IVA a nombre de tu empresa basada en el consumo real del período y enviada por correo.
              </div>
            </div>

            {/* Email Access and Configuration Information */}
            <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6">
              <h3 className="text-slate-900 font-black text-base border-b pb-3 mb-4">Configuración en Dispositivos</h3>
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Acceso Webmail</div>
                  <p className="text-slate-600 text-xs">Accede al portal web directamente en tu computador:</p>
                  <a href="https://webmail.migadu.com" target="_blank" rel="noreferrer" className="inline-block mt-1.5 text-xs text-blue-600 hover:underline font-bold">
                    🌐 Abrir Webmail de Migadu →
                  </a>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Clientes de Escritorio</div>
                  <p className="text-slate-600 text-xs leading-relaxed">Configura en Outlook, Apple Mail o Thunderbird con los siguientes servidores:</p>
                  <div className="mt-2 p-3 bg-slate-50 rounded-xl font-mono text-[10px] space-y-1 text-slate-700 border border-slate-150">
                    <div><strong>IMAP (Entrada):</strong> imap.migadu.com (Puerto 993, SSL/TLS)</div>
                    <div><strong>SMTP (Salida):</strong> smtp.migadu.com (Puerto 465, SSL/TLS)</div>
                    <div><strong>Usuario:</strong> Correo corporativo completo</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear Casilla */}
      {mailboxModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="bg-gradient-to-r from-blue-900 to-slate-800 p-5 flex items-center justify-between">
              <div>
                <h3 className="text-white font-black text-lg">Nueva Casilla de Correo</h3>
                <p className="text-blue-100 text-xs mt-0.5">Ingresa los datos para la nueva cuenta</p>
              </div>
              <button
                onClick={() => setMailboxModal(false)}
                className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center text-white transition-all font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateMailbox}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Dirección de Correo
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={mailboxForm.localPart}
                      onChange={e => setMailboxForm({ ...mailboxForm, localPart: e.target.value })}
                      placeholder="ej: contacto"
                      className="flex-1 px-3.5 py-2.5 bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 text-sm transition-colors"
                      required
                    />
                    <span className="text-slate-600 font-bold">@{domain?.domainName}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Contraseña Temporal (opcional)
                  </label>
                  <input
                    type="password"
                    value={mailboxForm.password}
                    onChange={e => setMailboxForm({ ...mailboxForm, password: e.target.value })}
                    placeholder="Clave inicial"
                    className="w-full px-3.5 py-2.5 bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 text-sm transition-colors"
                  />
                  <p className="text-slate-400 text-[10px] mt-1">Si la dejas vacía, se enviará una invitación de creación al buzón.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Cuota de Almacenamiento (MB)
                  </label>
                  <select
                    value={mailboxForm.quotaMb}
                    onChange={e => setMailboxForm({ ...mailboxForm, quotaMb: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 text-sm transition-colors"
                  >
                    <option value={512}>512 MB (Liviano)</option>
                    <option value={1024}>1024 MB / 1 GB (Estándar)</option>
                    <option value={2048}>2048 MB / 2 GB (Grande)</option>
                    <option value={5120}>5120 MB / 5 GB (Empresa)</option>
                  </select>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setMailboxModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingMailbox}
                  className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-500 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {creatingMailbox && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Crear Casilla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
