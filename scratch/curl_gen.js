const fs = require('fs');
const code = fs.readFileSync('c:/Users/Juanca/Desktop/RP tulipan logistic/supabase-client.js', 'utf8');
const matchUrl = code.match(/const supabaseUrl = '([^']+)';/);
const matchKey = code.match(/const supabaseKey = '([^']+)';/);
if (matchUrl && matchKey) {
  const url = matchUrl[1];
  const key = matchKey[1];
  console.log(`curl -s "${url}/rest/v1/customers?select=*&limit=1" -H "apikey: ${key}" -H "Authorization: Bearer ${key}"`);
}
