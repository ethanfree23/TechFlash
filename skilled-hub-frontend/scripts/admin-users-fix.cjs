const fs = require('fs');
const p = require('path').join(__dirname, '../src/pages/AdminUsersPage.jsx');
let c = fs.readFileSync(p, 'utf8');
const needle = 'className="absolute right-0 top-10 z-30 w-80 bg-white border border-gray-200 rounded-xl shadow-lg p-3"';
const repl = 'ref={columnConfigRef} ' + needle;
if (!c.includes(repl)) {
  c = c.replace(needle, repl);
  fs.writeFileSync(p, c);
  console.log('patched ref');
} else {
  console.log('already patched');
}
