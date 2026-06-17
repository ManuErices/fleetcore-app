const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'mpf-maquinaria'
  });
}

const db = admin.firestore();

async function run() {
  try {
    console.log("=== DOMAINS ===");
    const snap = await db.collection('domains').get();
    if (snap.empty) {
      console.log("No domains found in Firestore collection 'domains'.");
    } else {
      snap.forEach(doc => {
        console.log(`Domain: ${doc.id} =>`, doc.data());
      });
    }

    console.log("\n=== USERS ===");
    const usersSnap = await db.collection('users').limit(5).get();
    usersSnap.forEach(doc => {
      console.log(`User: ${doc.id} =>`, doc.data());
    });
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
