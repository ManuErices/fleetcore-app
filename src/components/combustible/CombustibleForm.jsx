import React from "react";
import { useCombustibleForm } from './hooks/useCombustibleForm';
import { ToastContainer } from '../Toast';
import CameraCapture from '../CameraCapture';
import VoucherGenerator from '../VoucherGenerator';
import VoucherHistorialDia from '../VoucherHistorialDia';

import TipoStep from './steps/TipoStep';
import ControlStep from './steps/ControlStep';
import EntradaStep from './steps/EntradaStep';
import EntregaStep from './steps/EntregaStep';

import EquipoSurtidorModal from './modals/EquipoSurtidorModal';
import EmpresaModal from './modals/EmpresaModal';
import MaquinaModal from './modals/MaquinaModal';
import EmpleadoModal from './modals/EmpleadoModal';

export default function CombustibleForm({ empresaId, onClose }) {
  const f = useCombustibleForm(empresaId, onClose);

  const stepLabel = {
    1: "Selecciona el tipo de movimiento",
    2: "Información del Control y Selección",
    3: f.tipoReporte === 'entrada' ? "Entrada de Combustible al Estanque" : "Entrega de Combustible a Máquina",
  }[f.paso] || '';

  return (
    <>
      <ToastContainer toasts={f.toasts} onRemove={f.removeToast} />

      <div className="bg-white w-full max-w-5xl mx-auto overflow-x-hidden relative">

        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 to-amber-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black">Control de Combustible</h2>
              <p className="text-orange-100 text-sm mt-1">{stepLabel}</p>
            </div>
            <button
              onClick={f.handleClose}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Step indicator */}
        <div className="bg-orange-50 p-4 border-b border-orange-200">
          <div className="flex items-center justify-center gap-4">
            {[1, 2, 3].map((n, i) => (
              <React.Fragment key={n}>
                {i > 0 && (
                  <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
                <div className={`flex items-center gap-2 ${f.paso >= n ? 'text-orange-600' : 'text-slate-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${f.paso >= n ? 'bg-orange-600 text-white' : 'bg-slate-200'}`}>
                    {n}
                  </div>
                  <span className="text-sm font-semibold">{['Tipo', 'Selección', 'Detalles'][i]}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="p-6">
          {f.paso === 1 && (
            <TipoStep
              setTipoReporte={f.setTipoReporte}
              setPaso={f.setPaso}
              handleClose={f.handleClose}
            />
          )}

          {f.paso === 2 && (
            <ControlStep
              tipoReporte={f.tipoReporte}
              datosControl={f.datosControl} setDatosControl={f.setDatosControl}
              datosEntrada={f.datosEntrada} setDatosEntrada={f.setDatosEntrada}
              datosEntrega={f.datosEntrega} setDatosEntrega={f.setDatosEntrega}
              projects={f.projects}
              equiposSurtidores={f.equiposSurtidores}
              estacionesLocal={f.estacionesLocal}
              empresasLocal={f.empresasLocal}
              machinesLocal={f.machinesLocal}
              machines={f.machines}
              trabajadoresLocales={f.trabajadoresLocales}
              surtidoresPersonas={f.surtidoresPersonas}
              currentUserData={f.currentUserData}
              isAdmin={f.isAdmin}
              cargarEstaciones={f.cargarEstaciones}
              esMPF={f.esMPF}
              empresasMatch={f.empresasMatch}
              resolverNombreEmpresa={f.resolverNombreEmpresa}
              setPaso={f.setPaso}
              setShowModalEquipoSurtidor={f.setShowModalEquipoSurtidor}
              setShowModalEmpresa={f.setShowModalEmpresa}
              setShowModalMaquina={f.setShowModalMaquina}
              setNuevaMaquinaData={f.setNuevaMaquinaData}
              setShowModalEmpleado={f.setShowModalEmpleado}
              setNuevoEmpleadoData={f.setNuevoEmpleadoData}
            />
          )}

          {f.paso === 3 && f.tipoReporte === 'entrada' && (
            <EntradaStep
              datosEntrada={f.datosEntrada} setDatosEntrada={f.setDatosEntrada}
              datosControl={f.datosControl}
              isAdmin={f.isAdmin}
              currentUserData={f.currentUserData}
              machinesLocal={f.machinesLocal}
              machines={f.machines}
              trabajadoresLocales={f.trabajadoresLocales}
              esMPF={f.esMPF}
              setShowModalMaquina={f.setShowModalMaquina}
              setNuevaMaquinaData={f.setNuevaMaquinaData}
              setShowModalEmpleado={f.setShowModalEmpleado}
              setNuevoEmpleadoData={f.setNuevoEmpleadoData}
              handleSubmit={f.handleSubmit}
              loading={f.loading}
              setPaso={f.setPaso}
            />
          )}

          {f.paso === 3 && f.tipoReporte === 'entrega' && (
            <EntregaStep
              datosEntrega={f.datosEntrega} setDatosEntrega={f.setDatosEntrega}
              machinesLocal={f.machinesLocal}
              trabajadoresLocales={f.trabajadoresLocales}
              empresasLocal={f.empresasLocal}
              esMPF={f.esMPF}
              empresasMatch={f.empresasMatch}
              resolverNombreEmpresa={f.resolverNombreEmpresa}
              firmaReceptor={f.firmaReceptor}
              setFirmaReceptor={f.setFirmaReceptor}
              setShowModalCamaraReceptor={f.setShowModalCamaraReceptor}
              setShowModalMaquina={f.setShowModalMaquina}
              setNuevaMaquinaData={f.setNuevaMaquinaData}
              setShowModalEmpleado={f.setShowModalEmpleado}
              setNuevoEmpleadoData={f.setNuevoEmpleadoData}
              setShowModalEmpresa={f.setShowModalEmpresa}
              searchOperador={f.searchOperador}
              setSearchOperador={f.setSearchOperador}
              handleSubmit={f.handleSubmit}
              loading={f.loading}
              setPaso={f.setPaso}
              nuevaMaquinaData={f.nuevaMaquinaData}
              nuevoEmpleadoData={f.nuevoEmpleadoData}
              isAdmin={f.isAdmin}
            />
          )}
        </div>

        {/* Loading overlay — blocks all interaction while saving */}
        {f.loading && (
          <div className="absolute inset-0 bg-white/85 backdrop-blur-sm z-[200] flex flex-col items-center justify-center gap-5 rounded-2xl">
            <div className="w-14 h-14 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
            <p className="text-sm font-black text-slate-600 uppercase tracking-widest">Guardando registro...</p>
          </div>
        )}
      </div>

      {/* Quick-create modals */}
      {f.showModalEquipoSurtidor && (
        <EquipoSurtidorModal
          data={f.nuevoEquipoSurtidor}
          setData={f.setNuevoEquipoSurtidor}
          onConfirm={f.handleCrearEquipoSurtidor}
          onClose={() => {
            f.setShowModalEquipoSurtidor(false);
            f.setNuevoEquipoSurtidor({ patente: '', nombre: '', tipo: '', marca: '', modelo: '' });
          }}
          loading={f.loadingEquipo}
        />
      )}

      {f.showModalEmpresa && (
        <EmpresaModal
          data={f.nuevaEmpresa}
          setData={f.setNuevaEmpresa}
          onConfirm={f.handleCrearEmpresa}
          onClose={() => {
            f.setShowModalEmpresa(false);
            f.setNuevaEmpresa({ nombre: '', rut: '' });
          }}
          loading={f.loading}
        />
      )}

      {f.showModalMaquina && (
        <MaquinaModal
          data={f.nuevaMaquinaData}
          setData={f.setNuevaMaquinaData}
          empresasLocal={f.empresasLocal}
          esMPF={f.esMPF}
          onConfirm={f.handleCrearMaquina}
          onClose={() => {
            f.setShowModalMaquina(false);
            f.setNuevaMaquinaData({ patente: '', tipo: '', modelo: '', empresaId: '' });
          }}
          loading={f.loading}
        />
      )}

      {f.showModalEmpleado && (
        <EmpleadoModal
          data={f.nuevoEmpleadoData}
          setData={f.setNuevoEmpleadoData}
          empresasLocal={f.empresasLocal}
          esMPF={f.esMPF}
          onConfirm={f.handleCrearEmpleado}
          onClose={() => {
            f.setShowModalEmpleado(false);
            f.setNuevoEmpleadoData({ nombre: '', rut: '', empresaId: '' });
          }}
          loading={f.loading}
        />
      )}

      {/* Camera modals */}
      {f.showModalCamaraRepartidor && (
        <CameraCapture
          color="green"
          title="Identificación Repartidor"
          onCapture={(photo) => f.setFirmaRepartidor(photo)}
          onClose={() => f.setShowModalCamaraRepartidor(false)}
        />
      )}

      {f.showModalCamaraReceptor && (
        <CameraCapture
          color="blue"
          title="Identificación Receptor"
          onCapture={(photo) => f.setFirmaReceptor(photo)}
          onClose={() => f.setShowModalCamaraReceptor(false)}
        />
      )}

      {/* Voucher modal */}
      {f.showVoucherModal && f.lastReportData && (
        <VoucherGenerator
          reportData={f.lastReportData.reportData}
          projectName={f.lastReportData.projectName}
          machineInfo={f.lastReportData.machineInfo}
          operadorInfo={f.lastReportData.operadorInfo}
          empresaInfo={f.lastReportData.empresaInfo}
          repartidorInfo={f.lastReportData.repartidorInfo}
          equipoSurtidorInfo={f.lastReportData.equipoSurtidorInfo}
          reporteId={f.lastReportData.reporteId}
          empresaId={empresaId}
          onClose={() => {
            f.setShowVoucherModal(false);
            f.setLastReportData(null);
            onClose();
          }}
        />
      )}

      {/* Historial del día */}
      <VoucherHistorialDia
        isOpen={f.showHistorial}
        onClose={() => f.setShowHistorial(false)}
        repartidorId={f.datosControl.repartidorId || f.currentUser?.uid}
        repartidorNombre={
          f.repartidorSeleccionado?.nombre ||
          f.currentUserData?.nombre ||
          f.currentUser?.email || ''
        }
        userRole={f.userRole}
        projects={f.projects}
        machines={f.machinesLocal?.length ? f.machinesLocal : (f.machines || [])}
        empleados={f.empleados || []}
        empresaId={empresaId}
      />
    </>
  );
}
