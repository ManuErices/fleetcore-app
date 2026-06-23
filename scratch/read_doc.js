import { execSync } from 'child_process';

async function run() {
  try {
    const token = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
    const projectId = "mpf-maquinaria";
    
    const subUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/subscriptions/emp-782753517-mqfmiklj`;
    const subRes = await fetch(subUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const subJson = await subRes.json();
    console.log("=== Campos del documento emp-782753517-mqfmiklj ===");
    console.log(JSON.stringify(subJson, null, 2));

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
