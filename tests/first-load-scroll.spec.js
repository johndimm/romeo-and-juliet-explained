import { test, expect } from '@playwright/test';

test.describe('First Load Scroll Position', () => {
  test('should scroll to top on first load (desktop)', async ({ page }) => {
    // Clear localStorage to simulate first load
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    
    // Reload the page to trigger first-load behavior
    await page.reload({ waitUntil: 'networkidle' });
    
    // Wait for the page to fully load and scroll position to be set
    await page.waitForTimeout(1000);
    
    // Get scroll position from all possible scrollers
    const scrollPositions = await page.evaluate(() => {
      const positions = {
        window: window.scrollY,
        body: document.body.scrollTop,
        container: document.querySelector('.container')?.scrollTop || 0,
        page: document.querySelector('.page')?.scrollTop || 0,
      };
      return positions;
    });
    
    // Check that at least one scroller is at position 0 (the active one)
    const hasZeroScroll = Object.values(scrollPositions).some(pos => Math.abs(pos) < 10);
    expect(hasZeroScroll, `Expected scroll position to be near 0, got: ${JSON.stringify(scrollPositions)}`).toBe(true);
    
    // Verify the book title is visible at the top
    const bookTitle = page.locator('text=THE TRAGEDY OF ROMEO AND JULIET').first();
    await expect(bookTitle).toBeVisible();
    
    // Check that the title is near the top of the viewport
    const titleBox = await bookTitle.boundingBox();
    expect(titleBox, 'Book title should be visible').not.toBeNull();
    expect(titleBox.y, `Book title should be near top (y: ${titleBox.y})`).toBeLessThan(500);
  });

  test('should scroll to top on first load (mobile)', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Clear localStorage to simulate first load
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    
    // Reload the page to trigger first-load behavior
    await page.reload({ waitUntil: 'networkidle' });
    
    // Wait for the page to fully load and scroll position to be set
    // Mobile might need a bit more time
    await page.waitForTimeout(1500);
    
    // Get scroll position from all possible scrollers
    const scrollPositions = await page.evaluate(() => {
      const positions = {
        window: window.scrollY,
        body: document.body.scrollTop,
        container: document.querySelector('.container')?.scrollTop || 0,
        page: document.querySelector('.page')?.scrollTop || 0,
      };
      return positions;
    });
    
    // On mobile, body or page is usually the scroller
    const mobileScrollPosition = scrollPositions.body || scrollPositions.page || scrollPositions.window;
    expect(Math.abs(mobileScrollPosition), `Expected mobile scroll position to be near 0, got: ${JSON.stringify(scrollPositions)}`).toBeLessThan(10);
    
    // Verify the book title is visible at the top
    const bookTitle = page.locator('text=THE TRAGEDY OF ROMEO AND JULIET').first();
    await expect(bookTitle).toBeVisible();
    
    // Check that the title is near the top of the viewport
    const titleBox = await bookTitle.boundingBox();
    expect(titleBox, 'Book title should be visible').not.toBeNull();
    // On mobile, account for header height
    expect(titleBox.y, `Book title should be near top (y: ${titleBox.y})`).toBeLessThan(300);
  });

  test('should not show TOC flash on first load', async ({ page }) => {
    // Clear localStorage to simulate first load
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    
    // Take a screenshot immediately after reload to check for TOC flash
    await page.reload({ waitUntil: 'domcontentloaded' });
    
    // Wait a very short time to catch any flash
    await page.waitForTimeout(100);
    
    // Check scroll position immediately
    const earlyScrollPosition = await page.evaluate(() => {
      return {
        window: window.scrollY,
        body: document.body.scrollTop,
        container: document.querySelector('.container')?.scrollTop || 0,
        page: document.querySelector('.page')?.scrollTop || 0,
      };
    });
    
    // At least one should be near 0 even early on
    const hasZeroScrollEarly = Object.values(earlyScrollPosition).some(pos => Math.abs(pos) < 50);
    expect(hasZeroScrollEarly, `Expected scroll to be near 0 early, got: ${JSON.stringify(earlyScrollPosition)}`).toBe(true);
    
    // Wait for full load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    
    // Check scroll position again after full load
    const finalScrollPosition = await page.evaluate(() => {
      return {
        window: window.scrollY,
        body: document.body.scrollTop,
        container: document.querySelector('.container')?.scrollTop || 0,
        page: document.querySelector('.page')?.scrollTop || 0,
      };
    });
    
    // Should still be at top
    const hasZeroScrollFinal = Object.values(finalScrollPosition).some(pos => Math.abs(pos) < 10);
    expect(hasZeroScrollFinal, `Expected scroll to remain at 0, got: ${JSON.stringify(finalScrollPosition)}`).toBe(true);
  });
});

