/**
 * migrate-multiempresa.mjs
 * ─────────────────────────────────────────────────────────────
 * Prepara los usuarios existentes para el modelo multiempresa.
 *
 * Qué hace:
 *   1. A cada usuario que no tenga `empresasIds`, se lo crea con su
 *      `empresaId` actual dentro. Nadie cambia de empresa ni pierde acceso.
 *   2. Detecta cuentas duplicadas: el mismo correo (o el mismo RUT) con
 *      varios uid en empresas distintas. Solo las REPORTA; no las fusiona,
 *      porque unir dos cuentas de Firebase Auth implica decidir cuál
 *      sobrevive y eso no se automatiza a ciegas.
 *
 * IMPORTANTE: corre esto ANTES de desplegar las reglas nuevas.
 *
 * Uso:
 *   # Vista previa, no escribe nada
 *   node scripts/migrate-multiempresa.mjs
 *
 *   # Aplicar
 *   node scripts/migrate-multiempresa.mjs --confirm
 *
 *   # Vincular manualmente un usuario a una segunda empresa
 *   node scripts/migrate-multiempresa.mjs --vincular <uid> <empresaId> --confirm
 *
 * Autenticación (cualquiera de las dos):
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\\ruta\\serviceAccount.json
 *   gcloud auth application-default login
 */

import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require(path.join(process.cwd(), 'functions', 'node_modules', 'firebase-admin'));

const PROJECT_ID = 'mpf-maquinaria';

const args     = process.argv.slice(2);
const confirm  = args.includes('--confirm');
const idxVinc  = args.indexOf('--vincular');
const vincular = idxVinc >= 0 ? { uid: args[idxVinc + 1], empresaId: args[idxVinc + 2] } : null;

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

const norm = (s) => String(s || '').trim().toLowerCase();
const normRut = (s) => String(s || '').replace(/[.\-\s]/g, '').toUpperCase();

async function nombresEmpresas() {
  const snap = await db.collection('empresas').get();
  const map = {};
  snap.docs.forEach(d => { map[d.id] = d.data()?.nombre || d.id; });
  return map;
}

