import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',use:{baseURL:process.env.PLAYWRIGHT_BASE_URL||'http://127.0.0.1:3000',headless:true,launchOptions:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}},workers:1});
