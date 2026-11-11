import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'

export default defineConfig(({ mode }) => {
  // Vercel sets VERCEL_ENV=production|preview|development at build time, but Vite only
  // auto-exposes env keys prefixed with VITE_ to the client bundle. Copy through when
  // present so Stripe deploy gating can read import.meta.env.VITE_VERCEL_ENV.
  // Do NOT invent "production" when VERCEL_ENV is unset (local vite build → fail closed).
  if (!process.env.VITE_VERCEL_ENV && process.env.VERCEL_ENV) {
    process.env.VITE_VERCEL_ENV = process.env.VERCEL_ENV
  }

  return {
    // Capacitor loads assets from file:// — relative base. Web builds use absolute '/'.
    base: mode === 'capacitor' ? './' : '/',
    plugins: [react()],
    css: {
      postcss: {
        plugins: [tailwindcss()],
      },
    },
  }
})