// ── Vincular un usuario puntual a otra empresa ────────────────
async function vincularUsuario(uid, empresaId, empresas) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) { console.log(`✗ El usuario ${uid} no existe.`); return; }

  const data = snap.data() || {};
  const actuales = Array.isArray(data.empresasIds) && data.empresasIds.length
    ? data.empresasIds
    : (data.empresaId ? [data.empresaId] : []);

  if (actuales.includes(empresaId)) {
    console.log(`= ${data.email || uid} ya pertenece a ${empresas[empresaId] || empresaId}`);
    return;
  }
  if (!empresas[empresaId]) {
    console.log(`✗ La empresa ${empresaId} no existe.`);
    return;
  }

  const nuevas = [...new Set([...actuales, empresaId])];
  console.log(`+ ${data.email || uid}: ${actuales.length} → ${nuevas.length} empresas`);
  nuevas.forEach(id => console.log(`    · ${empresas[id] || id}`));

  if (!confirm) { console.log('  (dry-run, no se escribió)'); return; }

  await ref.set({
    empresasIds: nuevas,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  // Espejo en la subcolección de la empresa, que es donde el resto del
  // sistema busca a los usuarios de un tenant.
  await db.collection('empresas').doc(empresaId).collection('users').doc(uid).set({
    empresaId,
    email: data.email || '',
    nombre: data.nombre || '',
    role:   data.role || 'operador',
    modulos: data.modulos || [],
    estado: 'activo',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log('  ✓ vinculado');
}

// ── Migración masiva ──────────────────────────────────────────
async function migrar(empresas) {
  const snap = await db.collection('users').get();
  console.log(`Usuarios totales: ${snap.size}\n`);

  let yaListos = 0;
  const porMigrar = [];
  const sinEmpresa = [];

  snap.docs.forEach(d => {
    const u = d.data() || {};
    if (Array.isArray(u.empresasIds) && u.empresasIds.length) { yaListos++; return; }
    if (!u.empresaId) { sinEmpresa.push({ uid: d.id, email: u.email, role: u.role }); return; }
    porMigrar.push({ uid: d.id, email: u.email, role: u.role, empresaId: u.empresaId });
  });

  console.log(`Ya tienen empresasIds : ${yaListos}`);
  console.log(`Por migrar            : ${porMigrar.length}`);
  console.log(`Sin empresaId         : ${sinEmpresa.length}`);

  if (sinEmpresa.length) {
    console.log('\n⚠ Usuarios sin empresa asignada (no se tocan, revísalos a mano):');
    sinEmpresa.slice(0, 20).forEach(u => console.log(`   ${u.email || u.uid}  rol=${u.role || '—'}`));
    if (sinEmpresa.length > 20) console.log(`   …y ${sinEmpresa.length - 20} más`);
  }

  if (porMigrar.length && confirm) {
    console.log('\nEscribiendo…');
    // Lotes de 400 para no pasarse del límite de 500 operaciones
    for (let i = 0; i < porMigrar.length; i += 400) {
      const lote = db.batch();
      porMigrar.slice(i, i + 400).forEach(u => {
        lote.set(db.collection('users').doc(u.uid), {
          empresasIds: [u.empresaId],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      await lote.commit();
      console.log(`  ${Math.min(i + 400, porMigrar.length)}/${porMigrar.length}`);
    }
    console.log('✓ Migración aplicada');
  } else if (porMigrar.length) {
    console.log('\n(dry-run: agrega --confirm para escribir)');
  }

  return snap;
}

// ── Detección de cuentas duplicadas ───────────────────────────
function reportarDuplicados(snap, empresas) {
  const porEmail = {};
  const porRut = {};

  snap.docs.forEach(d => {
    const u = d.data() || {};
    const registro = {
      uid: d.id,
      email: u.email || '',
      rut: u.rut || '',
      nombre: u.nombre || '',
      role: u.role || '',
      empresaId: u.empresaId || '',
    };
    if (u.email) (porEmail[norm(u.email)] ||= []).push(registro);
    if (u.rut)   (porRut[normRut(u.rut)]  ||= []).push(registro);
  });

  const dupEmail = Object.entries(porEmail).filter(([, v]) => v.length > 1);
  const dupRut = Object.entries(porRut).filter(([, v]) => {
    if (v.length < 2) return false;
    // Solo interesa si están en empresas distintas
    return new Set(v.map(x => x.empresaId)).size > 1;
  });

  console.log('\n─────────────────────────────────────────────');
  console.log('CUENTAS POSIBLEMENTE DUPLICADAS');
  console.log('─────────────────────────────────────────────');

  if (!dupEmail.length && !dupRut.length) {
    console.log('No se detectaron duplicados.');
    return;
  }

  const mostrar = (titulo, grupos) => {
    if (!grupos.length) return;
    console.log(`\n${titulo}:`);
    grupos.forEach(([clave, lista]) => {
      console.log(`\n  ${clave}`);
      lista.forEach(u => {
        console.log(`    uid=${u.uid}`);
        console.log(`      nombre=${u.nombre || '—'}  rol=${u.role || '—'}`);
        console.log(`      empresa=${empresas[u.empresaId] || u.empresaId || '—'}`);
      });
      console.log(`    → Para unificar, quédate con UN uid y vincúlalo:`);
      const uids = [...new Set(lista.map(u => u.uid))];
      const eids = [...new Set(lista.map(u => u.empresaId).filter(Boolean))];
      eids.forEach(eid => {
        console.log(`       node scripts/migrate-multiempresa.mjs --vincular ${uids[0]} ${eid} --confirm`);
      });
    });
  };

  mostrar('Mismo correo en varios uid', dupEmail);
  mostrar('Mismo RUT en empresas distintas', dupRut);

  console.log('\nNota: este script NO fusiona cuentas. Elige cuál uid conserva');
  console.log('la persona, vincúlalo a todas sus empresas con --vincular, y');
  console.log('recién entonces desactiva el uid sobrante.');
}

async function main() {
  console.log(`Proyecto: ${PROJECT_ID}`);
  console.log(`Modo: ${confirm ? 'ESCRITURA REAL' : 'DRY-RUN (no escribe nada)'}`);
  console.log('---');

  const empresas = await nombresEmpresas();
  console.log(`Empresas en el sistema: ${Object.keys(empresas).length}`);
  Object.entries(empresas).forEach(([id, n]) => console.log(`   ${n}  [${id}]`));
  console.log('');

  if (vincular) {
    if (!vincular.uid || !vincular.empresaId) {
      console.log('Uso: --vincular <uid> <empresaId> [--confirm]');
      return;
    }
    await vincularUsuario(vincular.uid, vincular.empresaId, empresas);
    return;
  }

  const snap = await migrar(empresas);
  reportarDuplicados(snap, empresas);
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
