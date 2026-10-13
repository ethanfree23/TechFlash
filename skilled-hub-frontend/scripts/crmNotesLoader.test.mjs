import assert from 'assert';
import {
  websiteKey,
  humanizeDomain,
  normalizeContactMethod,
  normalizeYesNo,
  cellToString,
  parseFreeFormContacts,
  mapHeaderRow,
  buildNotesLoaderDraftRows,
  matchRowsToLeads,
  toNotesLoaderSubmitRow,
  summarizeNotesLoaderRows,
  buildNotesLoaderTemplateRows,
  NOTES_LOADER_TEMPLATE_HEADERS,
} from '../src/utils/crmNotesLoader.js';

function testWebsiteKey() {
  assert.strictEqual(websiteKey('https://www.AcmePlumbing.com/about?x=1'), 'acmeplumbing.com');
  assert.strictEqual(websiteKey('acmeplumbing.com/'), 'acmeplumbing.com');
  assert.strictEqual(websiteKey('http://acmeplumbing.com:8080'), 'acmeplumbing.com');
  assert.strictEqual(websiteKey('sales@acmeplumbing.com'), 'acmeplumbing.com');
  assert.strictEqual(websiteKey(''), '');
  assert.strictEqual(humanizeDomain('https://northwind-mechanical.com'), 'Northwind Mechanical');
}

function testNormalizers() {
  assert.strictEqual(normalizeContactMethod('Phone call'), 'call');
  assert.strictEqual(normalizeContactMethod('SMS'), 'text');
  assert.strictEqual(normalizeContactMethod('in person'), 'in_person');
  assert.strictEqual(normalizeContactMethod('carrier pigeon'), '');
  assert.strictEqual(normalizeYesNo('Yes'), 'yes');
  assert.strictEqual(normalizeYesNo('N'), 'no');
  assert.strictEqual(normalizeYesNo(true), 'yes');
  assert.strictEqual(normalizeYesNo('maybe'), '');
  assert.strictEqual(cellToString(new Date(2026, 9, 13)), '2026-10-13');
  assert.strictEqual(cellToString(new Date(2026, 9, 13, 9, 30)), '2026-10-13 09:30');
  assert.strictEqual(cellToString(42), '42');
  assert.strictEqual(cellToString(null), '');
}

function testFreeFormContacts() {
  const contacts = parseFreeFormContacts(
    'Lee Park, Service Manager - lee@betahvac.com (555) 200-3001; Dana Fox dana@betahvac.com\nSam Hill phone: 555-999-1234',
  );
  assert.strictEqual(contacts.length, 3);
  assert.deepStrictEqual(contacts[0], {
    name: 'Lee Park',
    email: 'lee@betahvac.com',
    phone: '(555) 200-3001',
    job_title: 'Service Manager',
  });
  assert.strictEqual(contacts[1].name, 'Dana Fox');
  assert.strictEqual(contacts[1].email, 'dana@betahvac.com');
  assert.strictEqual(contacts[2].name, 'Sam Hill');
  assert.strictEqual(contacts[2].phone, '555-999-1234');
  assert.deepStrictEqual(parseFreeFormContacts(''), []);
}

function testHeaderMapping() {
  const { mapping, unmapped, mappedKeys } = mapHeaderRow(['Company URL', 'Notes', 'Type', 'Reached', 'Date', 'Follow Up', 'New Contact', 'Email', 'Phone', 'Role', 'Random']);
  assert.strictEqual(mapping[0], 'website');
  assert.strictEqual(mapping[1], 'note');
  assert.strictEqual(mapping[2], 'contact_method');
  assert.strictEqual(mapping[3], 'made_contact');
  assert.strictEqual(mapping[4], 'note_date');
  assert.strictEqual(mapping[5], 'remind_at');
  assert.strictEqual(mapping[6], 'contact_name');
  assert.strictEqual(mapping[7], 'contact_email');
  assert.strictEqual(mapping[8], 'contact_phone');
  assert.strictEqual(mapping[9], 'contact_title');
  assert.deepStrictEqual(unmapped, ['Random']);
  assert.ok(mappedKeys.includes('website'));
}

