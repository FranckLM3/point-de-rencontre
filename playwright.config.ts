import { defineConfig, devices } from '@playwright/test'

const URL_LOCALE = 'http://localhost:4173/point-de-rencontre/'

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: URL_LOCALE },
  webServer: {
    command: 'npx vite build --mode e2e && npx vite preview --port 4173 --strictPort',
    url: URL_LOCALE,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'ordinateur', use: { viewport: { width: 1440, height: 900 } } },
  ],
})
