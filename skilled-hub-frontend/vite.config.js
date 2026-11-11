import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'

/**
 * Map Vercel's VERCEL_ENV into the VITE_* namespace Vite inlines for the client.
 * Fail closed on conflicts; never invent production when VERCEL_ENV is unset.
 */
export function applyVercelEnvToViteProcessEnv(env = process.env) {
  const vercelEnv = String(env.VERCEL_ENV || '').trim()
  const viteVercelEnv = String(env.VITE_VERCEL_ENV || '').trim()

  if (vercelEnv && viteVercelEnv && vercelEnv !== viteVercelEnv) {
    throw new Error(
      `[stripe] VITE_VERCEL_ENV=${viteVercelEnv} conflicts with VERCEL_ENV=${vercelEnv} — fail closed`
    )
  }

  if (!viteVercelEnv && vercelEnv) {
    env.VITE_VERCEL_ENV = vercelEnv
  }

  return env.VITE_VERCEL_ENV || ''
}

export default defineConfig(({ mode }) => {
  applyVercelEnvToViteProcessEnv(process.env)

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
