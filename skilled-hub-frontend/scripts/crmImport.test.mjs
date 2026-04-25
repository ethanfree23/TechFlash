import assert from 'assert';
import {
  buildImportDraftRows,
  autoFixDraftRows,
} from '../src/utils/crmImport.js';

const CRM_STATUSES = ['lead', 'contacted', 'qualified', 'proposal', 'prospect', 'customer', 'competitor', 'churned', 'lost'];
const CRM_COMPANY_TYPES = [
  'hvac',
  'plumbing',
  'electrical',
  'refrigeration',
  'fire_protection',
  'general_contracting',
  'handyman',
  'roofing',
  'solar',
  'appliance_repair',
  'facility_maintenance',
  'other',
];

function testWrappedHeaderlessRows() {
  const pasted = `Infinity Electric,Raul Ortiz,rortiz@infinityelectric.com
,(956) 555-1054,https://infinityelectric.com,electrical,lead,Residential
 contractor
Limas Electric,Pedro Limas,plimas@limaselectric.com
,(956) 555-1055,https://limaselectric.com,electrical,lead,Small
 service jobs`;

  const draft = buildImportDraftRows(pasted, CRM_STATUSES, CRM_COMPANY_TYPES);
  assert.strictEqual(draft.length, 2, 'should parse two records from wrapped rows');
  assert.strictEqual(draft[0].name, 'Infinity Electric');
  assert.strictEqual(draft[0].notes, 'Residential contractor');
  assert.strictEqual(draft[1].name, 'Limas Electric');
}

function testHeaderCsvRows() {
  const csv = `name,contact_name,email,phone,website,company_types,status,notes
Acme Co,Jamie,jamie@acme.com,5551239876,acme.com,hvac|plumbing,lead,Good lead`;

  const draft = buildImportDraftRows(csv, CRM_STATUSES, CRM_COMPANY_TYPES);
  assert.strictEqual(draft.length, 1, 'should parse one CSV row');
  assert.strictEqual(draft[0].website, 'https://acme.com', 'should normalize missing website protocol');
  assert.strictEqual(draft[0].phone, '+1 (555) 123-9876', 'should normalize phone format');
}

function testAutoFix() {
  const bad = [
    {
      _rowNum: 1,
      name: 'Bad Status Co',
      contact_name: '',
      email: 'badstatus@example.com',
      phone: '5551002000',
      website: 'badstatus.com',
      company_types: 'electrical|unknown',
      status: 'new',
      notes: '',
      _errors: [],
    },
  ];

  const fixed = autoFixDraftRows(bad, CRM_STATUSES, CRM_COMPANY_TYPES);
  assert.strictEqual(fixed[0].status, 'lead', 'should default invalid status to lead');
  assert.strictEqual(fixed[0].company_types, 'electrical', 'should drop unsupported company types');
  assert.ok(Array.isArray(fixed[0]._errors), 'should include validation result');
}

function run() {
  testWrappedHeaderlessRows();
  testHeaderCsvRows();
  testAutoFix();
  // eslint-disable-next-line no-console
  console.log('crmImport tests passed');
}

run();
