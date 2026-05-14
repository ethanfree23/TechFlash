/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tf: {
          navy: '#0f172a',
          'navy-soft': '#132337',
          orange: '#FE6711',
          'orange-hover': '#e55a0a',
          blue: '#3A7CA5',
          'blue-dark': '#2F5D7C',
          muted: '#F7F7F7',
        },
      },
    },
  },
  plugins: [],
};
