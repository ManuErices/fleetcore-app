import React, { useEffect, useState } from "react";
import { listActiveProjects, listMachines, upsertMachine, deleteMachine } from "../lib/db";
import { useOperatorAssignments } from "../lib/useOperatorAssignments";
import ExcelImporter from "../components/ExcelImporter";

// Tipos de cobro
const BILLING_TYPES = {
  HOURLY: "hourly",        // Por hora máquina
  DAILY_FIXED: "daily",    // Pago fijo por día de operación
  MONTHLY_FIXED: "monthly" // Pago fijo mensual
};

const empty = (projectId = "") => ({
  id: "",
  projectId,
  code: "",
  name: "",
  type: "",
  ownership: "OWN",
  
  // Nuevos campos para importación Excel
  patente: "",
  marca: "",
  modelo: "",
  
  // Tipo de cobro
  billingType: BILLING_TYPES.HOURLY,
  
  // Para cobro por hora (HOURLY)
  minimumMonthlyHours: 110,
  internalRateProductive: 0,
  internalRateStandby: 0,
  clientRateProductive: 0,
  clientRateStandby: 0,
  
  // Para cobro por día fijo (DAILY_FIXED)
  internalRatePerDay: 0,
  clientRatePerDay: 0,
  
  // Para cobro mensual fijo (MONTHLY_FIXED)
  internalRateMonthly: 0,
  clientRateMonthly: 0,
  
  active: true,
});

