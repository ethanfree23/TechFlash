/** @typedef {{ target: string, title: string, content: string, path?: string, settingsTab?: string, openFlagshipJob?: boolean, openReviewedDemoJob?: boolean, marketFilter?: string, userTab?: string }} DemoWalkthroughStep */

/** @type {DemoWalkthroughStep[]} */
export const DEMO_WALKTHROUGH_STEPS = [
  {
    target: '[data-demo="demo-welcome-hero"]',
    title: 'Welcome to TechFlash',
    content:
      'This is a live Texas marketplace demo — ~1,900 jobs across Houston, Austin, and Dallas. Tap Start Demo here anytime.',
  },
  {
    target: '[data-demo="admin-dashboard-stats"]',
    title: 'Marketplace at a glance',
    content:
      'Jobs, companies, technicians, messages, reviews, and payments — all updating from seeded marketplace activity so you can show real operational depth in the first minute.',
  },
  {
    target: '[data-demo="marketplace-health"]',
    title: 'Marketplace health',
    content:
      'Liquidity, verification, and revenue signals help admins spot where the marketplace is thriving and where to focus next.',
  },
  {
    target: '[data-demo="jobs-tab"]',
    title: 'Jobs board',
    content:
      'Every job across the platform — open, claimed, in progress, and completed — with filters for trade, city, and status.',
    path: '/jobs',
  },
  {
    target: '[data-demo="featured-job-callout"]',
    title: 'Featured urgent job',
    content:
      'This Houston HVAC callout shows how companies post short-term coverage when a crew member drops — high pay, clear scope, fast fill.',
    path: '/jobs',
  },
  {
    target: '[data-demo="job-detail-card"]',
    title: 'Job detail',
    content:
      'Trade, location, schedule, pay, requirements, assigned technician, messages, and activity — everything both sides need in one place.',
    path: '/jobs',
    openFlagshipJob: true,
  },
  {
    target: '[data-demo="messages-section"]',
    title: 'In-app messaging',
    content:
      'Companies and technicians coordinate arrival, gate access, and scope without losing context — threaded to each job.',
    path: '/messages',
  },
  {
    target: '[data-demo="reviews-section"]',
    title: 'Two-sided reviews',
    content:
      'Completed jobs build trust with bilateral ratings — companies and technicians review each other on reliability, communication, and workmanship.',
    openReviewedDemoJob: true,
  },
  {
    target: '[data-demo="payments-section"]',
    title: 'Payments & memberships',
    content:
      'Membership tiers, held payouts, and Stripe checkout — all in demo sandbox mode with simulated charges only.',
    path: '/settings',
    settingsTab: 'payment',
  },
  {
    target: '[data-demo="city-coverage"]',
    title: 'City-by-city expansion',
    content:
      'Filter the command center by market to show how TechFlash scales city by city — Houston, Austin, Dallas, and beyond.',
    path: '/dashboard',
    marketFilter: 'houston',
  },
  {
    target: '[data-demo="account-role-switcher"]',
    title: 'Switch demo roles',
    content:
      'Open Account role to preview as Bayou City Mechanical or a demo technician, then return to admin with one click. Reset demo data lives here too.',
    path: '/settings',
    settingsTab: 'account',
  },
  {
    target: '[data-demo="walkthrough-start"]',
    title: 'You’re ready',
    content:
      'Companies post short-term jobs, technicians claim work, both sides communicate, jobs get completed, and admins run the marketplace.',
    path: '/dashboard',
  },
];

export const DEMO_TOUR_STORAGE_KEY = 'techflash_demo_tour_v1';
export const DEMO_FLAGSHIP_JOB_KEY = 'techflash_demo_flagship_job_id';
