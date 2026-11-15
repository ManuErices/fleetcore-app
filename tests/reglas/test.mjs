/**
 * Pruebas de las reglas de Firestore y Storage contra el emulador.
 * Cubren los caminos legítimos de alta (registro, configuración de empresa,
 * invitación, operario por email), los permisos por área y el aislamiento
 * entre empresas. Ejecutar desde esta carpeta:
 *
 *   npm i --no-save firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10
 *   npx firebase emulators:exec --only firestore,storage --project demo-test "node test.mjs"
 */
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { ref, uploadString, getBytes } from "firebase/storage";
import fs from "node:fs";
const env = await initializeTestEnvironment({
  projectId: "demo-test",
  firestore: { rules: fs.readFileSync(new URL("../../firestore.rules", import.meta.url),"utf8"), host:"127.0.0.1", port:8085 },
  storage: { rules: fs.readFileSync(new URL("../../storage.rules", import.meta.url),"utf8"), host:"127.0.0.1", port:9199 },
});
let ok=0, fail=0;
async function t(name, p){ try{ await p; ok++; console.log("✔", name);}catch(e){ fail++; console.log("✘", name, "-", e.message.split("\n")[0]); } }
await env.withSecurityRulesDisabled(async c => {
  const db=c.firestore();
  await setDoc(doc(db,"empresas/A"),{nombre:"A",adminUid:"adminA",adminEmail:"admin@a.cl"});
  await setDoc(doc(db,"empresas/B"),{nombre:"B",adminUid:"adminB"});
  await setDoc(doc(db,"empresas/A1"),{nombre:"sub",parentEmpresaId:"A"});
  await setDoc(doc(db,"users/adminA"),{role:"admin_contrato",empresaId:"A"});
  await setDoc(doc(db,"users/opA"),{role:"operador",empresaId:"A",modulos:["workfleet"]});
  await setDoc(doc(db,"users/admvoRRHH"),{role:"administrativo",empresaId:"A",modulos:["rrhh"]});
  await setDoc(doc(db,"users/admvoFin"),{role:"administrativo",empresaId:"A",modulos:["finanzas"]});
  await setDoc(doc(db,"users/admvoCont"),{role:"administrativo",empresaId:"A",modulos:["contabilidad"]});
  await setDoc(doc(db,"users/opOT"),{role:"operador",empresaId:"A",modulos:["fleetcore"]});
  await setDoc(doc(db,"users/userB"),{role:"admin_contrato",empresaId:"B"});
  await setDoc(doc(db,"invitaciones/inv1"),{empresaId:"A",rol:"administrativo",usada:false});
  await setDoc(doc(db,"invitaciones/inv2"),{empresaId:"A",rol:"administrativo",usada:false,emailDestino:"otro@x.cl"});
  await setDoc(doc(db,"empresas/A/trabajadores/t1"),{nombre:"Juan",email:"juan@a.cl"});
  await setDoc(doc(db,"empresas/A/remuneraciones/r1"),{trabajadorId:"t1",monto:1});
  await setDoc(doc(db,"empresas/A/flujo_pagos/p1"),{valor:1});
  await setDoc(doc(db,"empresas/A/machines/m1"),{name:"x"});
  await setDoc(doc(db,"pins/juan"),{hash:"h",uid:"juanUid"});
  await setDoc(doc(db,"empresas/A/trabajadores_portal/trab1"),{trabajadorDocId:"t1"});
  await setDoc(doc(db,"users/trab1"),{role:"trabajador",empresaId:"A",estado:"activo"});
  const st=c.storage();
  await uploadString(ref(st,"empresas/A/contratos/c1/f.pdf"),"x");
  await uploadString(ref(st,"empresas/A/documentos/t1/f.pdf"),"x");
  await uploadString(ref(st,"empresas/A/documentos/t2/f.pdf"),"x");
  await uploadString(ref(st,"empresas/A/activos/a1/f.pdf"),"x");
});
const as=(uid,email)=>env.authenticatedContext(uid,{email: email||`${uid}@x.cl`});
const fsOf=(uid,email)=>as(uid,email).firestore();
const stOf=(uid,email)=>as(uid,email).storage();
// ── usuarios
await t("atacante se crea superadmin → negado", assertFails(setDoc(doc(fsOf("evil"),"users/evil"),{role:"superadmin",empresaId:"A"})));
await t("atacante se crea admin de A → negado", assertFails(setDoc(doc(fsOf("evil"),"users/evil"),{role:"admin_contrato",empresaId:"A"})));
await t("cuenta nueva sin empresa → permitido", assertSucceeds(setDoc(doc(fsOf("nuevo"),"users/nuevo"),{email:"n@x.cl",role:"operador"})));
await t("registro: crea empresa propia y se hace admin → permitido", (async()=>{const db=fsOf("reg");await setDoc(doc(db,"empresas/R"),{nombre:"R",adminUid:"reg"});await setDoc(doc(db,"users/reg"),{role:"admin_contrato",empresaId:"R",modulos:["rrhh"]});})());
await t("invitación válida → permitido", assertSucceeds(setDoc(doc(fsOf("inv"),"users/inv"),{role:"administrativo",empresaId:"A",invitacionId:"inv1"})));
await t("invitación con otro rol → negado", assertFails(setDoc(doc(fsOf("inv3"),"users/inv3"),{role:"admin_contrato",empresaId:"A",invitacionId:"inv1"})));
await t("invitación para otro email → negado", assertFails(setDoc(doc(fsOf("inv4"),"users/inv4"),{role:"administrativo",empresaId:"A",invitacionId:"inv2"})));
await t("marcar invitación usada → permitido", assertSucceeds(setDoc(doc(fsOf("inv"),"invitaciones/inv1"),{usada:true,usadaPor:"inv",usadaEn:1},{merge:true})));
await t("cambiar rol de invitación → negado", assertFails(setDoc(doc(fsOf("inv"),"invitaciones/inv2"),{rol:"admin_contrato"},{merge:true})));
await t("cuenta existente sin empresa acepta invitación (update) → permitido", (async()=>{
  await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),"invitaciones/inv5"),{empresaId:"A",rol:"operador",usada:false}));
  await assertSucceeds(setDoc(doc(fsOf("nuevo"),"users/nuevo"),{role:"operador",empresaId:"A",invitacionId:"inv5"},{merge:true}));})());
