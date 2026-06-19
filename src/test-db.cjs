const admin = require('firebase-admin');

// Initialize firebase admin with default credentials or active project
admin.initializeApp({
  projectId: 'mpf-maquinaria'
});

const db = admin.firestore();

async function run() {
  try {
    console.log("=== EMPRESAS ===");
    const empSnap = await db.collection('empresas').get();
    empSnap.forEach(doc => {
      console.log(`Empresa: ${doc.id} => ${doc.data().nombre}`);
    });

    // Let's find contracts for the company: emp-782753517-mqfmiklj or similar
    const targetEmpresa = 'emp-782753517-mqfmiklj';
    console.log(`\n=== TRABAJADORES under ${targetEmpresa} ===`);
    const trabSnap = await db.collection('empresas').doc(targetEmpresa).collection('trabajadores').get();
    trabSnap.forEach(doc => {
      const data = doc.data();
      console.log(`Trabajador ID: ${doc.id} => ${data.nombre} ${data.apellidoPaterno} (RUT: ${data.rut})`);
    });

    console.log(`\n=== CONTRATOS under ${targetEmpresa} ===`);
    const contSnap = await db.collection('empresas').doc(targetEmpresa).collection('contratos').get();
    contSnap.forEach(doc => {
      const data = doc.data();
      console.log(`Contrato ID: ${doc.id} => trabajadorId: ${data.trabajadorId}, tipoContrato: ${data.tipoContrato}, empresa: ${data.empresa}, estado: ${data.estado}`);
    });

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
