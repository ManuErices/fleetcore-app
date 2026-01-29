import React, { useState } from "react";
import * as XLSX from "xlsx";

export default function OCImporter({ projectId, projects, onImportComplete }) {
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      previewFile(selectedFile);
    }
  };

  const previewFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Buscar la fila de headers (fila 13 en el nuevo formato)
        let headerRow = 13;
        const headers = [];
        for (let col = 0; col < 30; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: headerRow - 1, c: col });
          const cell = worksheet[cellAddress];
          if (cell && cell.v) {
            headers.push(cell.v);
          }
        }

        // Leer datos desde la fila 14 con raw: true
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          range: headerRow,
          header: headers.filter(Boolean),
          defval: null,
          raw: true  // Mantener tipos de datos originales
        });

        // Helper para formatear fecha en preview
        const formatPreviewDate = (value) => {
          if (!value) return '-';
          if (value instanceof Date) {
            return value.toLocaleDateString('es-CL');
          }
          if (typeof value === 'number') {
            const date = new Date((value - 25569) * 86400 * 1000);
            return date.toLocaleDateString('es-CL');
          }
          if (typeof value === 'string') {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              return date.toLocaleDateString('es-CL');
            }
          }
          return String(value);
        };

        // Procesar sample con fechas formateadas
        const processedSample = jsonData.slice(0, 3).map(row => ({
          ...row,
          _fechaFormateada: formatPreviewDate(row['Fecha'])
        }));

        setPreview({
          headers,
          rowCount: jsonData.length,
          sample: processedSample
        });
      } catch (error) {
        console.error("Error al previsualizar:", error);
        alert("Error al leer el archivo");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!file || !projectId) {
      alert("Selecciona un proyecto y un archivo");
      return;
    }

    setImporting(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];

          // Leer headers desde fila 13
          const headerRow = 13;
          const headers = [];
          for (let col = 0; col < 30; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: headerRow - 1, c: col });
            const cell = worksheet[cellAddress];
            if (cell && cell.v) {
              headers.push(cell.v);
            }
          }

          // Leer todas las filas de datos con raw: true
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            range: headerRow,
            header: headers.filter(Boolean),
            defval: null,
            raw: true
          });

          // Helper para convertir a número
          const toNumber = (value) => {
            if (value === null || value === undefined || value === '') return 0;
            const num = Number(value);
            return isNaN(num) ? 0 : num;
          };

          // Helper para convertir fecha
          const formatDate = (value) => {
            if (!value) return '';
            
            if (value instanceof Date) {
              return value.toISOString().split('T')[0];
            }
            
            if (typeof value === 'number') {
              const date = new Date((value - 25569) * 86400 * 1000);
              return date.toISOString().split('T')[0];
            }
            
            if (typeof value === 'string') {
              const date = new Date(value);
              if (!isNaN(date.getTime())) {
                return date.toISOString().split('T')[0];
              }
            }
            
            return String(value);
          };

          // Obtener el nombre del proyecto actual
          const currentProject = projects.find(p => p.id === projectId);
          const projectName = currentProject?.name || '';
          
          console.log(`🔍 Filtrando OCs para proyecto: "${projectName}"`);

          // Agrupar por N° OC y calcular totales
          const ocsMap = {};
          
          jsonData.forEach(row => {
            const numeroOC = String(row['N OC'] || '').trim();
            const obra = String(row['Obra'] || '').trim();
            
            // Filtrar por proyecto
            if (!numeroOC || (projectName && obra.toLowerCase() !== projectName.toLowerCase())) {
              return;
            }
            
            if (!ocsMap[numeroOC]) {
              ocsMap[numeroOC] = {
                numeroOC,
                nombreOC: String(row['Nombre OC'] || ''),
                fecha: formatDate(row['Fecha']),
                fechaDespacho: formatDate(row['Fecha Despacho']),
                metodoDespacho: String(row['Metodo Despacho'] || ''),
                obra: String(row['Obra'] || ''),
                razonSocial: String(row['Razón Social'] || ''),
                rutProveedor: String(row['Rut Proveedor'] || ''),
                proveedor: String(row['Proveedor'] || ''),
                moneda: String(row['Moneda'] || ''),
                items: [],
                // Totales acumulados
                totalMonto: 0,
                totalMontoRecibido: 0,
                totalFacturado: 0,
                totalSaldo: 0,
                totalDevolucion: 0
              };
            }
            
            // Agregar item
            const item = {
              codMaestro: String(row['Cod. Maestro'] || ''),
              descripcion: String(row['Descripción'] || ''),
              glosa: String(row['Glosa'] || ''),
              codigoCC: String(row['Codigo C.C.'] || ''),
              cuentasCosto: String(row['Cuentas de Costo'] || ''),
              unidad: String(row['Unidad'] || ''),
              cantidad: toNumber(row['Cantidad']),
              precioUnitario: toNumber(row['Prec. Unit.']),
              precioUnitDesc: toNumber(row['Prec. Unit. Desc.']),
              descuento: toNumber(row['Descuento']),
              subTotal: toNumber(row['Sub Total']),
              cantRecibida: toNumber(row['Cant. Recibida']),
              montoRecibido: toNumber(row['Monto Recibido']),
              devolucion: toNumber(row['Devolucion']),
              saldoPorRecibir: toNumber(row['Saldo por Recibir']),
              facturado: toNumber(row['Facturado']),
              montoRecepcionesCerradas: toNumber(row['Monto Recepciones Cerradas']),
              estadoLinea: String(row['Estado Linea Recepción OC'] || '')
            };
            
            ocsMap[numeroOC].items.push(item);
            
            // Acumular totales
            ocsMap[numeroOC].totalMonto += item.subTotal;
            ocsMap[numeroOC].totalMontoRecibido += item.montoRecibido;
            ocsMap[numeroOC].totalFacturado += item.facturado;
            ocsMap[numeroOC].totalSaldo += item.saldoPorRecibir;
            ocsMap[numeroOC].totalDevolucion += item.devolucion;
          });

          const purchaseOrders = Object.values(ocsMap).map(oc => ({
            ...oc,
            projectId: projectId
          }));

          console.log(`✅ Importadas ${purchaseOrders.length} órdenes de compra para "${projectName}"`);
          console.log(`📊 Total líneas procesadas: ${jsonData.length}`);

          if (purchaseOrders.length === 0) {
            alert(`No se encontraron órdenes de compra para el proyecto "${projectName}".\n\nVerifica que la columna "Obra" en el Excel coincida con el nombre del proyecto seleccionado.`);
          } else {
            alert(`✅ Se importaron ${purchaseOrders.length} órdenes de compra para "${projectName}"`);
          }

          // Llamar al callback con los datos importados
          if (onImportComplete) {
            onImportComplete(purchaseOrders);
          }

          setFile(null);
          setPreview(null);
        } catch (error) {
          console.error("Error procesando archivo:", error);
          alert("Error al procesar el archivo: " + error.message);
        } finally {
          setImporting(false);
        }
      };

      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error("Error en importación:", error);
      alert("Error al importar: " + error.message);
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-6 bg-violet-50 border-2 border-dashed border-violet-300 rounded-2xl">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>

          <div className="flex-1">
            <h3 className="font-bold text-violet-900 mb-2">
              Importar Órdenes de Compra desde Excel
            </h3>
            <p className="text-sm text-violet-700 mb-2">
              Selecciona un archivo Excel con la estructura estándar de órdenes de compra.
              El archivo debe contener columnas: N OC, Nombre OC, Proveedor, Fecha, Estado, Monto, etc.
            </p>
            {projects && projectId && (
              <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-blue-800">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-semibold">
                    Se importarán solo las OCs del proyecto: "{projects.find(p => p.id === projectId)?.name}"
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <label className="flex-1 cursor-pointer">
                <div className="px-6 py-3 bg-white border-2 border-violet-200 rounded-xl hover:border-violet-400 hover:bg-violet-50 transition-all text-center">
                  <span className="text-sm font-semibold text-violet-700">
                    {file ? file.name : 'Seleccionar archivo Excel'}
                  </span>
                </div>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {file && (
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="px-6 py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importing ? (
                    <span className="flex items-center gap-2">
                      <div className="spinner w-4 h-4 border-white" />
                      Importando...
                    </span>
                  ) : (
                    'Importar'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="p-6 bg-white border border-violet-200 rounded-2xl">
          <h4 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Vista Previa
          </h4>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">Líneas detectadas:</span>
              <span className="px-3 py-1 bg-violet-100 text-violet-700 rounded-lg font-bold">
                {preview.rowCount}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">Columnas:</span>
              <span className="text-slate-600 text-xs">
                {preview.headers.filter(Boolean).slice(0, 10).join(', ')}... ({preview.headers.filter(Boolean).length} columnas)
              </span>
            </div>

            {preview.sample && preview.sample.length > 0 && (
              <div className="mt-4">
                <div className="font-semibold text-slate-700 mb-2">Muestra de datos:</div>
                <div className="space-y-2">
                  {preview.sample.map((row, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-lg text-xs">
                      <div><strong>N° OC:</strong> {row['N OC']}</div>
                      <div><strong>Nombre:</strong> {row['Nombre OC']}</div>
                      <div><strong>Proveedor:</strong> {row['Proveedor']}</div>
                      <div><strong>Obra:</strong> {row['Obra']}</div>
                      <div><strong>Fecha:</strong> {row._fechaFormateada}</div>
                      <div><strong>Descripción:</strong> {row['Descripción']}</div>
                      <div><strong>Cantidad:</strong> {row['Cantidad']}</div>
                      <div><strong>Sub Total:</strong> ${Number(row['Sub Total'] || 0).toLocaleString('es-CL')}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
