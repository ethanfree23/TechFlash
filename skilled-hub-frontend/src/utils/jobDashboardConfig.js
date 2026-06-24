import { auth } from '../auth';
import {
  computeClaimedCountFromJobs,
  computeCounterPendingCountFromJobs,
  computeExpiredCountFromJobs,
} from './jobDisplayUtils';

export const VIEW_MODES = {
  CARD: 'card',
  TABLE: 'table',
  CALENDAR: 'calendar',
};

export const getRoleKey = () => {
  if (auth.isAdmin()) return 'admin';
  if (auth.isCompany()) return 'company';
  return 'technician';
};

const ADMIN_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'active', label: 'Active (Live)' },
  { value: 'reserved', label: 'Claimed' },
  { value: 'completed', label: 'Completed' },
  { value: 'expired', label: 'Expired' },
];

const COMPANY_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'active', label: 'Active' },
  { value: 'reserved', label: 'Claimed' },
  { value: 'completed', label: 'Completed' },
  { value: 'expired', label: 'Expired' },
];

const TECH_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'active', label: 'Active' },
  { value: 'reserved', label: 'Claimed' },
  { value: 'completed', label: 'Completed' },
];

const ADMIN_SORT_OPTIONS = [
  { value: 'most_recent', label: 'Most recent' },
  { value: 'soonest_to_start', label: 'Starts soon' },
  { value: 'highest_pay', label: 'Highest pay' },
  { value: 'longest_job', label: 'Longest job' },
  { value: 'shortest_job', label: 'Shortest job' },
];

const COMPANY_SORT_OPTIONS = ADMIN_SORT_OPTIONS;

const TECH_SORT_OPTIONS = [
  { value: 'most_recent', label: 'Most recent' },
  { value: 'soonest_to_start', label: 'Starts soon' },
  { value: 'distance', label: 'Closest' },
  { value: 'highest_pay', label: 'Highest pay' },
];

export const ROLE_CONFIG = {
  admin: {
    title: 'Jobs',
    subtitle: 'Create, monitor, and manage every job posted on TechFlash.',
    showKpis: true,
    showCreateJob: true,
    showExport: true,
    showSaveView: true,
    showReferral: false,
    showSaveSearch: false,
    showCompletedSection: false,
    viewModes: [VIEW_MODES.CARD, VIEW_MODES.TABLE, VIEW_MODES.CALENDAR],
    statusOptions: ADMIN_STATUS_OPTIONS,
    sortOptions: ADMIN_SORT_OPTIONS,
    filterFields: ['search', 'location', 'trade', 'status', 'dateRange', 'sort'],
    emptyNoJobs: {
      title: 'No jobs yet',
      message: 'Create the first job or invite a company to post one.',
      actionLabel: 'Create Job',
      actionTo: '/jobs/create',
    },
    emptyNoMatch: {
      title: 'No matching jobs',
      message: 'Try adjusting your filters or clearing them to see more results.',
    },
  },
  company: {
    title: 'My Jobs',
    subtitle: 'Post short-term jobs, manage applicants, and track active work.',
    showKpis: true,
    showCreateJob: true,
    showExport: false,
    showSaveView: true,
    showReferral: false,
    showSaveSearch: false,
    showCompletedSection: false,
    viewModes: [VIEW_MODES.CARD, VIEW_MODES.TABLE],
    statusOptions: COMPANY_STATUS_OPTIONS,
    sortOptions: COMPANY_SORT_OPTIONS,
    filterFields: ['search', 'location', 'trade', 'status', 'sort'],
    emptyNoJobs: {
      title: "You haven't posted any jobs yet",
      message: 'Create a job to start finding available technicians.',
      actionLabel: 'Create Job',
      actionTo: '/jobs/create',
    },
    emptyNoMatch: {
      title: 'No matching jobs',
      message: 'Try adjusting your filters or clearing them to see your posted jobs.',
    },
  },
  technician: {
    title: 'Available Jobs',
    subtitle:
      'Find short-term skilled trade jobs that match your location, schedule, and experience.',
    techNote:
      'Open roles are often claimed within a day or two when the schedule works for nearby techs. Save your filters to spot matching posts faster.',
    showKpis: false,
    showCreateJob: false,
    showExport: false,
    showSaveView: false,
    showReferral: true,
    showSaveSearch: true,
    showCompletedSection: true,
    viewModes: [VIEW_MODES.CARD],
    statusOptions: TECH_STATUS_OPTIONS,
    sortOptions: TECH_SORT_OPTIONS,
    filterFields: [
      'search',
      'distance',
      'location',
      'trade',
      'licenseClass',
      'experience',
      'startDate',
      'payRange',
      'status',
      'sort',
    ],
    emptyNoJobs: {
      title: 'No matching jobs right now',
      message: "Save this search and we'll help you spot new jobs faster.",
    },
    emptyNoMatch: {
      title: 'No matching jobs',
      message: 'Try widening your distance, location, or pay range—or save this search for later.',
    },
  },
};

export const getDashboardConfig = () => ROLE_CONFIG[getRoleKey()] || ROLE_CONFIG.technician;

export const buildKpiCards = (role, analytics, allJobsSnapshot) => {
  const jobs = allJobsSnapshot || [];

  if (role === 'admin') {
    return [
      { id: 'total', label: 'Total Jobs', value: analytics?.total_jobs ?? jobs.length, tone: 'slate', filterStatus: '' },
      { id: 'open', label: 'Open Jobs', value: analytics?.jobs_open ?? 0, tone: 'blue', filterStatus: 'open' },
      { id: 'claimed', label: 'Claimed', value: analytics?.jobs_in_progress ?? 0, tone: 'orange', filterStatus: 'reserved' },
      { id: 'completed', label: 'Completed Jobs', value: analytics?.jobs_finished ?? 0, tone: 'green', filterStatus: 'completed' },
      { id: 'expired', label: 'Expired Jobs', value: computeExpiredCountFromJobs(jobs), tone: 'gray', filterStatus: 'expired' },
      { id: 'counter', label: 'Counter Pending', value: computeCounterPendingCountFromJobs(jobs), tone: 'orange', filterStatus: '' },
    ];
  }

  if (role === 'company') {
    return [
      { id: 'active', label: 'Active', value: analytics?.jobs_active ?? 0, tone: 'green', filterStatus: 'active' },
      { id: 'open', label: 'Open', value: analytics?.jobs_open ?? 0, tone: 'blue', filterStatus: 'open' },
      { id: 'claimed', label: 'Claimed', value: analytics?.jobs_claimed ?? computeClaimedCountFromJobs(jobs), tone: 'orange', filterStatus: 'reserved' },
      { id: 'completed', label: 'Completed Jobs', value: analytics?.jobs_completed ?? 0, tone: 'green', filterStatus: 'completed' },
      { id: 'expired', label: 'Expired Jobs', value: analytics?.jobs_expired ?? computeExpiredCountFromJobs(jobs), tone: 'gray', filterStatus: 'expired' },
    ];
  }

  return [];
};

export const getSavedViewStorageKey = (userId, role) => `jobs_saved_view_v1_${userId}_${role}`;
export const getViewModeStorageKey = (userId) => `jobs_view_mode_v1_${userId}`;
export const getSavedJobsStorageKey = (userId) => `jobs_saved_bookmarks_v1_${userId}`;
