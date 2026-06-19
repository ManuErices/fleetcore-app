/*
 * Audita la colección `users` y reporta a qué empresa apunta cada uno.
 * Detecta usuarios apuntando a empresas inexistentes (documentos fantasma).
 *
 * También lista todas las empresas existentes (incluidos padres fantasma)
 * y cuenta qué subcolecciones tiene cada una, para detectar dónde está
 * realmente viviendo la data operativa.
 *
 * Uso (solo lectura, no modifica nada):
 *   node scratch/audit-users-empresas.cjs
 */

const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

const PROJECT_ID = 'mpf-maquinaria';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

// Subcolecciones operativas que conocemos. Si alguna empresa tiene docs
// en estas, se considera que "está siendo usada" desde el código.
const SUBCOLECCIONES_OPERATIVAS = [
  'reportes_combustible',
  'estaciones_combustible',
  'equipos_surtidores',
  'empresas_combustible',
  'machines',
  'projects',
  'trabajadores',
  'reportes_detallados',
  'actividades_disponibles',
  'catalogo_maquinas',
  'costos_fijos',
];

async function listarEmpresas() {
  const refs = await db.collection('empresas').listDocuments();
  const empresas = [];
  for (const ref of refs) {
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : null;
    const subcolCounts = {};
    for (const subcol of SUBCOLECCIONES_OPERATIVAS) {
      const c = await ref.collection(subcol).count().get();
      const n = c.data().count;
      if (n > 0) subcolCounts[subcol] = n;
    }
    empresas.push({
      id: ref.id,
      exists: snap.exists,
      nombre: data?.nombre || data?.razonSocial || null,
      adminUid: data?.adminUid || null,
      adminEmail: data?.adminEmail || null,
      subcolCounts,
    });
  }
  return empresas;
}

async function listarUsers() {
  const snap = await db.collection('users').get();
  return snap.docs.map((d) => ({
    uid: d.id,
    email: d.data().email || null,
    role: d.data().role || null,
    empresaId: d.data().empresaId || null,
    empresaIdRaw: JSON.stringify(d.data().empresaId),
  }));
}

function similar(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  return diff > 0 && diff <= 2;
}

async function main() {
  console.log(`Proyecto: ${PROJECT_ID}`);
  console.log('Modo: SOLO LECTURA');
  console.log('===\n');

  console.log('### EMPRESAS ###\n');
  const empresas = await listarEmpresas();
  const empresasById = new Map(empresas.map((e) => [e.id, e]));

  for (const e of empresas) {
    const tag = e.exists ? 'OK' : 'FANTASMA (sin doc raíz)';
    console.log(`[${tag}] ${e.id}`);
    console.log(`   nombre:    ${e.nombre ?? '-'}`);
    console.log(`   adminUid:  ${e.adminUid ?? '-'}`);
    console.log(`   adminEmail:${e.adminEmail ?? '-'}`);
    const subKeys = Object.keys(e.subcolCounts);
    if (subKeys.length === 0) {
      console.log(`   subcols:   (ninguna con datos)`);
    } else {
      console.log(`   subcols con datos:`);
      subKeys.forEach((k) => console.log(`     - ${k}: ${e.subcolCounts[k]}`));
    }
    console.log('');
  }

  console.log('\n### USERS ###\n');
  const users = await listarUsers();

  for (const u of users) {
    const empresa = u.empresaId ? empresasById.get(u.empresaId.trim?.() ?? u.empresaId) : null;
    let estado;
    if (!u.empresaId) {
      estado = 'sin empresaId';
    } else if (!empresa) {
      estado = 'empresaId NO existe en /empresas';
    } else if (!empresa.exists) {
      estado = `apunta a FANTASMA (${empresa.id})`;
    } else {
      estado = `OK → ${empresa.nombre ?? empresa.id}`;
    }

    console.log(`uid=${u.uid}`);
    console.log(`   email:     ${u.email ?? '-'}`);
    console.log(`   role:      ${u.role ?? '-'}`);
    console.log(`   empresaId: ${u.empresaIdRaw}`);
    console.log(`   estado:    ${estado}`);

    // Si está en fantasma, sugerir empresas reales con IDs similares
    if (u.empresaId) {
      const candidatos = empresas
        .filter((e) => e.exists && e.id !== u.empresaId && similar(e.id, u.empresaId))
        .map((e) => `${e.id} (${e.nombre ?? '-'})`);
      if (candidatos.length) {
        console.log(`   sugerencia: posibles IDs correctos por similitud:`);
        candidatos.forEach((c) => console.log(`     - ${c}`));
      }
    }
    console.log('');
  }

  console.log('\n### RESUMEN ###');
  const stats = { ok: 0, fantasma: 0, inexistente: 0, sin: 0 };
  for (const u of users) {
    const empresa = u.empresaId ? empresasById.get(u.empresaId.trim?.() ?? u.empresaId) : null;
    if (!u.empresaId) stats.sin++;
    else if (!empresa) stats.inexistente++;
    else if (!empresa.exists) stats.fantasma++;
    else stats.ok++;
  }
  console.log(`Total users:                ${users.length}`);
  console.log(`  OK:                       ${stats.ok}`);
  console.log(`  apuntan a fantasma:       ${stats.fantasma}`);
  console.log(`  empresaId no existe:      ${stats.inexistente}`);
  console.log(`  sin empresaId:            ${stats.sin}`);
  console.log(`Total empresas:             ${empresas.length}`);
  console.log(`  reales (con doc raíz):    ${empresas.filter((e) => e.exists).length}`);
  console.log(`  fantasma (sin doc raíz):  ${empresas.filter((e) => !e.exists).length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ERROR:', err);
    process.exit(1);
  });
