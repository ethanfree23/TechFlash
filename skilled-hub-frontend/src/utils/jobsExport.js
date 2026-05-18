import { formatJobPay, formatJobLocation, getClaimedTechnicianName } from './jobDisplayUtils';
import { getJobDisplayStatus } from './jobStatus';

const escapeCsv = (value) => {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
};

/**
 * Client-side CSV export of currently visible jobs.
 * Full historical server export requires backend integration.
 */
export const exportJobsToCsv = (jobs, filename = 'techflash-jobs-export.csv') => {
  const rows = Array.isArray(jobs) ? jobs : [];
  const headers = [
    'ID',
    'Title',
    'Company',
    'Trade',
    'Location',
    'Start Date',
    'Pay',
    'Status',
    'Claimed By',
    'Created',
  ];

  const lines = [
    headers.join(','),
    ...rows.map((job) => {
      const display = getJobDisplayStatus(job);
      return [
        job.id,
        job.title,
        job.company_profile?.company_name || '',
        job.skill_class || '',
        formatJobLocation(job) || '',
        job.scheduled_start_at ? new Date(job.scheduled_start_at).toISOString() : '',
        formatJobPay(job) || '',
        display.label,
        getClaimedTechnicianName(job) || '',
        job.created_at ? new Date(job.created_at).toISOString() : '',
      ]
        .map(escapeCsv)
        .join(',');
    }),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
