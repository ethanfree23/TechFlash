import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { CRM_STATUSES, CRM_COMPANY_TYPES, CRM_QUICK_PIPELINE_FILTERS } from '../src/utils/crmConstants.js';
import { buildImportDraftRows, autoFixDraftRows } from '../src/utils/crmImport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CRM_LEAD_RB = path.join(REPO_ROOT, 'skilled_hub_api', 'app', 'models', 'crm_lead.rb');
const PIPELINE_TRACKER_JSX = path.join(__dirname, '..', 'src', 'components', 'crm', 'PipelineStageTracker.jsx');
// Read as source rather than imported: crmDisplayAdapter.js uses extensionless
// relative imports, which Vite resolves but bare Node ESM does not.
const DISPLAY_ADAPTER_JS = path.join(__dirname, '..', 'src', 'utils', 'crmDisplayAdapter.js');

/** Parse a `NAME = %w[ ... ].freeze` array out of a Ruby source file. */
function parseRubyWordArray(source, constName) {
  const re = new RegExp(`${constName}\\s*=\\s*%w\\[([^\\]]*)\\]`);
  const match = source.match(re);
  assert.ok(match, `could not find ${constName} = %w[...] in crm_lead.rb`);
  return match[1].split(/\s+/).filter(Boolean);
}

/**
 * Regression guard for the drift that let the CRM page offer a status Rails
 * rejects ('unqualified') while hiding a real pipeline stage ('qualified').
 */
function testStatusesMatchRails() {
  const rb = fs.readFileSync(CRM_LEAD_RB, 'utf8');
  const railsStatuses = parseRubyWordArray(rb, 'STATUSES');

  assert.deepStrictEqual(
    CRM_STATUSES,
    railsStatuses,
    'CRM_STATUSES must match CrmLead::STATUSES exactly (same values, same order)',
  );

  // The two specific values involved in the historical drift.
  assert.ok(CRM_STATUSES.includes('qualified'), "'qualified' is a real pipeline stage and must be selectable");
  assert.ok(!CRM_STATUSES.includes('unqualified'), "'unqualified' is not a valid Rails status and must not be offered");
}

function testPipelineStagesAreValidStatuses() {
  const jsx = fs.readFileSync(PIPELINE_TRACKER_JSX, 'utf8');
  const match = jsx.match(/const PIPELINE_STAGES = \[([^\]]*)\]/);
  assert.ok(match, 'could not find PIPELINE_STAGES in PipelineStageTracker.jsx');
  const stages = match[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);

  for (const stage of stages) {
    assert.ok(CRM_STATUSES.includes(stage), `pipeline stage '${stage}' is not a valid CRM status`);
  }
}

function testQuickPipelineFiltersCoverEveryStatus() {
  const filterIds = CRM_QUICK_PIPELINE_FILTERS.map((f) => f.id);
  for (const status of CRM_STATUSES) {
    assert.ok(filterIds.includes(status), `quick pipeline filters are missing '${status}'`);
  }
}

function testEveryStatusHasABadgeStyle() {
  const src = fs.readFileSync(DISPLAY_ADAPTER_JS, 'utf8');
  const fn = src.match(/export function getStatusBadgeClasses\(status\) \{([\s\S]*?)\n\}/);
  assert.ok(fn, 'could not find getStatusBadgeClasses in crmDisplayAdapter.js');
  const styled = [...fn[1].matchAll(/^\s{4}(\w+):\s*'/gm)].map((m) => m[1]);

  for (const status of CRM_STATUSES) {
    assert.ok(styled.includes(status), `'${status}' has no badge style and would fall back to 'lead'`);
  }
  for (const key of styled) {
    assert.ok(CRM_STATUSES.includes(key), `badge style '${key}' is not a valid CRM status (dead entry)`);
  }
}

/**
 * Import previously flagged valid 'qualified' rows as errors, and autoFix
 * silently rewrote them to 'lead' — losing the stage on every CSV import.
 */
function testImportAcceptsQualified() {
  const csv = `name,contact_name,email,phone,website,company_types,status,notes
Northside HVAC,Dana,dana@northsidehvac.com,5125550142,northsidehvac.com,hvac,qualified,Walked the pricing sheet`;

  const draft = buildImportDraftRows(csv, CRM_STATUSES, CRM_COMPANY_TYPES);
  assert.strictEqual(draft.length, 1);
  assert.strictEqual(draft[0].status, 'qualified');
  assert.deepStrictEqual(draft[0]._errors, [], "'qualified' must import without validation errors");

  const fixed = autoFixDraftRows(draft, CRM_STATUSES, CRM_COMPANY_TYPES);
  assert.strictEqual(fixed[0].status, 'qualified', 'autoFix must not downgrade a valid status to lead');
}

function testImportRejectsUnqualified() {
  const csv = `name,contact_name,email,phone,website,company_types,status,notes
Bogus Co,Sam,sam@bogus.com,5125550143,bogus.com,hvac,unqualified,Should be flagged`;

  const draft = buildImportDraftRows(csv, CRM_STATUSES, CRM_COMPANY_TYPES);
  assert.strictEqual(draft.length, 1);
  assert.ok(
    draft[0]._errors.includes('Invalid status'),
    "'unqualified' must be flagged client-side rather than failing server-side validation",
  );

  const fixed = autoFixDraftRows(draft, CRM_STATUSES, CRM_COMPANY_TYPES);
  assert.strictEqual(fixed[0].status, 'lead', 'autoFix should fall back to lead for an invalid status');
}

function testCompanyTypesMatchRails() {
  const rb = fs.readFileSync(CRM_LEAD_RB, 'utf8');
  const match = rb.match(/COMPANY_TYPES = \[([\s\S]*?)\]\.freeze/);
  assert.ok(match, 'could not find COMPANY_TYPES in crm_lead.rb');
  const railsTypes = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

  assert.deepStrictEqual(
    CRM_COMPANY_TYPES,
    railsTypes,
    'CRM_COMPANY_TYPES must match CrmLead::COMPANY_TYPES exactly (same values, same order)',
  );
}

function run() {
  testStatusesMatchRails();
  testPipelineStagesAreValidStatuses();
  testQuickPipelineFiltersCoverEveryStatus();
  testEveryStatusHasABadgeStyle();
  testImportAcceptsQualified();
  testImportRejectsUnqualified();
  testCompanyTypesMatchRails();
  console.log('crmStatusParity tests passed');
}

run();
