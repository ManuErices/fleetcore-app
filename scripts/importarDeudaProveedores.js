/**
 * importarDeudaProveedores.js
 * ───────────────────────────────────────────────────────────────────────────
 * Sube los 1.231 documentos migrados desde el Excel "Plan de Pagos y detalle
 * deuda proveedores" a Firestore, en la colección:
 *   empresas/{empresaId}/deuda_proveedores/{autoId}
 *
 * USO:
 *   1. EMPRESA_ID ya está configurado (4jBlCkBlSp4HhijZdayd). Si necesitas
 *      usar otro, sobreescríbelo con la variable de entorno FLEETCORE_EMPRESA_ID.
 *   2. Asegúrate de tener configurado tu SDK de Firebase Admin (ver sección
 *      "CONFIGURACIÓN" abajo) — necesitas el archivo de credenciales de
 *      servicio (service account key) descargado desde Firebase Console.
 *   3. Coloca deuda_documentos.json en la misma carpeta que este script.
 *   4. Ejecuta primero en modo seguro:  node importarDeudaProveedores.js --dry-run
 *   5. Si todo se ve bien, ejecuta de verdad:  node importarDeudaProveedores.js
 *
 * El script:
 *   - Sube en lotes de 400 (límite de Firestore es 500 writes por batch)
 *   - Agrega createdAt/updatedAt con serverTimestamp
 *   - Es IDEMPOTENTE si usas el modo --dry-run primero para revisar antes
 *     de escribir de verdad
 *   - Imprime un resumen final con conteos y errores
 * ───────────────────────────────────────────────────────────────────────────
 */

const fs = require("fs");
const path = require("path");

// ─── CONFIGURACIÓN ──────────────────────────────────────────────────────────
// Opción A (recomendada para este script de import único): Firebase Admin SDK
const admin = require("firebase-admin");

// Completa esto con el empresaId real (el mismo que usan tus otros módulos,
// visible en tus componentes vía useEmpresa()).
const EMPRESA_ID = process.env.FLEETCORE_EMPRESA_ID || "4jBlCkBlSp4HhijZdayd";

// Nombre de colección acordado
const COLECCION = "deuda_proveedores";

// Ruta al archivo de credenciales de servicio (descárgalo desde
// Firebase Console > Configuración del proyecto > Cuentas de servicio >
// Generar nueva clave privada). NO subas este archivo a git.
const SERVICE_ACCOUNT_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, "serviceAccountKey.json");

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 400; // Firestore permite hasta 500 writes por batch; dejamos margen

// ─── INICIALIZAR FIREBASE ADMIN ─────────────────────────────────────────────
function initFirebase() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(
      `\n❌ No se encontró el archivo de credenciales en:\n   ${SERVICE_ACCOUNT_PATH}\n\n` +
      `   Descárgalo desde Firebase Console > Configuración del proyecto >\n` +
      `   Cuentas de servicio > Generar nueva clave privada, y guárdalo ahí,\n` +
      `   o define FIREBASE_SERVICE_ACCOUNT_PATH apuntando a su ubicación.\n`
    );
    process.exit(1);
  }
  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return admin.firestore();
}

// ─── VALIDACIONES PREVIAS ───────────────────────────────────────────────────
function validarDocumento(doc, idx) {
  const errores = [];
  if (!doc.proveedorNombre) errores.push("falta proveedorNombre");
  if (typeof doc.valorDoc !== "number") errores.push("valorDoc no es número");
  if (typeof doc.saldoPendiente !== "number") errores.push("saldoPendiente no es número");
  if (!["proveedor", "factoring", "financiera"].includes(doc.tipoDeuda)) {
    errores.push(`tipoDeuda inválido: ${doc.tipoDeuda}`);
  }
  if (
    ![
      "pagado", "vencido", "parcial", "pendiente", "anticipo_excedente",
    ].includes(doc.estado)
  ) {
    errores.push(`estado inválido: ${doc.estado}`);
  }
  if (errores.length) {
    return `Doc #${idx} (${doc.proveedorNombre || "?"} / ${doc.numeroDoc || "?"}): ${errores.join(", ")}`;
  }
  return null;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  if (EMPRESA_ID === "PEGA_AQUI_TU_EMPRESA_ID") {
    console.error("\n❌ Falta configurar EMPRESA_ID en este script (o variable FLEETCORE_EMPRESA_ID).\n");
    process.exit(1);
  }

  const dataPath = path.join(__dirname, "deuda_documentos.json");
  if (!fs.existsSync(dataPath)) {
    console.error(`\n❌ No se encontró deuda_documentos.json en ${__dirname}\n`);
    process.exit(1);
  }
  const docs = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  console.log(`📄 Documentos a importar: ${docs.length}`);

  // Validar todo ANTES de escribir nada
  const erroresValidacion = docs
    .map((d, i) => validarDocumento(d, i))
    .filter(Boolean);

  if (erroresValidacion.length) {
    console.error(`\n❌ Se encontraron ${erroresValidacion.length} documentos inválidos. Abortando.\n`);
    erroresValidacion.slice(0, 20).forEach((e) => console.error("  - " + e));
    process.exit(1);
  }
  console.log("✅ Validación de datos: OK\n");

  if (DRY_RUN) {
    console.log("🔎 DRY RUN — no se escribirá nada en Firestore.");
    console.log(`   Empresa destino: empresas/${EMPRESA_ID}/${COLECCION}`);
    const totalSaldo = docs.reduce((s, d) => s + d.saldoPendiente, 0);
    console.log(`   Total documentos: ${docs.length}`);
    console.log(`   Suma saldoPendiente: $${totalSaldo.toLocaleString("es-CL")}`);
    console.log("\n   Ejecuta sin --dry-run para subir de verdad.\n");
    return;
  }

  const db = initFirebase();
  const colRef = db.collection("empresas").doc(EMPRESA_ID).collection(COLECCION);

  // ── Verificar si ya existen documentos (evitar duplicar en reintentos) ──
  const existentes = await colRef.where("origenMigracion", "!=", null).limit(1).get();
  if (!existentes.empty) {
    console.warn(
      "⚠️  Ya existen documentos con 'origenMigracion' en esta colección.\n" +
      "    Si vuelves a correr este script se DUPLICARÁN los registros.\n" +
      "    Borra la colección primero si quieres re-importar desde cero.\n"
    );
    const respuesta = process.argv.includes("--forzar");
    if (!respuesta) {
      console.error("Abortando. Usa --forzar si de verdad quieres continuar.\n");
      process.exit(1);
    }
  }

  let subidos = 0;
  const erroresEscritura = [];

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const lote = docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    lote.forEach((doc) => {
      const ref = colRef.doc(); // autoId
      batch.set(ref, {
        ...doc,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    try {
      await batch.commit();
      subidos += lote.length;
      console.log(`  ✓ Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${lote.length} documentos subidos (${subidos}/${docs.length})`);
    } catch (err) {
      erroresEscritura.push(`Lote desde índice ${i}: ${err.message}`);
      console.error(`  ✗ Error en lote desde índice ${i}:`, err.message);
    }
  }

  console.log("\n─────────────────────────────────────────");
  console.log(`✅ Importación finalizada: ${subidos}/${docs.length} documentos subidos`);
  if (erroresEscritura.length) {
    console.log(`❌ Errores: ${erroresEscritura.length}`);
    erroresEscritura.forEach((e) => console.log("  - " + e));
  }
  console.log(`📍 Destino: empresas/${EMPRESA_ID}/${COLECCION}`);
  console.log("─────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
