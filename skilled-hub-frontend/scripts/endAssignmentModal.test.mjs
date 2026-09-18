import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const src = fs.readFileSync(
  path.join(__dirname, '../src/components/jobs/EndAssignmentModal.jsx'),
  'utf8'
);

function testContinueAwaitsPreviewBeforeFinalStep() {
  assert.match(src, /const goNext = async \(\) => \{/);
  assert.match(src, /if \(step === 3\) \{[\s\S]*setFinancialsStale\(true\);[\s\S]*setStep\(4\);[\s\S]*await refreshWithEnd\(\);/);
  assert.doesNotMatch(
    src,
    /onClick=\{\(\) => \{ refreshWithEnd\(\); setStep\(step \+ 1\); \}\}/
  );
}

function testFinalStepDoesNotRenderStaleFinancials() {
  assert.match(src, /financialsCurrent && step === 4/);
  assert.match(src, /const financialsCurrent = Boolean\(preview\) && !loading && !financialsStale;/);
  assert.match(src, /Loading current financial summary/);
  assert.match(
    src,
    /disabled=\{nextDisabled \|\| submitting \|\| !financialsCurrent\}/
  );
}

testContinueAwaitsPreviewBeforeFinalStep();
testFinalStepDoesNotRenderStaleFinancials();
console.log('endAssignmentModal.test.mjs ok');
