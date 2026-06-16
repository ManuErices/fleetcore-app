const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'mpf-maquinaria'
});

const db = admin.firestore();

async function run() {
  try {
    const usersSnap = await db.collection('users').get();
    console.log("=== USERS ===");
    usersSnap.forEach(doc => {
      const data = doc.data();
      console.log(`User ID: ${doc.id} => Email: ${data.email}, Nombre: ${data.nombre}, role: ${data.role}, empresaId: ${data.empresaId}`);
    });
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
