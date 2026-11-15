import assert from 'assert';
import {
  websiteKey,
  humanizeDomain,
  normalizeContactMethod,
  normalizeYesNo,
  cellToString,
  normalizeDateCell,
  isPlaceholder,
  parseFreeFormContacts,
  mapHeaderRow,
  findHeaderRow,
  buildNotesLoaderDraftRows,
  buildNotesLoaderDraftFromSheets,
  normalizeNotesLoaderRow,
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
  assert.strictEqual(websiteKey('Acme Plumbing'), '', 'a company name is not a domain');
  assert.strictEqual(websiteKey('N/A'), '', 'placeholders are not domains');
  assert.strictEqual(websiteKey('unknown'), '');
  assert.strictEqual(websiteKey('acme'), '', 'a bare word without a TLD is not a domain');
  assert.strictEqual(websiteKey('acme-plumbing.co.uk'), 'acme-plumbing.co.uk');
  assert.strictEqual(humanizeDomain('https://northwind-mechanical.com'), 'Northwind Mechanical');
  assert.ok(isPlaceholder('TBD'));
  assert.ok(!isPlaceholder('Acme'));
}

function testDateCells() {
  assert.strictEqual(normalizeDateCell(new Date(2026, 9, 5)), '2026-10-05');
  assert.strictEqual(normalizeDateCell('10/5/2026'), '2026-10-05', 'US month-first strings become ISO');
  assert.strictEqual(normalizeDateCell('10/24/26'), '2026-10-24');
  assert.strictEqual(normalizeDateCell('10-24-2026 2:30 PM'), '2026-10-24 2:30 PM');
  assert.strictEqual(normalizeDateCell('2026-10-05'), '2026-10-05');
  assert.strictEqual(normalizeDateCell('2026-10-5'), '2026-10-05');
  assert.strictEqual(normalizeDateCell(46304), '2026-10-09', 'Excel serial numbers become ISO');
  assert.strictEqual(normalizeDateCell('46303.5'), '2026-10-08 12:00');
  assert.strictEqual(normalizeDateCell(5), '5', 'small numbers are not dates');
  assert.strictEqual(normalizeDateCell('13/40/2026'), '13/40/2026', 'impossible dates pass through for the server to flag');
  assert.strictEqual(normalizeDateCell('next Tuesday'), 'next Tuesday');
  assert.strictEqual(normalizeDateCell('N/A'), '');
  assert.strictEqual(normalizeDateCell(''), '');
}

function testNormalizers() {
  assert.strictEqual(normalizeContactMethod('Phone call'), 'call');
  assert.strictEqual(normalizeContactMethod('SMS'), 'text');
  assert.strictEqual(normalizeContactMethod('in person'), 'in_person');
  assert.strictEqual(normalizeContactMethod('Stopped in'), 'in_person');
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

  // "Title" beside the contact columns is the person's job title, not a note headline.
  const chatgpt = mapHeaderRow(['Company', 'Website', 'Notes', 'Contact Name', 'Email', 'Phone', 'Title', 'Other Contacts']);
  assert.strictEqual(chatgpt.mapping[0], 'company_name');
  assert.strictEqual(chatgpt.mapping[6], 'contact_title');
  assert.strictEqual(chatgpt.mapping[7], 'contacts');
  assert.ok(!chatgpt.mappedKeys.includes('title'));

  // "Name" is the company when it is the only name-ish column, and the contact when "Company" is also present.
  assert.strictEqual(mapHeaderRow(['Name', 'Notes']).mapping[0], 'company_name');
  assert.strictEqual(mapHeaderRow(['Company', 'Name', 'Notes']).mapping[1], 'contact_name');
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
  assert.strictEqual(second._rowNum, 4, 'the blank sheet row still counts toward row numbers');
  assert.strictEqual(first.website, 'https://acmeplumbing.com/contact');
  assert.strictEqual(first.contact_method, 'call');
  assert.strictEqual(first.made_contact, 'yes');
  assert.strictEqual(first.remind_at, '2026-10-20');
  assert.strictEqual(first.status, 'contacted');
  assert.strictEqual(first.contact_phone, '+1 (555) 200-3000');
  assert.deepStrictEqual(first._errors, []);

  assert.ok(second._errors.includes('Nothing to add (no note, contact, or status)'));
  assert.ok(second._warnings.some((w) => w.includes('Unknown status "hot"')));

  assert.ok(third._errors.includes('Missing company (name or URL)'));
}

function testBuildDraftRowsHeaderless() {
  const { rows, headerDetected } = buildNotesLoaderDraftRows([
    ['Acme Plumbing', 'acme.com', 'Quick note', 'email'],
  ]);
  assert.strictEqual(headerDetected, false);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].company_name, 'Acme Plumbing');
  assert.strictEqual(rows[0].website, 'acme.com');
  assert.strictEqual(rows[0].note, 'Quick note');
  assert.strictEqual(rows[0].contact_method, 'email');

  // Old-style headerless sheet that starts with the URL still works: the domain slides into website.
  const legacy = buildNotesLoaderDraftRows([['acme.com', '', 'Quick note']]);
  assert.strictEqual(legacy.rows[0].website, 'acme.com');
  assert.strictEqual(legacy.rows[0].company_name, '');
}

