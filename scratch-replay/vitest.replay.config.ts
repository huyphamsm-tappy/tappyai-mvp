import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
Object.assign(process.env, loadEnv('development', root, ''))
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  test: { root, include: ['scratch-replay/**/*.replay.ts'], testTimeout: 120000, environment: 'node' },
} as never)
