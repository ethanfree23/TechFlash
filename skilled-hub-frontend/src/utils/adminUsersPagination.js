export const ADMIN_USERS_PAGE_SIZES = [10, 20, 50, 100];
export const DEFAULT_ADMIN_USERS_PAGE_SIZE = 20;
export const ADMIN_USERS_PAGE_SIZE_STORAGE_KEY = 'admin-users-page-size';

export function normalizePageSize(value, fallback = DEFAULT_ADMIN_USERS_PAGE_SIZE) {
  const n = Number(value);
  return ADMIN_USERS_PAGE_SIZES.includes(n) ? n : fallback;
}

export function readStoredPageSize(storage = typeof window === 'undefined' ? null : window.localStorage) {
  try {
    return normalizePageSize(storage?.getItem?.(ADMIN_USERS_PAGE_SIZE_STORAGE_KEY));
  } catch {
    return DEFAULT_ADMIN_USERS_PAGE_SIZE;
  }
}

export function persistPageSize(pageSize, storage = typeof window === 'undefined' ? null : window.localStorage) {
  try {
    storage?.setItem?.(ADMIN_USERS_PAGE_SIZE_STORAGE_KEY, String(normalizePageSize(pageSize)));
  } catch {
    // Ignore private-mode / disabled storage.
  }
}

export function paginateItems(items, page, pageSize) {
  const list = Array.isArray(items) ? items : [];
  const size = normalizePageSize(pageSize);
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const requested = Number(page);
  const currentPage = Number.isFinite(requested)
    ? Math.min(Math.max(1, Math.trunc(requested)), totalPages)
    : 1;
  const startIndex = (currentPage - 1) * size;
  const end = Math.min(startIndex + size, total);

  return {
    items: list.slice(startIndex, end),
    page: currentPage,
    pageSize: size,
    total,
    totalPages,
    start: total === 0 ? 0 : startIndex + 1,
    end,
  };
}
