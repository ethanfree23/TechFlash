/** Public demo account credentials (safe to show admins on production). */
export const DEMO_ACCOUNTS = {
  admin: {
    label: 'Demo Admin',
    email: 'demo.admin@techflash.app',
    password: 'DemoPassword123!',
  },
  company: {
    label: 'Demo Company',
    email: 'demo.company@techflash.app',
    password: 'DemoPassword123!',
  },
  technician: {
    label: 'Demo Technician',
    email: 'demo.tech@techflash.app',
    password: 'DemoPassword123!',
  },
};

export const DEMO_APP_URL =
  import.meta.env.VITE_DEMO_APP_URL || 'https://techflash.app/demo';
