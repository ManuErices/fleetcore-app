/*
 * Borra (o lista en dry-run) todos los documentos de
 *   empresas/{empresaId}/reportes_combustible
 * para todas las empresas del proyecto.
 *
 * Uso:
 *   # Dry-run (por defecto): solo cuenta y muestra una muestra
 *   node scratch/delete-reportes-combustible.cjs
 *
 *   # Borrado real
 *   node scratch/delete-reportes-combustible.cjs --confirm
 *
 * Autenticación (cualquiera de las dos):
 *   - export GOOGLE_APPLICATION_CREDENTIALS=/ruta/serviceAccount.json
 *   - gcloud auth application-default login
 *
 * Correr desde la raíz del repo. El script reusa firebase-admin de functions/.
 */

const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

const PROJECT_ID = 'mpf-maquinaria';
const BATCH_SIZE = 500;
const SAMPLE_SIZE = 3;

const confirm = process.argv.includes('--confirm');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

async function deleteCollectionInBatches(collRef) {
  let total = 0;
  while (true) {
    const snap = await collRef.limit(BATCH_SIZE).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    process.stdout.write(`    borrados: ${total}\r`);
    if (snap.size < BATCH_SIZE) break;
  }
  process.stdout.write('\n');
  return total;
}

async function main() {
  console.log(`Proyecto: ${PROJECT_ID}`);
  console.log(`Modo: ${confirm ? 'BORRADO REAL' : 'DRY-RUN (no borra nada)'}`);
  console.log('---');

  // listDocuments() incluye documentos "fantasma" (sin campos pero con subcolecciones).
  // .get() los omite, y aquí precisamente los reportes viven bajo un padre fantasma.
  const empresaRefs = await db.collection('empresas').listDocuments();
  if (empresaRefs.length === 0) {
    console.log('No hay empresas en Firestore.');
    return;
  }

  let granTotal = 0;
  const resumen = [];

  for (const empresaRef of empresaRefs) {
    const empresaId = empresaRef.id;
    const empresaSnap = await empresaRef.get();
    const data = empresaSnap.exists ? empresaSnap.data() : null;
    const empresaName = data?.nombre || data?.razonSocial || (empresaSnap.exists ? '(sin nombre)' : '(documento fantasma)');
    const collRef = empresaRef.collection('reportes_combustible');

    const countSnap = await collRef.count().get();
    const count = countSnap.data().count;

    console.log(`\nEmpresa: ${empresaName}  [${empresaId}]`);
    console.log(`  reportes_combustible: ${count} doc(s)`);

    if (count === 0) {
      resumen.push({ empresaId, empresaName, count: 0, deleted: 0 });
      continue;
    }

    const sampleSnap = await collRef.limit(SAMPLE_SIZE).get();
    sampleSnap.docs.forEach((d) => {
      const x = d.data();
      const fecha = x.fecha || x.fechaCarga || x.createdAt || '';
      console.log(`    - ${d.id}  guia=${x.numeroGuia ?? '-'}  fecha=${fecha}  litros=${x.litros ?? '-'}`);
    });
    if (count > SAMPLE_SIZE) console.log(`    ... y ${count - SAMPLE_SIZE} más`);

    let deleted = 0;
    if (confirm) {
      console.log('  Borrando...');
      deleted = await deleteCollectionInBatches(collRef);
    }

    resumen.push({ empresaId, empresaName, count, deleted });
    granTotal += count;
  }

  console.log('\n=== Resumen ===');
  resumen.forEach((r) => {
    const accion = confirm ? `borrados=${r.deleted}` : `a borrar=${r.count}`;
    console.log(`  ${r.empresaName} [${r.empresaId}]: ${accion}`);
  });
  console.log(`Total reportes_combustible: ${granTotal}`);
  if (!confirm) {
    console.log('\nDRY-RUN. Para borrar realmente:');
    console.log('  node scratch/delete-reportes-combustible.cjs --confirm');
  } else {
    console.log('\nBorrado completado. El próximo numeroGuia se reiniciará en 1.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ERROR:', err);
    process.exit(1);
  });
