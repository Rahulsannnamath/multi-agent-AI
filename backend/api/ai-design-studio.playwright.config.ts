import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir:'./test/ai-design-studio',timeout:60000,workers:1,use:{baseURL:process.env['STUDIO_TEST_URL']??'http://localhost:5173',headless:true,viewport:{width:1600,height:1000},channel:'chrome'},reporter:'list' });
