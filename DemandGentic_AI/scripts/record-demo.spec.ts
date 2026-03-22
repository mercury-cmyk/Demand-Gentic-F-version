import { test, expect } from '@playwright/test';

// Configuration
const BASE_URL = 'http://localhost:5000'; // Adjust if running on a different port
const SCREEN_SIZE = { width: 1920, height: 1080 };
const STEP_DELAY = 4000; // Time to linger on each section (ms)

test('Record Client Dashboard Walkthrough', async ({ page }) => {
  // 1. Setup
  await page.setViewportSize(SCREEN_SIZE);
  
  // NAVIGATE TO LOGIN
  await page.goto(`${BASE_URL}/client-portal/dashboard`); 

  // PAUSE FOR MANUAL LOGIN
  console.log('Pausing for manual login... Please log in and then resume the script in the Playwright Inspector.');
  await page.pause(); 

  // 2. Overview Dashboard
  console.log('Showing Overview...');
  // Only proceed if dashboard is visible, waiting longer for potential load times
  await expect(page.locator('h1', { hasText: 'Dashboard' })).toBeVisible({ timeout: 10000 });
  await page.mouse.move(SCREEN_SIZE.width / 2, SCREEN_SIZE.height / 2);
  await page.waitForTimeout(STEP_DELAY);

  // 3. Campaigns Tab
  console.log('Navigating to Campaigns...');
  await page.click('a[href*="tab=campaigns"], button:has-text("Campaigns")'); 
  await page.waitForTimeout(STEP_DELAY);
  
  // Highlight a campaign card if present
  const campaignCard = page.locator('.card, [class*="campaign-card"]').first();
  if (await campaignCard.isVisible()) {
      await campaignCard.hover();
      await page.waitForTimeout(2000);
  }

  // 4. Leads Section
  console.log('Navigating to Leads...');
  await page.click('a[href*="tab=leads"], button:has-text("Leads")');
  await page.waitForTimeout(STEP_DELAY);

  // Scroll through leads table
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(2000);
  await page.mouse.wheel(0, -500);

  // 5. Analytics/Reports
  console.log('Navigating to Analytics...');
  await page.click('a[href*="tab=analytics"], button:has-text("Reports")');
  await page.waitForTimeout(STEP_DELAY);

  // 6. Account Intelligence
  console.log('Navigating to Intelligence...');
  await page.click('a[href*="tab=intelligence"], button:has-text("Intelligence")'); 
  await page.waitForTimeout(STEP_DELAY);

  // 7. Settings / Tools
  console.log('Navigating to Settings/Tools...');
  await page.click('a[href*="tab=settings"], button:has-text("Settings")');
  await page.waitForTimeout(STEP_DELAY);

  console.log('Demo recording sequence complete.');
});