await t("operario vinculado por email → permitido", assertSucceeds(setDoc(doc(fsOf("juanU","juan@a.cl"),"users/juanU"),{role:"operador",empresaId:"A",trabajadorId:"t1"})));
await t("operario con email ajeno → negado", assertFails(setDoc(doc(fsOf("pepe","pepe@a.cl"),"users/pepe"),{role:"operador",empresaId:"A",trabajadorId:"t1"})));
await t("usuario edita su nombre → permitido", assertSucceeds(updateDoc(doc(fsOf("opA"),"users/opA"),{nombre:"x"})));
await t("usuario se sube el rol → negado", assertFails(updateDoc(doc(fsOf("opA"),"users/opA"),{role:"admin_contrato"})));
await t("admin se hace superadmin → negado", assertFails(updateDoc(doc(fsOf("adminA"),"users/adminA"),{role:"superadmin"})));
await t("admin se agrega empresa B → negado", assertFails(updateDoc(doc(fsOf("adminA"),"users/adminA"),{empresasIds:["A","B"]})));
await t("admin cambia rol de operador a administrativo → permitido", assertSucceeds(updateDoc(doc(fsOf("adminA"),"users/opA"),{role:"administrativo",modulos:["rrhh"]})));
await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),"users/opA"),{role:"operador",empresaId:"A",modulos:["workfleet"]}));
// ── áreas
await t("operador lee remuneraciones → negado", assertFails(getDoc(doc(fsOf("opA"),"empresas/A/remuneraciones/r1"))));
await t("operador escribe remuneraciones → negado", assertFails(setDoc(doc(fsOf("opA"),"empresas/A/remuneraciones/r2"),{x:1})));
await t("administrativo RRHH escribe remuneraciones → permitido", assertSucceeds(setDoc(doc(fsOf("admvoRRHH"),"empresas/A/remuneraciones/r2"),{x:1})));
await t("Contabilidad lee remuneraciones → permitido", assertSucceeds(getDoc(doc(fsOf("admvoCont"),"empresas/A/remuneraciones/r1"))));
await t("OT (fleetcore) lee remuneraciones → permitido", assertSucceeds(getDoc(doc(fsOf("opOT"),"empresas/A/remuneraciones/r1"))));
await t("trabajador lee su liquidación → permitido", assertSucceeds(getDoc(doc(fsOf("trab1"),"empresas/A/remuneraciones/r1"))));
await t("operador escribe flujo → negado", assertFails(setDoc(doc(fsOf("opA"),"empresas/A/flujo_pagos/p2"),{valor:1})));
await t("Finanzas escribe flujo → permitido", assertSucceeds(setDoc(doc(fsOf("admvoFin"),"empresas/A/flujo_pagos/p2"),{valor:1})));
await t("Contabilidad lee flujo → permitido", assertSucceeds(getDoc(doc(fsOf("admvoCont"),"empresas/A/flujo_pagos/p1"))));
await t("Contabilidad escribe asiento → permitido", assertSucceeds(setDoc(doc(fsOf("admvoCont"),"empresas/A/journal_entries/j1"),{x:1})));
await t("Finanzas escribe asiento → negado", assertFails(setDoc(doc(fsOf("admvoFin"),"empresas/A/journal_entries/j2"),{x:1})));
await t("admin escribe todo → permitido", assertSucceeds(setDoc(doc(fsOf("adminA"),"empresas/A/journal_entries/j3"),{x:1})));
await t("operador escribe máquinas → permitido", assertSucceeds(setDoc(doc(fsOf("opA"),"empresas/A/machines/m2"),{x:1})));
await t("operador usa correlativo combustible → permitido", assertSucceeds(setDoc(doc(fsOf("opA"),"empresas/A/counters/combustible"),{n:1})));
await t("operador escribe memoria del agente → negado", assertFails(setDoc(doc(fsOf("opA"),"empresas/A/agente_memoria/x"),{t:"haz X"})));
// ── entre empresas
await t("usuario de B lee máquinas de A → negado", assertFails(getDoc(doc(fsOf("userB"),"empresas/A/machines/m1"))));
await t("usuario de B lee empresa A → negado", assertFails(getDoc(doc(fsOf("userB"),"empresas/A"))));
await t("usuario de A lee su empresa → permitido", assertSucceeds(getDoc(doc(fsOf("opA"),"empresas/A"))));
await t("listar sub-empresas propias → permitido", assertSucceeds(getDocs(query(collection(fsOf("adminA"),"empresas"),where("parentEmpresaId","==","A")))));
await t("admin pendiente encuentra su empresa por email → permitido", assertSucceeds(getDocs(query(collection(fsOf("nuevoAdmin","admin@a.cl"),"empresas"),where("adminEmail","==","admin@a.cl")))));
await t("listar invitaciones sin ser admin → negado", assertFails(getDocs(collection(fsOf("opA"),"invitaciones"))));
await t("leer invitación por token sin sesión → permitido", assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(),"invitaciones/inv2"))));
// ── pins
await t("crear PIN propio → permitido", assertSucceeds(setDoc(doc(fsOf("ana"),"pins/ana"),{hash:"h",uid:"ana"})));
await t("pisar PIN ajeno → negado", assertFails(setDoc(doc(fsOf("evil"),"pins/juan"),{hash:"h2",uid:"evil"})));
// ── suscripciones
await t("prueba para empresa propia nueva → permitido", assertSucceeds(setDoc(doc(fsOf("reg"),"subscriptions/R"),{status:"trial",planId:"",empresaId:"R"})));
await t("crear suscripción autorizada → negado", assertFails(setDoc(doc(fsOf("evil"),"subscriptions/evil"),{status:"authorized",planId:"x"})));
await t("usuario de B modifica suscripción de A → negado", assertFails(setDoc(doc(fsOf("userB"),"subscriptions/A"),{status:"authorized"})));
// ── storage
await t("operador lee contrato → negado", assertFails(getBytes(ref(stOf("opA"),"empresas/A/contratos/c1/f.pdf"))));
await t("RRHH lee contrato → permitido", assertSucceeds(getBytes(ref(stOf("admvoRRHH"),"empresas/A/contratos/c1/f.pdf"))));
await t("usuario de B lee contrato de A → negado", assertFails(getBytes(ref(stOf("userB"),"empresas/A/contratos/c1/f.pdf"))));
await t("trabajador lee su carpeta → permitido", assertSucceeds(getBytes(ref(stOf("trab1"),"empresas/A/documentos/t1/f.pdf"))));
await t("trabajador lee carpeta ajena → negado", assertFails(getBytes(ref(stOf("trab1"),"empresas/A/documentos/t2/f.pdf"))));
await t("Finanzas sube a activos → permitido", assertSucceeds(uploadString(ref(stOf("admvoFin"),"empresas/A/activos/a2/f.pdf"),"x",undefined,{contentType:"application/pdf"})));
await t("usuario de B lee activos de A → negado", assertFails(getBytes(ref(stOf("userB"),"empresas/A/activos/a1/f.pdf"))));
await t("operador sube foto de combustible → permitido", assertSucceeds(uploadString(ref(stOf("opA"),"reportes/A/foto.jpg"),"x",undefined,{contentType:"image/jpeg"})));
await t("usuario de B sube foto a A → negado", assertFails(uploadString(ref(stOf("userB"),"reportes/A/foto.jpg"),"x",undefined,{contentType:"image/jpeg"})));