function testBareNameInUrlColumnBecomesCompanyName() {
  const { rows } = buildNotesLoaderDraftRows([
    ['website', 'company', 'note'],
    ['Gamma Electric', '', 'Matched by name'],
    ['N/A', 'Delta Roofing', 'Placeholder URL is dropped'],
    ['delta roofing', 'Delta Roofing', 'Name repeated in URL column'],
    ['call them tmrw', 'Delta Roofing', 'Garbage in URL column'],
    ['unknown', '', 'Nothing usable'],
  ]);
  assert.strictEqual(rows[0].website, '');
  assert.strictEqual(rows[0].company_name, 'Gamma Electric');
  assert.deepStrictEqual(rows[0]._errors, []);

  assert.strictEqual(rows[1].website, '');
  assert.strictEqual(rows[1].company_name, 'Delta Roofing');
  assert.deepStrictEqual(rows[1]._errors, []);
  assert.deepStrictEqual(rows[1]._warnings, []);

  assert.strictEqual(rows[2].website, '');
  assert.deepStrictEqual(rows[2]._warnings, [], 'same text in both columns is not worth a warning');

  assert.strictEqual(rows[3].website, '');
  assert.ok(rows[3]._warnings.some((w) => w.includes('not a web address')));
  assert.deepStrictEqual(rows[3]._errors, []);

  assert.ok(rows[4]._errors.includes('Missing company (name or URL)'));
}

function testEditingDoesNotHopBetweenColumns() {
  const row = normalizeNotesLoaderRow({ company_name: 'acme.c', website: '', note: 'x' }, 2, { inferColumns: false });
  assert.strictEqual(row.company_name, 'acme.c');
  assert.strictEqual(row.website, '');
  const bad = normalizeNotesLoaderRow({ company_name: 'Acme', website: 'acme plum', note: 'x' }, 2, { inferColumns: false });
  assert.ok(bad._errors.includes('Website is not a valid web address'));
}

function testHeaderBelowTitleRows() {
  const sheet = [
    ['Sales notes – Oct 13'],
    [],
    ['Company', 'Website', 'Notes', 'Method', 'Date'],
    ['Acme Plumbing', 'acme.com', 'Spoke with Pat', 'call', '10/13/2026'],
    ['Beta HVAC', '', 'Left VM', 'call', new Date(2026, 9, 13)],
  ];
  const header = findHeaderRow(sheet.map((cells, index) => ({ cells, index })).filter((r) => r.cells.length));
  assert.strictEqual(header.index, 2, 'header index is its position in the sheet, blank rows included');

  const { rows, headerDetected, headerRowIndex } = buildNotesLoaderDraftRows(sheet);
  assert.strictEqual(headerDetected, true);
  assert.strictEqual(headerRowIndex, 2);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0]._rowNum, 4, 'row numbers match the spreadsheet (1-based)');
  assert.strictEqual(rows[1]._rowNum, 5);
  assert.strictEqual(rows[0].company_name, 'Acme Plumbing');
  assert.strictEqual(rows[0].website, 'acme.com');
  assert.strictEqual(rows[0].note_date, '2026-10-13');
  assert.strictEqual(rows[1].note_date, '2026-10-13');
  assert.deepStrictEqual(rows[0]._errors, []);
  assert.deepStrictEqual(rows[1]._errors, []);
}

function testBestSheetIsPicked() {
  const draft = buildNotesLoaderDraftFromSheets([
    { name: 'Summary', rows: [['Total visits', 4], ['Hot leads', 1]] },
    { name: 'Notes', rows: [['company', 'website', 'note'], ['Acme', 'acme.com', 'hi']] },
    { name: 'Contacts', rows: [['contact_name', 'contact_email'], ['Pat', 'pat@acme.com']] },
  ]);
  assert.strictEqual(draft.sheetName, 'Notes');
  assert.strictEqual(draft.sheetCount, 3);
  assert.strictEqual(draft.rows.length, 1);
  assert.strictEqual(draft.rows[0].website, 'acme.com');

  const empty = buildNotesLoaderDraftFromSheets([]);
  assert.strictEqual(empty.rows.length, 0);
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
  assert.strictEqual(template[0][0], 'company');
  assert.strictEqual(template.length, 4);
  const parsedTemplate = buildNotesLoaderDraftRows(template);
  assert.strictEqual(parsedTemplate.headerDetected, true);
  assert.deepStrictEqual(parsedTemplate.unmappedHeaders, []);
  assert.strictEqual(parsedTemplate.rows.length, 3);
  parsedTemplate.rows.forEach((row) => {
    assert.deepStrictEqual(row._errors, []);
    assert.deepStrictEqual(row._warnings, []);
  });
  assert.strictEqual(parsedTemplate.rows[0].company_name, 'Acme Plumbing');
  assert.strictEqual(parsedTemplate.rows[0].website, 'https://www.acmeplumbing.com');
  assert.strictEqual(parsedTemplate.rows[2].website, '', 'a company without a website is fine');
  assert.strictEqual(parsedTemplate.rows[2].contact_method, 'in_person');

  const matched = matchRowsToLeads(parsedTemplate.rows, []);
  assert.ok(matched.every((r) => r._match.status === 'missing'));
  assert.strictEqual(matched[2]._match.leadName, 'Gamma Electric');
}

function run() {
  testWebsiteKey();
  testDateCells();
  testNormalizers();
  testFreeFormContacts();
  testHeaderMapping();
  testBuildDraftRowsWithHeader();
  testBuildDraftRowsHeaderless();
  testBareNameInUrlColumnBecomesCompanyName();
  testEditingDoesNotHopBetweenColumns();
  testHeaderBelowTitleRows();
  testBestSheetIsPicked();
  testMatching();
  testSubmitRowAndTemplate();
  console.log('crmNotesLoader tests passed');
}

run();
