import React from 'react';
import { printThermalVoucher, getNextGuiaNumber } from '../utils/voucherThermalGenerator';

/**
 * Componente para generar e imprimir voucher térmico de entrega de combustible
 * Optimizado para impresoras térmicas de 58mm
 */
export default function VoucherGenerator({ 
  reportData,
  projectName,
  machineInfo,
  operadorInfo,
  empresaInfo,
  repartidorInfo,
  equipoSurtidorInfo,
  onClose 
}) {
  const [printing, setPrinting] = React.useState(false);
  const [numeroGuia, setNumeroGuia] = React.useState(null);

  // Obtener número de guía al cargar el componente
  React.useEffect(() => {
    const fetchNumeroGuia = async () => {
      const nextNumber = await getNextGuiaNumber();
      setNumeroGuia(nextNumber);
      console.log('📋 Número de guía asignado:', nextNumber);
    };
    fetchNumeroGuia();
  }, []);

  const handlePrintVoucher = () => {
    try {
      setPrinting(true);
      
      console.log('🖨️ Imprimiendo voucher térmico');
      console.log('📋 Número de guía:', numeroGuia);
      console.log('📋 Datos:', { 
        reportData, 
        projectName, 
        machineInfo, 
        operadorInfo, 
        empresaInfo,
        repartidorInfo,
        equipoSurtidorInfo 
      });
      
      // Imprimir voucher térmico con número correlativo
      printThermalVoucher({
        reportData,
        projectName,
        machineInfo,
        operadorInfo,
        empresaInfo,
        repartidorInfo,
        equipoSurtidorInfo,
        numeroGuiaCorrelativo: numeroGuia
      });

      // Mensaje de éxito
      setTimeout(() => {
        alert(`✅ Voucher N° ${numeroGuia.toString().padStart(3, '0')} enviado a impresión`);
        setPrinting(false);
      }, 500);
      
    } catch (error) {
      console.error('Error imprimiendo voucher:', error);
      alert('❌ Error al imprimir el voucher: ' + error.message);
      setPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-black">¡Reporte Guardado Exitosamente!</h3>
              <p className="text-green-100 text-sm mt-1">¿Deseas imprimir el voucher térmico?</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Resumen del Reporte */}
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-5 border-2 border-slate-200">
            <h4 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Resumen del Reporte
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-slate-600">Fecha:</span>
                <span className="ml-2 font-semibold text-slate-900">{reportData.fecha}</span>
              </div>
              <div>
                <span className="text-slate-600">N° Guía:</span>
                <span className="ml-2 font-semibold text-slate-900">
                  {numeroGuia ? numeroGuia.toString().padStart(3, '0') : 'Generando...'}
                </span>
              </div>
              <div>
                <span className="text-slate-600">Empresa:</span>
                <span className="ml-2 font-semibold text-slate-900">{empresaInfo?.nombre || projectName}</span>
              </div>
              <div>
                <span className="text-slate-600">Cantidad:</span>
                <span className="ml-2 font-semibold text-green-600">{reportData.cantidadLitros} Lts</span>
              </div>
              <div>
                <span className="text-slate-600">Vehículo:</span>
                <span className="ml-2 font-semibold text-slate-900">{machineInfo?.patente || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-600">Repartidor:</span>
                <span className="ml-2 font-semibold text-slate-900">{repartidorInfo?.nombre || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Información del Voucher Térmico */}
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-5 border-2 border-orange-200">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <div className="text-sm text-slate-700">
                <p className="font-semibold mb-2 text-slate-900">El voucher térmico incluirá:</p>
                <ul className="space-y-1.5">
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Formato 58mm (impresora térmica)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Guía de despacho con número correlativo</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Datos de empresa y vehículo</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Fecha y hora de emisión</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Información del repartidor</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Cantidad de diesel en litros</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Espacios para firmas</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Vista previa del formato */}
          <div className="bg-white rounded-lg border-2 border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="font-semibold text-slate-900 text-sm">Formato del voucher</span>
            </div>
            <div className="text-xs text-slate-600 space-y-1">
              <p>📄 Ancho: 58mm (impresora térmica)</p>
              <p>🖨️ Tipo: Ticket de punto de venta</p>
              <p>📝 Contenido: Guía de despacho simplificada</p>
              <p>🔒 Formato: Texto plano optimizado</p>
              <p>📋 Compatible con impresoras POS/ESC-POS</p>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
              disabled={printing}
            >
              Cerrar
            </button>
            <button
              onClick={handlePrintVoucher}
              disabled={printing}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold rounded-xl transition-all shadow-lg disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {printing ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Imprimiendo...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>Imprimir Voucher Térmico</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