function testBuildDraftRowsWithHeader() {
  const sheet = [
    ['website', 'note', 'contact_method', 'made_contact', 'remind_at', 'status', 'contact_name', 'contact_phone'],
    ['https://acmeplumbing.com/contact', 'Spoke with Pat', 'Call', 'yes', new Date(2026, 9, 20), 'Contacted', 'Pat Rivera', '5552003000'],
    ['', '', '', '', '', '', '', ''],
    ['betahvac.com', '', 'text', '', '', 'hot', '', ''],
    ['', 'No company here', '', '', '', '', '', ''],
  ];
  const { rows, headerDetected, unmappedHeaders } = buildNotesLoaderDraftRows(sheet);
  assert.strictEqual(headerDetected, true);
  assert.deepStrictEqual(unmappedHeaders, []);
  assert.strictEqual(rows.length, 3, 'blank rows are dropped');

  const [first, second, third] = rows;
  assert.strictEqual(first._rowNum, 2);
  assert.strictEqual(first.website, 'https://acmeplumbing.com/contact');
  assert.strictEqual(first.contact_method, 'call');
  assert.strictEqual(first.made_contact, 'yes');
  assert.strictEqual(first.remind_at, '2026-10-20');
  assert.strictEqual(first.status, 'contacted');
  assert.strictEqual(first.contact_phone, '+1 (555) 200-3000');
  assert.deepStrictEqual(first._errors, []);

  assert.ok(second._errors.includes('Nothing to add (no note, contact, or status)'));
  assert.ok(second._warnings.some((w) => w.includes('Unknown status "hot"')));

  assert.ok(third._errors.includes('Missing company URL'));
}

function testBuildDraftRowsHeaderless() {
  const { rows, headerDetected } = buildNotesLoaderDraftRows([
    ['acme.com', 'Quick note', 'email'],
  ]);
  assert.strictEqual(headerDetected, false);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].website, 'acme.com');
  assert.strictEqual(rows[0].note, 'Quick note');
  assert.strictEqual(rows[0].contact_method, 'email');
}

function testBareNameInUrlColumnBecomesCompanyName() {
  const { rows } = buildNotesLoaderDraftRows([
    ['website', 'note'],
    ['Gamma Electric', 'Matched by name'],
  ]);
  assert.strictEqual(rows[0].website, '');
  assert.strictEqual(rows[0].company_name, 'Gamma Electric');
  assert.deepStrictEqual(rows[0]._errors, []);
}

function testMatching() {
  const leads = [
    { id: 1, name: 'Acme Plumbing', website: 'https://www.acmeplumbing.com' },
    { id: 2, name: 'Dup One', website: 'dup.com' },
    { id: 3, name: 'Dup Two', website: 'https://dup.com/' },
    { id: 4, name: 'Gamma Electric', website: '' },
  ];
  const { rows } = buildNotesLoaderDraftRows([
    ['website', 'company', 'note'],
    ['acmeplumbing.com', '', 'a'],
    ['dup.com', '', 'b'],
    ['dup.com', 'Dup Two', 'c'],
    ['', 'gamma electric', 'd'],
    ['newco.com', '', 'e'],
    ['https://www.newco.com', '', 'f'],
  ]);
  const matched = matchRowsToLeads(rows, leads);
  assert.strictEqual(matched[0]._match.status, 'matched');
  assert.strictEqual(matched[0]._match.leadId, 1);
  assert.strictEqual(matched[1]._match.status, 'ambiguous');
  assert.strictEqual(matched[2]._match.status, 'matched');
  assert.strictEqual(matched[2]._match.leadId, 3);
  assert.strictEqual(matched[3]._match.status, 'matched');
  assert.strictEqual(matched[3]._match.via, 'name');
  assert.strictEqual(matched[4]._match.status, 'missing');
  assert.strictEqual(matched[4]._match.leadName, 'Newco');
  assert.strictEqual(matched[5]._match.status, 'new_in_batch');

  const summary = summarizeNotesLoaderRows(matched);
  assert.strictEqual(summary.total, 6);
  assert.strictEqual(summary.matched, 3);
  assert.strictEqual(summary.ambiguous, 1);
  assert.strictEqual(summary.missing, 2);
  assert.strictEqual(summary.notes, 6);
}

function testSubmitRowAndTemplate() {
  const { rows } = buildNotesLoaderDraftRows([
    ['website', 'note', 'contacts'],
    ['acme.com', 'hi', 'Lee Park lee@acme.com'],
  ]);
  const submit = toNotesLoaderSubmitRow(matchRowsToLeads(rows, [])[0]);
  assert.deepStrictEqual(submit, { website: 'acme.com', note: 'hi', contacts: 'Lee Park lee@acme.com' });
  assert.ok(!('_match' in submit));

  const template = buildNotesLoaderTemplateRows();
  assert.deepStrictEqual(template[0], NOTES_LOADER_TEMPLATE_HEADERS);
  assert.strictEqual(template.length, 3);
  const parsedTemplate = buildNotesLoaderDraftRows(template);
  assert.strictEqual(parsedTemplate.headerDetected, true);
  assert.strictEqual(parsedTemplate.rows.length, 2);
  assert.deepStrictEqual(parsedTemplate.rows[0]._errors, []);
  assert.deepStrictEqual(parsedTemplate.rows[1]._errors, []);
}

function run() {
  testWebsiteKey();
  testNormalizers();
  testFreeFormContacts();
  testHeaderMapping();
  testBuildDraftRowsWithHeader();
  testBuildDraftRowsHeaderless();
  testBareNameInUrlColumnBecomesCompanyName();
  testMatching();
  testSubmitRowAndTemplate();
  console.log('crmNotesLoader tests passed');
}

run();
