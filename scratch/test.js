const fs = require('fs');
const code = fs.readFileSync('c:/Users/Juanca/Desktop/RP tulipan logistic/supabase-client.js', 'utf8');
const matchUrl = code.match(/const SUPABASE_URL = '([^']+)';/);
const matchKey = code.match(/const SUPABASE_KEY = '([^']+)';/);
async function testUpdate() {
  if (matchUrl && matchKey) {
    const url = matchUrl[1];
    const key = matchKey[1];
    
    console.log("Fetching drivers...");
    let res = await fetch(`${url}/rest/v1/drivers?select=*&limit=1`, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    });
    let data = await res.json();
    console.log("Driver data:", data);

    if (data && data.length > 0) {
        console.log("Updating driver...");
        res = await fetch(`${url}/rest/v1/drivers?id=eq.${data[0].id}`, {
            method: 'PATCH',
            headers: { 
                'apikey': key, 
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify({ name: data[0].name })
        });
        data = await res.json();
        console.log("Driver Update result:", data);
    }
  }
}
testUpdate();
