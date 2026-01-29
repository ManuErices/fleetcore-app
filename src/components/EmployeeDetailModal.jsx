import React, { useState, useEffect } from "react";
import { upsertEmployeeMonthlyData } from "../lib/db";

export default function EmployeeDetailModal({ 
  employee, 
  monthlyData, 
  year, 
  month, 
  onClose, 
  onSave 
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    diasTrabajados: 0,
    sueldoBase: 0,
    sueldoBruto: 0,
    descuentosLegales: 0,
    otrosDescuentos: 0,
    impuestos: 0,
    sueldoLiquido: 0,
    aporteEmpresa: 0,
    finiquitos: 0,
    totalCosto: 0
  });

  useEffect(() => {
    if (monthlyData) {
      setFormData({
        diasTrabajados: monthlyData.diasTrabajados || 0,
        sueldoBase: monthlyData.sueldoBase || 0,
        sueldoBruto: monthlyData.sueldoBruto || 0,
        descuentosLegales: monthlyData.descuentosLegales || 0,
        otrosDescuentos: monthlyData.otrosDescuentos || 0,
        impuestos: monthlyData.impuestos || 0,
        sueldoLiquido: monthlyData.sueldoLiquido || 0,
        aporteEmpresa: monthlyData.aporteEmpresa || 0,
        finiquitos: monthlyData.finiquitos || 0,
        totalCosto: monthlyData.totalCosto || 0
      });
    }
  }, [monthlyData]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        projectId: employee.projectId,
        employeeId: employee.id,
        year: year,
        month: month,
        ...formData
      };

      if (monthlyData?.id) {
        payload.id = monthlyData.id;
      }

      await upsertEmployeeMonthlyData(payload);
      
      if (onSave) {
        await onSave();
      }
      
      setIsEditing(false);
    } catch (error) {
      console.error("Error guardando:", error);
      alert("Error al guardar los datos");
    } finally {
      setIsSaving(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  // Calcular totales
  const totalHaberes = formData.sueldoBruto;
  const totalDescuentos = formData.descuentosLegales + formData.otrosDescuentos + formData.impuestos;
  const alcanceLiquido = totalHaberes - totalDescuentos;
  const costoTotal = totalHaberes + formData.aporteEmpresa + formData.finiquitos;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 animate-fadeIn"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div 
          className="glass-card rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto pointer-events-auto animate-scaleIn"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
                  <span className="text-white text-2xl font-bold">
                    {employee.nombre.split(' ')[0][0]}{employee.nombre.split(' ')[1]?.[0] || ''}
                  </span>
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900">{employee.nombre}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-sm text-slate-600">RUT: {employee.rut}</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-sm text-slate-600">{employee.cargo}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      employee.tipo === 'OPERADOR' 
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-violet-100 text-violet-700'
                    }`}>
                      {employee.tipo === 'OPERADOR' ? '👷 Operador' : '💼 Gasto General'}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                      📅 {monthNames[month - 1]} {year}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!isEditing ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 rounded-xl font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 transition-all flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Editar
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="btn-primary flex items-center gap-2"
                    >
                      <span className="relative z-10 flex items-center gap-2">
                        {isSaving ? (
                          <>
                            <div className="spinner w-4 h-4 border-white" />
                            Guardando...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Guardar
                          </>
                        )}
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        // Reset form data
                        if (monthlyData) {
                          setFormData({
                            diasTrabajados: monthlyData.diasTrabajados || 0,
                            sueldoBase: monthlyData.sueldoBase || 0,
                            sueldoBruto: monthlyData.sueldoBruto || 0,
                            descuentosLegales: monthlyData.descuentosLegales || 0,
                            otrosDescuentos: monthlyData.otrosDescuentos || 0,
                            impuestos: monthlyData.impuestos || 0,
                            sueldoLiquido: monthlyData.sueldoLiquido || 0,
                            aporteEmpresa: monthlyData.aporteEmpresa || 0,
                            finiquitos: monthlyData.finiquitos || 0,
                            totalCosto: monthlyData.totalCosto || 0
                          });
                        }
                      }}
                      className="px-4 py-2 rounded-xl font-semibold text-slate-700 bg-white border-2 border-slate-200 hover:bg-slate-50 transition-all"
                    >
                      Cancelar
                    </button>
                  </>
                )}
                
                <button
                  onClick={onClose}
                  className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-all"
                >
                  <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Información General */}
            <div className="glass-card rounded-xl p-5">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Información General
              </h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Gerencia</div>
                  <div className="text-sm font-medium text-slate-900">{employee.gerencia || '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Centro de Costo</div>
                  <div className="text-sm font-medium text-slate-900">{employee.centroCosto || '-'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Días Trabajados</div>
                  {isEditing ? (
                    <input
                      type="number"
                      value={formData.diasTrabajados}
                      onChange={(e) => setFormData({...formData, diasTrabajados: Number(e.target.value)})}
                      className="w-full px-3 py-2 rounded-lg border-2 border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                    />
                  ) : (
                    <div className="text-lg font-bold text-slate-900">{formData.diasTrabajados} días</div>
                  )}
                </div>
              </div>
            </div>

            {/* LIQUIDACIÓN DE SUELDO */}
            <div className="space-y-4">
              {/* HABERES */}
              <div className="glass-card rounded-xl overflow-hidden">
                <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-3">
                  <h3 className="text-lg font-bold text-emerald-900 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    HABERES
                  </h3>
                </div>
                <div className="p-5 space-y-3">
                  <LiquidacionRow 
                    label="Sueldo Base"
                    value={formData.sueldoBase}
                    isEditing={isEditing}
                    onChange={(val) => setFormData({...formData, sueldoBase: val})}
                  />
                  <LiquidacionRow 
                    label="Sueldo Bruto (con bonos)"
                    value={formData.sueldoBruto}
                    isEditing={isEditing}
                    onChange={(val) => setFormData({...formData, sueldoBruto: val})}
                    isBold
                  />
                  <div className="pt-3 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-emerald-700 uppercase">Total Haberes</span>
                      <span className="text-xl font-black text-emerald-700">{formatCurrency(totalHaberes)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* DESCUENTOS */}
              <div className="glass-card rounded-xl overflow-hidden">
                <div className="bg-red-50 border-b border-red-200 px-5 py-3">
                  <h3 className="text-lg font-bold text-red-900 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                    DESCUENTOS
                  </h3>
                </div>
                <div className="p-5 space-y-3">
                  <LiquidacionRow 
                    label="Descuentos Legales (AFP, Salud)"
                    value={formData.descuentosLegales}
                    isEditing={isEditing}
                    onChange={(val) => setFormData({...formData, descuentosLegales: val})}
                    isNegative
                  />
                  <LiquidacionRow 
                    label="Otros Descuentos"
                    value={formData.otrosDescuentos}
                    isEditing={isEditing}
                    onChange={(val) => setFormData({...formData, otrosDescuentos: val})}
                    isNegative
                  />
                  <LiquidacionRow 
                    label="Impuestos"
                    value={formData.impuestos}
                    isEditing={isEditing}
                    onChange={(val) => setFormData({...formData, impuestos: val})}
                    isNegative
                  />
                  <div className="pt-3 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-red-700 uppercase">Total Descuentos</span>
                      <span className="text-xl font-black text-red-700">-{formatCurrency(totalDescuentos)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* LÍQUIDO A PAGAR */}
              <div className="glass-card rounded-xl overflow-hidden border-2 border-violet-200">
                <div className="bg-gradient-to-r from-violet-50 to-purple-50 px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-violet-900 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        ALCANCE LÍQUIDO
                      </h3>
                      <div className="text-xs text-violet-600 mt-1">Lo que recibe el trabajador</div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-black text-violet-700">{formatCurrency(alcanceLiquido)}</div>
                      {isEditing && (
                        <div className="text-xs text-violet-600 mt-1">
                          Calculado: Haberes - Descuentos
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* COSTOS EMPRESA */}
              <div className="glass-card rounded-xl overflow-hidden">
                <div className="bg-amber-50 border-b border-amber-200 px-5 py-3">
                  <h3 className="text-lg font-bold text-amber-900 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    COSTOS EMPRESA
                  </h3>
                </div>
                <div className="p-5 space-y-3">
                  <LiquidacionRow 
                    label="Aporte Empresa (Mutual, Seguro)"
                    value={formData.aporteEmpresa}
                    isEditing={isEditing}
                    onChange={(val) => setFormData({...formData, aporteEmpresa: val})}
                  />
                  <LiquidacionRow 
                    label="Finiquitos"
                    value={formData.finiquitos}
                    isEditing={isEditing}
                    onChange={(val) => setFormData({...formData, finiquitos: val})}
                  />
                  <div className="pt-3 border-t-2 border-amber-300">
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold text-amber-800 uppercase">Total Costo Empresa</span>
                      <span className="text-2xl font-black text-amber-700">{formatCurrency(costoTotal)}</span>
                    </div>
                    <div className="text-xs text-amber-600 mt-1">
                      Sueldo Bruto + Aporte Empresa + Finiquitos
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function LiquidacionRow({ label, value, isEditing, onChange, isNegative = false, isBold = false }) {
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="flex items-center justify-between py-2">
      <span className={`text-sm ${isBold ? 'font-bold' : 'font-medium'} text-slate-700`}>
        {label}
      </span>
      {isEditing ? (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-40 px-3 py-2 text-right rounded-lg border-2 border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none font-semibold"
        />
      ) : (
        <span className={`text-sm ${isBold ? 'font-bold text-lg' : 'font-semibold'} ${
          isNegative ? 'text-red-700' : 'text-slate-900'
        }`}>
          {isNegative && value > 0 ? '-' : ''}{formatCurrency(value)}
        </span>
      )}
    </div>
  );
}
