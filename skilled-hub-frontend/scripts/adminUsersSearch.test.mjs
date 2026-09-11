import assert from 'assert';
import {
  applyAdvancedFilters,
  applyClientSearch,
  applyTabFilter,
  computeKpis,
  computeTabCounts,
  defaultColumnsForTab,
  enrichUserRow,
  formatExperienceYears,
  tradeLevelLabel,
} from '../src/utils/adminUsersDisplayAdapter.js';

function row(overrides) {
  return enrichUserRow({
    id: 1,
    email: 'ethan@example.com',
    first_name: 'Ethan',
    last_name: 'Freeman',
    phone: '+1 (832) 555-1212',
    company_name: 'FixIt Search Co',
    label: 'HVAC Technician',
    zip_code: '77002',
    role: 'technician',
    ...overrides,
  });
}

function testPartialAndFullName() {
  const rows = [row()];
  assert.strictEqual(applyClientSearch(rows, 'Ethan').length, 1);
  assert.strictEqual(applyClientSearch(rows, 'Freeman').length, 1);
  assert.strictEqual(applyClientSearch(rows, 'Ethan Freeman').length, 1);
}

function testEmail() {
  const rows = [row()];
  assert.strictEqual(applyClientSearch(rows, 'ethan').length, 1);
  assert.strictEqual(applyClientSearch(rows, '@example.com').length, 1);
  assert.strictEqual(applyClientSearch(rows, 'ethan@example').length, 1);
}

function testPhoneIgnoresFormatting() {
  const rows = [row({ phone: '+18325551212' })];
  ['832', '832555', '8325551212', '(832) 555-1212', '832-555-1212', '+1 832 555 1212', '+18325551212'].forEach((q) => {
    assert.strictEqual(applyClientSearch(rows, q).length, 1, `expected match for ${q}`);
  });
  assert.strictEqual(applyClientSearch(rows, '713').length, 0);
}

function testCompanyTradeZipAndMiss() {
  const rows = [row()];
  assert.strictEqual(applyClientSearch(rows, 'FixIt').length, 1);
  assert.strictEqual(applyClientSearch(rows, 'HVAC').length, 1);
  assert.strictEqual(applyClientSearch(rows, '770').length, 1);
  assert.strictEqual(applyClientSearch(rows, '77002').length, 1);
  assert.strictEqual(applyClientSearch(rows, 'zzqx-no-such').length, 0);
}

function testTrimsWhitespace() {
  const rows = [row()];
  assert.strictEqual(applyClientSearch(rows, '  Freeman  ').length, 1);
}

function testTradeLevelAndYearsColumns() {
  const tech = enrichUserRow({
    id: 2,
    email: 'tech@example.com',
    first_name: 'Pat',
    last_name: 'Pipe',
    role: 'technician',
    label: 'Plumber',
    skill_class: 'journeyman',
    experience_years: 8,
  });
  const helper = enrichUserRow({
    id: 3,
    email: 'help@example.com',
    first_name: 'Hal',
    last_name: 'Help',
    role: 'technician',
    label: 'HVAC Technician',
    skill_class: 'helper',
    experience_years: 1,
  });
  const company = enrichUserRow({
    id: 4,
    email: 'ops@example.com',
    first_name: 'Casey',
    last_name: 'Office',
    role: 'company',
    company_name: 'FixIt Co',
  });

  assert.strictEqual(tech.tradeLevelLabel, 'Journeyman');
  assert.strictEqual(tech.experienceYears, 8);
  assert.strictEqual(tech.experienceYearsLabel, '8 yrs');
  assert.strictEqual(helper.tradeLevelLabel, 'Helper');
  assert.strictEqual(formatExperienceYears(1), '1 yr');
  assert.strictEqual(tradeLevelLabel('MASTER'), 'Master');
  assert.strictEqual(company.tradeLevelLabel, '');
  assert.strictEqual(company.experienceYearsLabel, '');

  const mixed = [tech, helper, company];
  assert.strictEqual(applyAdvancedFilters(mixed, { tradeLevel: 'journeyman' }).map((u) => u.id).join(','), '2');
  assert.strictEqual(applyAdvancedFilters(mixed, { tradeLevel: 'helper' }).map((u) => u.id).join(','), '3');
  assert.strictEqual(applyAdvancedFilters(mixed, { minExperienceYears: '5' }).map((u) => u.id).join(','), '2');
  assert.deepStrictEqual(applyAdvancedFilters(mixed, { minExperienceYears: '1' }).map((u) => u.id), [2, 3]);
}

function testCompanyColumnLabelFollowsTab() {
  const allCols = defaultColumnsForTab('all');
  const techCols = defaultColumnsForTab('technicians');
  const companyCols = defaultColumnsForTab('company');
  const companyTrade = (cols) => cols.find((c) => c.key === 'company_trade').label;
  assert.strictEqual(companyTrade(allCols), 'Company');
  assert.strictEqual(companyTrade(companyCols), 'Company');
  assert.strictEqual(companyTrade(techCols), 'Trade');
  assert.ok(allCols.some((c) => c.key === 'trade_level' && c.label === 'Level'));
  assert.ok(allCols.some((c) => c.key === 'experience_years' && c.label === 'Years'));
}

function testKpisStayOnFullCensusWhenTabFilters() {
  const mixed = [
    row({ id: 1, role: 'technician', email: 'a@example.com' }),
    row({ id: 2, role: 'technician', email: 'b@example.com', first_name: 'Pat', last_name: 'Pipe' }),
    enrichUserRow({
      id: 3,
      email: 'ops@example.com',
      first_name: 'Casey',
      last_name: 'Office',
      role: 'company',
      company_name: 'FixIt Co',
    }),
  ];
  const kpis = computeKpis(mixed);
  const counts = computeTabCounts(mixed);
  const techRows = applyTabFilter(mixed, 'technicians');
  const allRows = applyTabFilter(mixed, 'all');

  assert.strictEqual(kpis.total, 3);
  assert.strictEqual(kpis.technicians, 2);
  assert.strictEqual(kpis.companies, 1);
  assert.strictEqual(counts.all, 3);
  assert.strictEqual(counts.technicians, 2);
  assert.strictEqual(counts.company, 1);
  assert.strictEqual(techRows.length, 2);
  assert.strictEqual(allRows.length, 3);
  assert.ok(allRows.some((u) => u.role === 'company'));
}

testPartialAndFullName();
testEmail();
testPhoneIgnoresFormatting();
testCompanyTradeZipAndMiss();
testTrimsWhitespace();
testTradeLevelAndYearsColumns();
testCompanyColumnLabelFollowsTab();
testKpisStayOnFullCensusWhenTabFilters();
console.log('adminUsersSearch tests passed');
