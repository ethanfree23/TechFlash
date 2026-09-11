import assert from 'assert';
import {
  ADMIN_USERS_PAGE_SIZES,
  DEFAULT_ADMIN_USERS_PAGE_SIZE,
  ADMIN_USERS_PAGE_SIZE_STORAGE_KEY,
  normalizePageSize,
  paginateItems,
  persistPageSize,
  readStoredPageSize,
} from '../src/utils/adminUsersPagination.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const items = Array.from({ length: 103 }, (_, i) => ({ id: i + 1 }));

function testPageSizeOptions() {
  assert.deepStrictEqual(ADMIN_USERS_PAGE_SIZES, [10, 20, 50, 100]);
  assert.strictEqual(normalizePageSize(50), 50);
  assert.strictEqual(normalizePageSize('20'), 20);
  assert.strictEqual(normalizePageSize(7), DEFAULT_ADMIN_USERS_PAGE_SIZE);
  assert.strictEqual(normalizePageSize('all'), DEFAULT_ADMIN_USERS_PAGE_SIZE);
}

function testPaginateFirstPage() {
  const page = paginateItems(items, 1, 20);
  assert.strictEqual(page.items.length, 20);
  assert.strictEqual(page.items[0].id, 1);
  assert.strictEqual(page.items[19].id, 20);
  assert.strictEqual(page.start, 1);
  assert.strictEqual(page.end, 20);
  assert.strictEqual(page.total, 103);
  assert.strictEqual(page.totalPages, 6);
}

function testPaginateLastPageAndClamp() {
  const last = paginateItems(items, 6, 20);
  assert.strictEqual(last.items.length, 3);
  assert.strictEqual(last.start, 101);
  assert.strictEqual(last.end, 103);
  assert.strictEqual(last.page, 6);

  const clamped = paginateItems(items, 99, 50);
  assert.strictEqual(clamped.page, 3);
  assert.strictEqual(clamped.items.length, 3);
  assert.strictEqual(paginateItems(items, 0, 10).page, 1);
}

function testEmptyAndStorage() {
  const empty = paginateItems([], 2, 10);
  assert.deepStrictEqual(empty.items, []);
  assert.strictEqual(empty.start, 0);
  assert.strictEqual(empty.end, 0);
  assert.strictEqual(empty.totalPages, 1);

  const store = new Map();
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  };
  persistPageSize(100, storage);
  assert.strictEqual(store.get(ADMIN_USERS_PAGE_SIZE_STORAGE_KEY), '100');
  assert.strictEqual(readStoredPageSize(storage), 100);
  persistPageSize(7, storage);
  assert.strictEqual(readStoredPageSize(storage), DEFAULT_ADMIN_USERS_PAGE_SIZE);
}

function testAdminUsersPagePushesFooterBelowFold() {
  const page = readFileSync(join(__dirname, '../src/pages/AdminUsersPage.jsx'), 'utf8');
  const table = readFileSync(join(__dirname, '../src/components/admin/users/UsersTable.jsx'), 'utf8');
  assert.match(page, /h-dvh/);
  assert.match(page, /<AppFooter \/>/);
  assert.doesNotMatch(page, /lg:h-screen[\s\S]*<AppFooter \/>/);
  assert.match(table, /Rows per page/);
  assert.match(table, /ADMIN_USERS_PAGE_SIZES/);
  assert.match(table, /whitespace-nowrap/);
  assert.doesNotMatch(table, /break-words/);
  assert.match(page, /role: 'all'/);
  assert.doesNotMatch(page, /getApiRoleForTab/);
}

testPageSizeOptions();
testPaginateFirstPage();
testPaginateLastPageAndClamp();
testEmptyAndStorage();
testAdminUsersPagePushesFooterBelowFold();
console.log('adminUsersPagination tests passed');