export default function Machines() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [machines, setMachines] = useState([]);
  const [form, setForm] = useState(empty());
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showImporter, setShowImporter] = useState(false);

  // Hook para obtener operadores asignados
  const { operatorsByMachine } = useOperatorAssignments(projectId);

  useEffect(() => {
    (async () => {
      const p = await listActiveProjects();
      setProjects(p);
      if (p[0]) setProjectId(p[0].id);
    })();
  }, []);

  const refresh = async (pid) => {
    if (!pid) return;
    const m = await listMachines(pid);
    setMachines(m);
  };

  useEffect(() => {
    if (!projectId) return;
    setForm(empty(projectId));
    setShowForm(false);
    refresh(projectId);
  }, [projectId]);

  const onSave = async () => {
    if (!projectId) {
      alert("Error: No hay proyecto seleccionado");
      return;
    }
    
    if (!form.code || !form.name) {
      alert("Error: Código y Nombre son obligatorios");
      return;
    }
    
    setLoading(true);
    try {
      const payload = { 
        ...form, 
        projectId,
        billingType: form.billingType || BILLING_TYPES.HOURLY,
        
        // Nuevos campos
        patente: form.patente || "",
        marca: form.marca || "",
        modelo: form.modelo || "",
        
        // Para cobro por hora
        minimumMonthlyHours: Number(form.minimumMonthlyHours) || 110,
        internalRateProductive: Number(form.internalRateProductive) || 0,
        internalRateStandby: Number(form.internalRateStandby) || 0,
        clientRateProductive: Number(form.clientRateProductive) || 0,
        clientRateStandby: Number(form.clientRateStandby) || 0,
        
        // Para cobro por día
        internalRatePerDay: Number(form.internalRatePerDay) || 0,
        clientRatePerDay: Number(form.clientRatePerDay) || 0,
        
        // Para cobro mensual
        internalRateMonthly: Number(form.internalRateMonthly) || 0,
        clientRateMonthly: Number(form.clientRateMonthly) || 0,
        
        active: form.active !== false
      };
      
      await upsertMachine(payload);
      setForm(empty(projectId));
      setShowForm(false);
      await new Promise(resolve => setTimeout(resolve, 300));
      await refresh(projectId);
    } catch (error) {
      console.error("Error al guardar:", error);
      alert("Error al guardar: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const onEdit = (m) => {
    setForm({ 
      ...m, 
      billingType: m.billingType || BILLING_TYPES.HOURLY,
      patente: m.patente || "",
      marca: m.marca || "",
      modelo: m.modelo || ""
    });
    setShowForm(true);
    setShowImporter(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onDelete = async (id) => {
    if (!id || id.trim() === "") {
      alert("No se puede eliminar: el equipo no tiene ID válido");
      return;
    }
    if (!confirm("¿Eliminar equipo permanentemente?")) return;
    try {
      await deleteMachine(id);
      await refresh(projectId);
    } catch (error) {
      alert("Error al eliminar: " + error.message);
    }
  };

  const handleImportComplete = (results) => {
    console.log("Import complete:", results);
    setShowImporter(false);
    refresh(projectId);
  };

  const ownMachines = machines.filter(m => m.ownership === "OWN");
  const rentedMachines = machines.filter(m => m.ownership === "RENTED");

  return (
    <div className="space-y-6">
      {/* Header - AZUL FLEETCORE */}
      <div className="glass-card rounded-2xl p-6 animate-fadeInUp">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4 lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                  Equipos y Servicios
                </h1>
                <p className="text-slate-600 mt-1 text-sm">
                  Gestiona equipos, importa desde Excel y configura modalidades de cobro
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="input-modern"
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <button
              onClick={() => {
                setShowImporter(!showImporter);
                setShowForm(false);
              }}
              className="px-6 py-3 rounded-xl font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-200 transition-all flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {showImporter ? 'Cerrar' : 'Importar Excel'}
            </button>

            <button
              onClick={() => {
                setForm(empty(projectId));
                setShowForm(!showForm);
                setShowImporter(false);
              }}
              className="px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 shadow-lg hover:shadow-xl transition-all flex items-center gap-2 whitespace-nowrap"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showForm ? "M5 15l7-7 7 7" : "M12 4v16m8-8H4"} />
              </svg>
              {showForm ? 'Cerrar' : 'Nuevo Equipo'}
            </button>
          </div>
        </div>

        {/* Stats - AZUL FLEETCORE */}
        <div className="mt-6 pt-6 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatBadge label="Total equipos" value={machines.length} color="blue" />
          <StatBadge label="Propios" value={ownMachines.length} color="emerald" />
          <StatBadge label="Arrendados" value={rentedMachines.length} color="orange" />
          <StatBadge label="Activos" value={machines.filter(m => m.active).length} color="slate" />
        </div>
      </div>

      {/* Importador Excel */}
      {showImporter && (
        <ExcelImporter 
          projectId={projectId}
          onImportComplete={handleImportComplete}
        />
      )}

      {/* Formulario - AZUL FLEETCORE */}
      {showForm && (
        <div className="glass-card rounded-2xl p-6 animate-scaleIn">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {form.id ? "Editar Equipo" : "Nuevo Equipo"}
              </h2>
              <p className="text-sm text-slate-600">Complete la información del equipo</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Información básica */}
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">
                Información Básica
              </h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Field 
                  label="Código" 
                  value={form.code} 
                  onChange={(v) => setForm({ ...form, code: v })} 
                  placeholder="EX-001" 
                  required 
                />
                <Field 
                  label="Nombre" 
                  value={form.name} 
                  onChange={(v) => setForm({ ...form, name: v })} 
                  placeholder="Excavadora CAT 320" 
                  required 
                />
                <Field 
                  label="Tipo" 
                  value={form.type} 
                  onChange={(v) => setForm({ ...form, type: v })} 
                  placeholder="Excavadora" 
                />
                <Field 
                  label="Marca" 
                  value={form.marca} 
                  onChange={(v) => setForm({ ...form, marca: v })} 
                  placeholder="CATERPILLAR" 
                />
                <Field 
                  label="Modelo" 
                  value={form.modelo} 
                  onChange={(v) => setForm({ ...form, modelo: v })} 
                  placeholder="320D" 
                />
                <Field 
                  label="Patente" 
                  value={form.patente} 
                  onChange={(v) => setForm({ ...form, patente: v })} 
                  placeholder="ABCD12" 
                />
              </div>
            </div>

            {/* Propiedad */}
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">
                Propiedad
              </h3>
              <div className="flex gap-4">
                <button
                  onClick={() => setForm({ ...form, ownership: "OWN" })}
                  className={`flex-1 px-6 py-4 rounded-xl border-2 transition-all ${
                    form.ownership === "OWN"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    <span className="font-semibold">Propio</span>
                  </div>
                </button>
                <button
                  onClick={() => setForm({ ...form, ownership: "RENTED" })}
                  className={`flex-1 px-6 py-4 rounded-xl border-2 transition-all ${
                    form.ownership === "RENTED"
                      ? "border-orange-500 bg-orange-50 text-orange-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    <span className="font-semibold">Arrendado</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Modalidad de cobro - AZUL FLEETCORE */}
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">
                Modalidad de Cobro
              </h3>
              <div className="grid sm:grid-cols-3 gap-4">
                <BillingTypeButton
                  active={form.billingType === BILLING_TYPES.HOURLY}
                  onClick={() => setForm({ ...form, billingType: BILLING_TYPES.HOURLY })}
                  icon={
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                  title="Por Hora"
                  description="Cobro por horas trabajadas"
                />
                <BillingTypeButton
                  active={form.billingType === BILLING_TYPES.DAILY_FIXED}
                  onClick={() => setForm({ ...form, billingType: BILLING_TYPES.DAILY_FIXED })}
                  icon={
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  }
                  title="Diario Fijo"
                  description="Tarifa fija por día"
                />
                <BillingTypeButton
                  active={form.billingType === BILLING_TYPES.MONTHLY_FIXED}
                  onClick={() => setForm({ ...form, billingType: BILLING_TYPES.MONTHLY_FIXED })}
                  icon={
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  }
                  title="Mensual Fijo"
                  description="Tarifa fija mensual"
                />
              </div>
            </div>

            {/* Campos según tipo de cobro */}
            {form.billingType === BILLING_TYPES.HOURLY && <HourlyRatesForm form={form} setForm={setForm} />}
            {form.billingType === BILLING_TYPES.DAILY_FIXED && <DailyRatesForm form={form} setForm={setForm} />}
            {form.billingType === BILLING_TYPES.MONTHLY_FIXED && <MonthlyRatesForm form={form} setForm={setForm} />}

            {/* Botones */}
            <div className="flex items-center gap-3 pt-6 border-t border-slate-200">
              <button
                onClick={onSave}
                disabled={loading}
                className="flex-1 px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Guardando..." : "Guardar Equipo"}
              </button>
              <button
                onClick={() => {
                  setForm(empty(projectId));
                  setShowForm(false);
                }}
                className="px-6 py-3 rounded-xl font-semibold text-slate-700 bg-white border-2 border-slate-200 hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Listas de equipos */}
      {ownMachines.length > 0 && (
        <MachineGroup 
          title="Equipos Propios" 
          machines={ownMachines} 
          onEdit={onEdit} 
          onDelete={onDelete}
          operatorsByMachine={operatorsByMachine}
          color="emerald"
        />
      )}

      {rentedMachines.length > 0 && (
        <MachineGroup 
          title="Equipos Arrendados" 
          machines={rentedMachines} 
          onEdit={onEdit} 
          onDelete={onDelete}
          operatorsByMachine={operatorsByMachine}
          color="orange"
        />
      )}

      {machines.length === 0 && !loading && (
        <div className="glass-card rounded-2xl p-16 text-center">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-blue-100 flex items-center justify-center mb-4">
            <svg className="w-10 h-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">
            No hay equipos registrados
          </h3>
          <p className="text-slate-600 mb-4">
            Agrega un equipo manualmente o importa desde Excel
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setShowForm(true)}
              className="px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 shadow-lg hover:shadow-xl transition-all"
            >
              Nuevo Equipo
            </button>
            <button
              onClick={() => setShowImporter(true)}
              className="px-6 py-3 rounded-xl font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-200 transition-all"
            >
              Importar Excel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// COMPONENTES AUXILIARES CON BRANDING FLEETCORE

function StatBadge({ label, value, color }) {
  const colors = {
    blue: 'from-blue-900 to-blue-700',
    emerald: 'from-emerald-600 to-teal-600',
    orange: 'from-orange-600 to-red-600',
    slate: 'from-slate-600 to-slate-800'
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50">
      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colors[color]} flex items-center justify-center shadow-md`}>
        <span className="text-white text-lg font-black">{value}</span>
      </div>
      <span className="text-sm font-semibold text-slate-600">{label}</span>
    </div>
  );
}

function BillingTypeButton({ active, onClick, icon, title, description }) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-4 rounded-xl border-2 transition-all text-left ${
        active
          ? "border-blue-500 bg-blue-50"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
        }`}>
          {icon}
        </div>
        <div className="flex-1">
          <div className={`font-bold mb-1 ${active ? "text-blue-700" : "text-slate-900"}`}>
            {title}
          </div>
          <div className={`text-xs ${active ? "text-blue-600" : "text-slate-500"}`}>
            {description}
          </div>
        </div>
      </div>
    </button>
  );
}

function Field({ label, value, onChange, placeholder, required, type = "text" }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-modern w-full"
      />
    </div>
  );
}

function HourlyRatesForm({ form, setForm }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">
          Horas y Tarifas
        </h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            label="Horas Mínimas Mensuales"
            type="number"
            value={form.minimumMonthlyHours}
            onChange={(v) => setForm({ ...form, minimumMonthlyHours: v })}
            placeholder="110"
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">
          Tarifas Internas
        </h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            label="Productiva ($/hr)"
            type="number"
            value={form.internalRateProductive}
            onChange={(v) => setForm({ ...form, internalRateProductive: v })}
            placeholder="15000"
          />
          <Field
            label="Standby ($/hr)"
            type="number"
            value={form.internalRateStandby}
            onChange={(v) => setForm({ ...form, internalRateStandby: v })}
            placeholder="7500"
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">
          Tarifas Cliente
        </h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            label="Productiva ($/hr)"
            type="number"
            value={form.clientRateProductive}
            onChange={(v) => setForm({ ...form, clientRateProductive: v })}
            placeholder="25000"
          />
          <Field
            label="Standby ($/hr)"
            type="number"
            value={form.clientRateStandby}
            onChange={(v) => setForm({ ...form, clientRateStandby: v })}
            placeholder="12500"
          />
        </div>
      </div>
    </div>
  );
}

function DailyRatesForm({ form, setForm }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">
        Tarifas Diarias
      </h3>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field
          label="Costo Interno ($/día)"
          type="number"
          value={form.internalRatePerDay}
          onChange={(v) => setForm({ ...form, internalRatePerDay: v })}
          placeholder="200000"
        />
        <Field
          label="Cobro Cliente ($/día)"
          type="number"
          value={form.clientRatePerDay}
          onChange={(v) => setForm({ ...form, clientRatePerDay: v })}
          placeholder="350000"
        />
      </div>
    </div>
  );
}

function MonthlyRatesForm({ form, setForm }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">
        Tarifas Mensuales
      </h3>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field
          label="Costo Interno ($/mes)"
          type="number"
          value={form.internalRateMonthly}
          onChange={(v) => setForm({ ...form, internalRateMonthly: v })}
          placeholder="5000000"
        />
        <Field
          label="Cobro Cliente ($/mes)"
          type="number"
          value={form.clientRateMonthly}
          onChange={(v) => setForm({ ...form, clientRateMonthly: v })}
          placeholder="8500000"
        />
      </div>
    </div>
  );
}

function MachineGroup({ title, machines, onEdit, onDelete, operatorsByMachine = {}, color }) {
  const colorClasses = {
    emerald: {
      bg: 'from-emerald-50 to-teal-50',
      border: 'border-emerald-200',
      text: 'text-emerald-900',
      icon: 'from-emerald-600 to-teal-600'
    },
    orange: {
      bg: 'from-orange-50 to-red-50',
      border: 'border-orange-200',
      text: 'text-orange-900',
      icon: 'from-orange-600 to-red-600'
    }
  };

  const colors = colorClasses[color];

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className={`px-6 py-4 bg-gradient-to-r ${colors.bg} border-b ${colors.border}`}>
        <h3 className={`text-lg font-bold ${colors.text}`}>
          🚛 {title}
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Equipo</th>
              <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Operador</th>
              <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Tipo</th>
              <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Cobro</th>
              <th className="text-right px-6 py-4 text-xs font-bold text-slate-600 uppercase">Tarifa</th>
              <th className="text-right px-6 py-4 text-xs font-bold text-slate-600 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {machines.map(m => {
              const operator = operatorsByMachine[m.id];
              const billingLabel = m.billingType === "hourly" ? "Por Hora" : 
                                 m.billingType === "daily" ? "Diario" : "Mensual";
              const rate = m.billingType === "hourly" ? m.clientRateProductive :
                          m.billingType === "daily" ? m.clientRatePerDay :
                          m.clientRateMonthly;

              return (
                <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-md flex-shrink-0">
                        <span className="text-white text-xs font-bold">
                          {m.code?.substring(0, 2).toUpperCase() || 'EQ'}
                        </span>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{m.code}</div>
                        <div className="text-xs text-slate-500">{m.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {operator ? (
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {operator.nombre.split(' ').slice(0, 2).join(' ')}
                          </div>
                          <div className="text-xs text-slate-500">
                            {operator.diasTrabajados > 0 ? `${operator.diasTrabajados} días` : 'Sin días asignados'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-slate-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="text-sm italic">Sin operador</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-slate-600">{m.type || "-"}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                      m.billingType === "hourly" ? "bg-blue-100 text-blue-700" :
                      m.billingType === "daily" ? "bg-amber-100 text-amber-700" :
                      "bg-violet-100 text-violet-700"
                    }`}>
                      {billingLabel}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-semibold text-slate-900">
                      ${Number(rate || 0).toLocaleString('es-CL')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onEdit(m)}
                        className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Editar"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onDelete(m.id)}
                        className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                        title="Eliminar"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
