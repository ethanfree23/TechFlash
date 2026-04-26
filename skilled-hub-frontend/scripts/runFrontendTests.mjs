import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testFiles = [
  'crmImport.test.mjs',
  'phone.test.mjs',
  'auth.test.mjs',
  'crmNotes.test.mjs',
  'data.test.mjs',
  'api.test.mjs',
  'technicianMap.test.mjs',
  'jobAccessSettings.test.mjs',
];

let successful = 0;
let failure = 0;

for (const testFile of testFiles) {
  const result = spawnSync(process.execPath, [path.join(__dirname, testFile)], {
    stdio: 'inherit',
  });

  if (result.status === 0) {
    successful += 1;
  } else {
    failure += 1;
  }
}

// eslint-disable-next-line no-console
console.log(`successfull = ${successful}; failure = ${failure}`);

if (failure > 0) {
  process.exit(1);
}
