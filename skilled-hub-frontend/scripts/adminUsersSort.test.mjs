import assert from 'assert';
import { nextTechnicianInList, sortAdminUserRows } from '../src/utils/adminUsersSort.js';

function tech(id, displayName, extras = {}) {
  return { id, role: 'technician', displayName, ...extras };
}

function company(id, displayName) {
  return { id, role: 'company', displayName };
}

function testSortByNameDesc() {
  const rows = [tech(1, 'Carl'), tech(2, 'Amy'), tech(3, 'Bea')];
  const sorted = sortAdminUserRows(rows, 'user', 'desc');
  assert.deepStrictEqual(
    sorted.map((r) => r.id),
    [1, 3, 2]
  );
}

function testSortByLastContactedAsc() {
  const rows = [
    tech(1, 'A', { activation: { last_contacted_at: '2024-03-01T00:00:00Z' } }),
    tech(2, 'B', { activation: { last_contacted_at: '2024-01-01T00:00:00Z' } }),
    tech(3, 'C', { activation: { last_contacted_at: '2024-02-01T00:00:00Z' } }),
  ];
  const sorted = sortAdminUserRows(rows, 'last_contacted', 'asc');
  assert.deepStrictEqual(
    sorted.map((r) => r.id),
    [2, 3, 1]
  );
}

function testNextTechFollowsSortedOrderNotCensusOrder() {
  // Census / filter order: Carl, Amy, Bea
  // Sorted by name asc: Amy, Bea, Carl
  const rows = [tech(1, 'Carl'), tech(2, 'Amy'), tech(3, 'Bea')];
  const nextFromAmy = nextTechnicianInList(rows, 2, 'user', 'asc');
  assert.strictEqual(nextFromAmy.id, 3, 'after Amy should open Bea (sorted), not Carl (census)');

  const nextFromBea = nextTechnicianInList(rows, 3, 'user', 'asc');
  assert.strictEqual(nextFromBea.id, 1);

  const nextFromCarl = nextTechnicianInList(rows, 1, 'user', 'asc');
  assert.strictEqual(nextFromCarl.id, 2);
}

function testNextTechSkipsCompaniesAndWraps() {
  const rows = [
    company(10, 'Acme'),
    tech(2, 'Amy'),
    company(11, 'Beta Co'),
    tech(3, 'Bea'),
  ];
  const next = nextTechnicianInList(rows, 2, 'user', 'asc');
  assert.strictEqual(next.id, 3);

  const wrap = nextTechnicianInList(rows, 3, 'user', 'asc');
  assert.strictEqual(wrap.id, 2);
}

function testNextTechToleratesStringIds() {
  const rows = [tech(1, 'Carl'), tech(2, 'Amy'), tech(3, 'Bea')];
  const next = nextTechnicianInList(rows, '2', 'user', 'asc');
  assert.strictEqual(next.id, 3);
}

function testNextTechReturnsNullWhenAloneOrEmpty() {
  assert.strictEqual(nextTechnicianInList([], 1, 'user', 'asc'), null);
  assert.strictEqual(nextTechnicianInList([tech(1, 'Only')], 1, 'user', 'asc'), null);
  assert.strictEqual(nextTechnicianInList([company(9, 'Only Co')], 9, 'user', 'asc'), null);
}

testSortByNameDesc();
testSortByLastContactedAsc();
testNextTechFollowsSortedOrderNotCensusOrder();
testNextTechSkipsCompaniesAndWraps();
testNextTechToleratesStringIds();
testNextTechReturnsNullWhenAloneOrEmpty();
console.log('adminUsersSort.test.mjs: ok');
