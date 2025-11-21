import { test, expect } from '@playwright/test';

test.describe('Scroll Restoration - No Flash', () => {
  test('should not show wrong content before restoring scroll position', async ({ page }) => {
    // Navigate to the page
    await page.goto('http://localhost:3000');
    
    // Wait for page to load
    await page.waitForSelector('.container', { timeout: 10000 });
    
    // Scroll to a specific position (simulating user scrolling to Act III Scene V)
    // First, find a section that's not at the top
    await page.evaluate(() => {
      const container = document.querySelector('.container');
      if (container) {
        container.scrollTop = 5000; // Scroll down significantly
      }
    });
    
    // Wait a moment for scroll to settle
    await page.waitForTimeout(500);
    
    // Get the scroll position
    const scrollBeforeReload = await page.evaluate(() => {
      const container = document.querySelector('.container');
      return container ? container.scrollTop : 0;
    });
    
    console.log('Scroll position before reload:', scrollBeforeReload);
    
    // Save scroll position to localStorage (simulating what the app does)
    await page.evaluate((scrollPos) => {
      localStorage.setItem('last-scroll', scrollPos.toString());
      localStorage.setItem('last-scroll-container', 'container');
    }, scrollBeforeReload);
    
    // Reload the page
    await page.reload({ waitUntil: 'networkidle' });
    
    // Check if scroll-restored class is present immediately
    const hasScrollRestoredClass = await page.evaluate(() => {
      return document.body.classList.contains('scroll-restored');
    });
    
    console.log('Has scroll-restored class immediately after reload:', hasScrollRestoredClass);
    
    // Wait a short time to see if content flashes
    await page.waitForTimeout(100);
    
    // Check scroll position immediately after reload
    const scrollAfterReload = await page.evaluate(() => {
      const container = document.querySelector('.container');
      return container ? container.scrollTop : 0;
    });
    
    console.log('Scroll position immediately after reload:', scrollAfterReload);
    
    // Check if content is visible (should be hidden if scroll is wrong)
    const isContentVisible = await page.evaluate(() => {
      const next = document.querySelector('#__next');
      if (!next) return false;
      const style = window.getComputedStyle(next);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    
    console.log('Is content visible immediately after reload:', isContentVisible);
    console.log('Should be hidden if scroll is wrong:', scrollAfterReload < 100 && scrollBeforeReload > 100);
    
    // Wait for scroll restoration to complete
    await page.waitForFunction(() => {
      return document.body.classList.contains('scroll-restored');
    }, { timeout: 2000 });
    
    // Check final scroll position
    const finalScroll = await page.evaluate(() => {
      const container = document.querySelector('.container');
      return container ? container.scrollTop : 0;
    });
    
    console.log('Final scroll position:', finalScroll);
    
    // Verify scroll was restored (within 50px tolerance)
    const scrollDiff = Math.abs(finalScroll - scrollBeforeReload);
    expect(scrollDiff).toBeLessThan(50);
    
    // Verify content is visible after restoration
    const isContentVisibleAfter = await page.evaluate(() => {
      const next = document.querySelector('#__next');
      if (!next) return false;
      const style = window.getComputedStyle(next);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    
    expect(isContentVisibleAfter).toBe(true);
  });
  
  test('should not show top of page when restoring to middle', async ({ page }) => {
    // Navigate and scroll to middle
    await page.goto('http://localhost:3000');
    await page.waitForSelector('.container', { timeout: 10000 });
    
    // Scroll to middle
    await page.evaluate(() => {
      const container = document.querySelector('.container');
      if (container) {
        container.scrollTop = 3000;
      }
    });
    
    await page.waitForTimeout(500);
    
    const savedScroll = await page.evaluate(() => {
      const container = document.querySelector('.container');
      return container ? container.scrollTop : 0;
    });
    
    // Save scroll
    await page.evaluate((scrollPos) => {
      localStorage.setItem('last-scroll', scrollPos.toString());
      localStorage.setItem('last-scroll-container', 'container');
    }, savedScroll);
    
    // Reload
    await page.reload({ waitUntil: 'networkidle' });
    
    // Immediately check if we're seeing the top (wrong position)
    const immediateScroll = await page.evaluate(() => {
      const container = document.querySelector('.container');
      return container ? container.scrollTop : 0;
    });
    
    const isContentVisible = await page.evaluate(() => {
      const next = document.querySelector('#__next');
      if (!next) return false;
      const style = window.getComputedStyle(next);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    
    console.log('Immediate scroll after reload:', immediateScroll);
    console.log('Is content visible:', isContentVisible);
    console.log('Saved scroll was:', savedScroll);
    
    // If we're at top (scroll < 100) but should be at savedScroll (> 100),
    // content should be hidden
    if (savedScroll > 100 && immediateScroll < 100) {
      expect(isContentVisible).toBe(false);
    }
    
    // Wait for restoration
    await page.waitForFunction(() => {
      return document.body.classList.contains('scroll-restored');
    }, { timeout: 2000 });
    
    // Verify final position
    const finalScroll = await page.evaluate(() => {
      const container = document.querySelector('.container');
      return container ? container.scrollTop : 0;
    });
    
    const scrollDiff = Math.abs(finalScroll - savedScroll);
    expect(scrollDiff).toBeLessThan(50);
  });
});

