const { MigaduClient } = require('../functions/migadu');

const apiUser = "felipesalazar3014@gmail.com";
const apiKey = "6iejc7dqOmbvQIawfSJinp9-PtIA69Pwfo3QpcqEn_QaDHhDKJvbYBubbyzEImkmoPjvfxXrze1SSyc-JiAAXg";
const migadu = new MigaduClient(apiUser, apiKey);

async function run() {
  try {
    const details = await migadu.getDomainDetails("licitex.cl");
    console.log("=== MIGADU DOMAIN DETAILS ===");
    console.log(JSON.stringify(details, null, 2));
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
  }
}

run();
