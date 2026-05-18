const fs = require('fs');
const p = require('path').join(__dirname, '../src/pages/CrmPage.jsx');
let c = fs.readFileSync(p, 'utf8');
const bad = 'mot' + 'ionless';
const good = 'd' + 'i' + 'v';
c = c.split('<' + bad).join('<' + good);
c = c.split('</' + bad + '>').join('</' + good + '>');
fs.writeFileSync(p, c);
console.log('remaining:', (c.match(new RegExp(bad, 'g')) || []).length);
