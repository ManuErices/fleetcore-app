import { auth } from "./firebase";
import { formatRut, limpiarRut, validaRut } from "./rental";

// ============================================================
// Lectura del certificado de estatutos
//
// Manda el archivo al endpoint /api/clientes/extraer-estatutos y
// devuelve los datos que aparecen en el documento, ya normalizados.
//
// Lo que este módulo NO hace: decidir por el usuario. Si un RUT viene
// con dígito verificador malo, se devuelve igual y marcado, para que la
// pantalla lo muestre en rojo. Un RUT mal leído que se guarda callado
// termina en un contrato.
// ============================================================

const ENDPOINT = "/api/clientes/extraer-estatutos";
const MAX_LECTURA_MB = 3;

export const MEDIA_LECTURA = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export function sePuedeLeer(file) {
  if (!file) return false;
  return MEDIA_LECTURA.includes(file.type) && file.size <= MAX_LECTURA_MB * 1024 * 1024;
}

function aBase64(file) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result).split(",")[1]);
    lector.onerror = () => reject(new Error("No se pudo leer el archivo"));
    lector.readAsDataURL(file);
  });
}

export async function extraerDatosEstatutos(file) {
  if (!file) throw new Error("No se seleccionó ningún archivo");
  if (!MEDIA_LECTURA.includes(file.type)) {
    throw new Error("Para leerlo automáticamente sube un PDF o una imagen");
  }
  if (file.size > MAX_LECTURA_MB * 1024 * 1024) {
    throw new Error(
      `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo para lectura es ${MAX_LECTURA_MB} MB. ` +
      "Puedes adjuntarlo igual y completar los datos a mano."
    );
  }

  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Tu sesión expiró. Vuelve a entrar.");
  const idToken = await usuario.getIdToken();

  const archivoBase64 = await aBase64(file);

  const respuesta = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ archivoBase64, mediaType: file.type, nombreArchivo: file.name }),
  });

  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(cuerpo.error || "No se pudo leer el documento");

  return normalizar(cuerpo);
}

// Deja los RUT en formato chileno y avisa si el dígito verificador no cuadra:
// suele significar que el documento está borroso, no que el RUT sea inválido.
function normalizar({ datos = {}, extraidos = [] }) {
  const avisos = [];

  const arreglarRut = (valor, etiqueta) => {
    if (!valor) return "";
    const limpio = limpiarRut(valor);
    if (!validaRut(limpio)) {
      avisos.push(`El ${etiqueta} leído (${valor}) no pasa la validación. Revísalo contra el documento.`);
      return valor;
    }
    return formatRut(limpio);
  };

  const salida = {
    nombre: datos.nombre || "",
    rut: arreglarRut(datos.rut, "RUT de la empresa"),
    giro: datos.giro || "",
    representanteNombre: datos.representanteNombre || "",
    representanteRut: arreglarRut(datos.representanteRut, "RUT del representante"),
    direccion: datos.direccion || "",
    comuna: datos.comuna || "",
    ciudad: datos.ciudad || "",
  };

  if (datos.notas) avisos.push(datos.notas);
  if (!datos.nombre) avisos.push("No se encontró la razón social en el documento.");

  return {
    datos: salida,
    extraidos,
    tipoDocumento: datos.tipoDocumento || "",
    avisos,
  };
}
