import { getFullName } from './adminUsersDisplayAdapter';

const EXPORT_COLUMNS = [
  { key: 'id', header: 'ID' },
  { key: 'displayName', header: 'Name' },
  { key: 'email', header: 'Email' },
  { key: 'phone', header: 'Phone' },
  { key: 'role', header: 'Type' },
  { key: 'accountStatus', header: 'Status' },
  { key: 'verificationStatus', header: 'Verification' },
  { key: 'companyTradeLabel', header: 'Company / Trade' },
  { key: 'subscriptionTier', header: 'Subscription' },
  { key: 'logins30d', header: 'Logins (30d)' },
  { key: 'riskLevel', header: 'Risk' },
  { key: 'created_at', header: 'Joined' },
];

function escapeCsv(val) {
  const s = val == null ? '' : String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportUsersToCsv(rows, filename = 'techflash-users.csv') {
  const enriched = rows.map((r) => ({
    ...r,
    displayName: r.displayName || getFullName(r),
    role: r.role === 'technician' ? 'Technician' : r.role === 'company' ? 'Company' : r.role,
    created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
  }));

  const header = EXPORT_COLUMNS.map((c) => escapeCsv(c.header)).join(',');
  const body = enriched
    .map((row) =>
      EXPORT_COLUMNS.map((c) => escapeCsv(row[c.key])).join(',')
    )
    .join('\n');

  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
