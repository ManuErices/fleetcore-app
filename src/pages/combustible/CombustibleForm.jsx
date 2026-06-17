import React from "react";
import { useCombustibleForm } from './hooks/useCombustibleForm';
import { ToastContainer } from '../../components/Toast';
import CameraCapture from '../../components/CameraCapture';
import VoucherGenerator from '../../components/VoucherGenerator';
import VoucherHistorialDia from '../../components/VoucherHistorialDia';

import TipoStep from './steps/TipoStep';
import ControlStep from './steps/ControlStep';
import EntradaStep from './steps/EntradaStep';
import EntregaStep from './steps/EntregaStep';

import EquipoSurtidorModal from './modals/EquipoSurtidorModal';
import EmpresaModal from './modals/EmpresaModal';
import MaquinaModal from './modals/MaquinaModal';
import EmpleadoModal from './modals/EmpleadoModal';
import ProyectoModal from './modals/ProyectoModal';
import EstacionModal from './modals/EstacionModal';

export default function CombustibleForm({ empresaId, onClose, isReportesView }) {
  const f = useCombustibleForm(empresaId, onClose, isReportesView);

  const stepLabel = {
    1: "Selecciona el tipo de movimiento",
    2: "Información del Control y Selección",
    3: f.tipoReporte === 'entrada' ? "Entrada de Combustible al Estanque" : "Entrega de Combustible a Máquina",
  }[f.paso] || '';

  return (
    <>
      <ToastContainer toasts={f.toasts} onRemove={f.removeToast} />

      <div className="bg-white w-full max-w-5xl mx-auto overflow-x-hidden relative">
        
        {/* Form Content */}
        <div>

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
              isReportesView={isReportesView}
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
              setShowModalProyecto={f.setShowModalProyecto}
              setShowModalEstacion={f.setShowModalEstacion}
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
              isReportesView={isReportesView}
            />
          )}
        </div>
        </div>
        {/* End Form Content */}

        {/* Loading overlay — blocks all interaction while saving */}
        {f.loading && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-md z-[250] flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-200">
            <div className="relative mb-8">
              <div className="w-24 h-24 border-[6px] border-slate-100 border-t-orange-600 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-8 h-8 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                </svg>
              </div>
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">Guardando Registro</h3>
            <p className="text-slate-500 font-bold text-sm uppercase tracking-widest">
              {f.isOfflineSave ? "Guardando en memoria local..." : "Sincronizando con la nube..."}
            </p>
            {f.isOfflineSave && (
              <div className="mt-8 p-4 bg-orange-50 border border-orange-100 rounded-2xl max-w-xs">
                <p className="text-xs text-orange-800 font-medium leading-relaxed">
                  No tienes internet, pero no te preocupes. El registro se guardará en tu teléfono y se enviará cuando recuperes señal.
                </p>
              </div>
            )}
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

      {f.showModalProyecto && (
        <ProyectoModal
          data={f.nuevoProyecto}
          setData={f.setNuevoProyecto}
          onConfirm={f.handleCrearProyecto}
          onClose={() => {
            f.setShowModalProyecto(false);
            f.setNuevoProyecto({ name: '', codigo: '' });
          }}
          loading={f.loading}
        />
      )}

      {f.showModalEstacion && (
        <EstacionModal
          data={f.nuevaEstacion}
          setData={f.setNuevaEstacion}
          onConfirm={f.handleCrearEstacion}
          onClose={() => {
            f.setShowModalEstacion(false);
            f.setNuevaEstacion({ nombre: '', marca: '' });
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
            if (isReportesView) {
              onClose();
            } else {
              f.resetForm();
            }
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
