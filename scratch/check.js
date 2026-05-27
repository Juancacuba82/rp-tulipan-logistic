const fs = require('fs');
const code = fs.readFileSync('c:/Users/Juanca/Desktop/RP tulipan logistic/supabase-client.js', 'utf8');
const matchUrl = code.match(/const supabaseUrl = '([^']+)';/);
const matchKey = code.match(/const supabaseKey = '([^']+)';/);

async function check() {
  if (matchUrl && matchKey) {
    try {
      const url = `${matchUrl[1]}/rest/v1/customers?select=*&limit=1`;
      const res = await fetch(url, {
        headers: {
          'apikey': matchKey[1],
          'Authorization': `Bearer ${matchKey[1]}`
        }
      });
      const data = await res.json();
      fs.writeFileSync('c:/Users/Juanca/Desktop/RP tulipan logistic/scratch/out.txt', JSON.stringify(data, null, 2));
    } catch (err) {
      fs.writeFileSync('c:/Users/Juanca/Desktop/RP tulipan logistic/scratch/out.txt', "ERROR: " + err.message);
    }
  } else {
    fs.writeFileSync('c:/Users/Juanca/Desktop/RP tulipan logistic/scratch/out.txt', "NO MATCH");
  }
}
check();