await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),"users/admvoTxt"),{role:"administrativo",empresaId:"A",modulos:"finanzas,rrhh"}));
await t("módulos como texto: escribe flujo → permitido", assertSucceeds(setDoc(doc(fsOf("admvoTxt"),"empresas/A/flujo_pagos/p9"),{valor:1})));
await t("admin crea cuenta de portal (rol trabajador) → permitido", assertSucceeds(setDoc(doc(fsOf("adminA"),"users/nuevoTrab"),{role:"trabajador",empresaId:"A",email:"t@x.cl"})));
await t("admin crea operador → permitido", assertSucceeds(setDoc(doc(fsOf("adminA"),"users/nuevoOp"),{role:"operador",empresaId:"A"})));
await t("admin crea admin en otra empresa → negado", assertFails(setDoc(doc(fsOf("adminA"),"users/x2"),{role:"operador",empresaId:"B"})));
await t("admin crea sub-empresa → permitido", assertSucceeds(setDoc(doc(fsOf("adminA"),"empresas/A2"),{nombre:"sub2",parentEmpresaId:"A"})));
await t("RRHH escribe config/lre → permitido", assertSucceeds(setDoc(doc(fsOf("admvoRRHH"),"empresas/A/config/lre"),{x:1})));
await t("operador escribe config → negado", assertFails(setDoc(doc(fsOf("opA"),"empresas/A/config/lre"),{x:1})));
await t("operador escribe trabajadores (combustible) → permitido", assertSucceeds(setDoc(doc(fsOf("opA"),"empresas/A/trabajadores/t9"),{nombre:"x"})));
await t("operador lee nóminas de pago → negado", assertFails(getDoc(doc(fsOf("opA"),"empresas/A/nominas_pago/n1"))));

await t("operador lee credenciales QR → negado", assertFails(getDoc(doc(fsOf("opA"),"empresas/A/credenciales_qr/trab_t1"))));
await t("admin guarda credencial QR → permitido", assertSucceeds(setDoc(doc(fsOf("adminA"),"empresas/A/credenciales_qr/trab_t1"),{email:"a",password:"b"})));
console.log(`\n${ok} ok, ${fail} fallos`);
await env.cleanup();
process.exit(fail?1:0);
