// Hono server builds for Cloudflare Pages and Vercel.
import cloudflareBuild from '@hono/vite-build/cloudflare-pages'
import vercelBuild from '@hono/vite-build/vercel'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  plugins: [
    mode === 'vercel' ? vercelBuild() : cloudflareBuild(),
    devServer({ adapter, entry: 'src/index.tsx' }),
  ],
}))
