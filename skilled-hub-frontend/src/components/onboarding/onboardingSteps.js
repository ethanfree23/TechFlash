export const ONBOARDING_SECTIONS = [
  {
    key: 'profile',
    label: 'Your Profile',
    short: 'Profile',
    description: 'Confirm who you are and how you work.',
  },
  {
    key: 'verification',
    label: 'Verification',
    short: 'Verification',
    description: 'Licenses, references, and background check.',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    short: 'Notifications',
    description: 'Choose how you hear about new jobs.',
  },
  {
    key: 'billing',
    label: 'Billing & Payments',
    short: 'Payments',
    description: 'Set up how you get paid.',
  },
  {
    key: 'membership',
    label: 'Membership & Job Access',
    short: 'Membership',
    description: 'Review your plan and job access.',
  },
];

export const PROFILE_SUBSTEPS = [
  { key: 'personal', label: 'Personal information' },
  { key: 'professional', label: 'Professional information' },
  { key: 'preferences', label: 'Work preferences' },
];

export const VERIFICATION_SUBSTEPS = [
  { key: 'licenses', label: 'Licenses & certifications' },
  { key: 'references', label: 'Professional references' },
  { key: 'background', label: 'Background check' },
];

export function sectionIndex(key) {
  return ONBOARDING_SECTIONS.findIndex((s) => s.key === key);
}

export function statusLabel(status) {
  switch (status) {
    case 'complete':
    case 'complete_with_optional':
      return 'Complete';
    case 'pending_review':
    case 'pending_external':
      return 'Pending review';
    case 'acknowledged':
      return 'Configured';
    case 'action_required':
      return 'Action required';
    default:
      return status || 'Not started';
  }
}
