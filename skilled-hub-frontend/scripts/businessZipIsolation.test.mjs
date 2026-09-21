import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Guard for the funnel ZIP rule: a company's business ZIP (company_profiles.business_zip_code,
// from Meta/GHL onboarding or the signup form) describes where the company is. Every job
// collects its own location in the job-posting flow. No job-posting, job-editing, or
// job-template code may read the business ZIP or the funnel's staffing context.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..', 'src');

const FORBIDDEN = [
  /business_zip/i,
  /businessZip/,
  /staffing_intent/,
  /hiring_context/,
  /acquisition_attribution/,
];

function isJobFlowFile(rel) {
  const p = rel.replace(/\\/g, '/');
  return (
    /^pages\/(CreateJob|EditJob|JobsPage|PublicJobSharePage)\.jsx$/.test(p) ||
    /^components\/jobs\//.test(p) ||
    /^components\/Job[A-Z]\w*\.jsx$/.test(p) ||
    /^components\/[\w/]*[Tt]emplate\w*\.jsx?$/.test(p) ||
    /^utils\/job\w*\.js$/.test(p)
  );
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function testJobFlowNeverReadsBusinessZip() {
  const files = walk(SRC).filter((f) => isJobFlowFile(path.relative(SRC, f)));
  assert.ok(files.length >= 4, `expected to scan the job-posting files, found ${files.length}`);
  assert.ok(files.some((f) => f.endsWith(`${path.sep}CreateJob.jsx`)), 'CreateJob.jsx must be scanned');
  assert.ok(files.some((f) => f.endsWith(`${path.sep}EditJob.jsx`)), 'EditJob.jsx must be scanned');

  const offenders = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const re of FORBIDDEN) {
      if (re.test(text)) offenders.push(`${path.relative(SRC, file)} matches ${re}`);
    }
  }
  assert.deepStrictEqual(offenders, [], `job-posting code must not read funnel company fields:\n${offenders.join('\n')}`);
}

function testCreateJobZipComesFromItsOwnState() {
  const text = fs.readFileSync(path.join(SRC, 'pages', 'CreateJob.jsx'), 'utf8');
  // The job payload's zip_code must come from the form's own zipCode state.
  assert.match(text, /zip_code:\s*zipCode\b/, 'CreateJob must submit zip_code from its own zipCode state');
  assert.doesNotMatch(text, /setZipCode\(\s*profile\./, 'CreateJob must not seed zipCode from the company profile');
}

testJobFlowNeverReadsBusinessZip();
testCreateJobZipComesFromItsOwnState();
console.log('businessZipIsolation tests passed');
