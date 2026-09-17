import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/point-de-rencontre/',
  test: { environment: 'jsdom', include: ['tests/unit/**/*.test.ts'] },
})
