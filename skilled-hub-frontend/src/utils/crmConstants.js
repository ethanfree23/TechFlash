/** Shared CRM enums and labels — keep in sync with Rails CrmLead / CrmNote. */

export const CRM_STATUSES = [
  'lead',
  'contacted',
  'qualified',
  'proposal',
  'prospect',
  'customer',
  'competitor',
  'churned',
  'lost',
];

export const CRM_COMPANY_TYPES = [
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

export const CRM_NOTE_CONTACT_METHODS = ['call', 'text', 'email', 'in_person', 'note'];

export const CRM_MERGE_FIELDS = [
  { key: 'name', label: 'Company name' },
  { key: 'contact_name', label: 'Primary contact name' },
  { key: 'email', label: 'Primary email' },
  { key: 'phone', label: 'Primary phone' },
  { key: 'company_email', label: 'Company email' },
  { key: 'company_phone', label: 'Company phone' },
  { key: 'bio', label: 'Company bio' },
  { key: 'website', label: 'Website' },
  { key: 'street_address', label: 'Street address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'ZIP' },
  { key: 'instagram_url', label: 'Instagram URL' },
  { key: 'facebook_url', label: 'Facebook URL' },
  { key: 'linkedin_url', label: 'LinkedIn URL' },
  { key: 'status', label: 'Status' },
  { key: 'linked_user_id', label: 'Linked company user id' },
  { key: 'linked_company_profile_id', label: 'Linked company profile id' },
];

export const CRM_PIPELINE_STORAGE_KEY = 'table-columns-v2-crm_pipeline';
export const CRM_PIPELINE_DEFAULT_COLUMNS = [
  { key: 'status', label: 'Status', visible: true },
  { key: 'linked_account', label: 'Linked account', visible: true },
  { key: 'contact_email', label: 'Email preview', visible: true },
];

/** UI-only market buckets (Texas metros + other) inferred from city/state text. */
export const CRM_MARKET_FILTERS = [
  { id: 'all', label: 'All markets' },
  { id: 'houston', label: 'Houston' },
  { id: 'dallas', label: 'Dallas' },
  { id: 'austin', label: 'Austin' },
  { id: 'san_antonio', label: 'San Antonio' },
  { id: 'other', label: 'Other' },
];

/** Trade filter options — maps to company_types + facility_maintenance grouping. */
export const CRM_TRADE_FILTER_OPTIONS = [
  { id: 'all', label: 'All trades', types: null },
  { id: 'electrical', label: 'Electrical', types: ['electrical'] },
  { id: 'hvac', label: 'HVAC', types: ['hvac'] },
  { id: 'plumbing', label: 'Plumbing', types: ['plumbing'] },
  { id: 'construction', label: 'Construction', types: ['general_contracting', 'handyman'] },
  { id: 'maintenance', label: 'Maintenance', types: ['facility_maintenance'] },
  { id: 'roofing', label: 'Roofing', types: ['roofing'] },
  { id: 'refrigeration', label: 'Refrigeration', types: ['refrigeration'] },
  { id: 'other', label: 'Other', types: ['fire_protection', 'solar', 'appliance_repair', 'other'] },
];

export const CRM_DATE_RANGE_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: 'all', label: 'All time' },
];

export const CRM_SORT_OPTIONS = [
  { id: 'updated_desc', label: 'Recently updated' },
  { id: 'created_desc', label: 'Newest' },
  { id: 'created_asc', label: 'Oldest' },
  { id: 'name_asc', label: 'Name A–Z' },
  { id: 'unlinked_first', label: 'Unlinked first' },
];

export const CRM_QUICK_PIPELINE_FILTERS = [
  { id: 'all', label: 'All' },
  ...CRM_STATUSES.map((s) => ({ id: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
  { id: 'needs_followup', label: 'Needs follow-up' },
  { id: 'stale', label: 'Stale' },
  { id: 'unlinked', label: 'Unlinked' },
];

export const CRM_NOTE_QUICK_TEMPLATES = [
  { id: 'cold_call', label: 'Cold call', method: 'call', title: 'Cold call', body: 'Called — ' },
  { id: 'voicemail', label: 'Left voicemail', method: 'call', title: 'Voicemail', body: 'Left voicemail. ' },
  { id: 'interested', label: 'Interested', method: 'call', title: 'Interested', body: 'Interested in TechFlash. Next steps: ' },
  { id: 'followup', label: 'Needs follow-up', method: 'note', title: 'Follow-up needed', body: 'Follow up on: ' },
  { id: 'not_interested', label: 'Not interested', method: 'call', title: 'Not interested', body: 'Not interested. Reason: ' },
  { id: 'bad_number', label: 'Bad number', method: 'call', title: 'Bad number', body: 'Could not reach — wrong or disconnected number.' },
  { id: 'job_discussed', label: 'Job opportunity discussed', method: 'note', title: 'Job discussed', body: 'Discussed job needs: ' },
  { id: 'pricing', label: 'Pricing discussed', method: 'note', title: 'Pricing', body: 'Discussed pricing / rates: ' },
  { id: 'demo', label: 'Demo requested', method: 'note', title: 'Demo requested', body: 'Wants a walkthrough of posting / hiring. ' },
];

export const CONTACT_JOB_TITLE_SUGGESTIONS = [
  'Owner',
  'Operations Manager',
  'Office Manager',
  'Dispatcher',
  'Hiring Manager',
  'Foreman',
  'Accounting / Billing',
  'Other',
];
