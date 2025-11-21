import { test, expect } from '@playwright/test';

test.describe('Speech Text Chat Box', () => {
  async function getPrimarySection(page) {
    const noteContent = page.locator('.noteContent').first();
    await expect(noteContent).toBeVisible({ timeout: 20000 });
    const section = noteContent.locator('xpath=ancestor::div[contains(@class,"section")]').first();
    return { noteContent, section };
  }

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/explain', async (route) => {
      const request = route.request();
      let body;
      try {
        body = request.postDataJSON();
      } catch {
        body = {};
      }
      const mode = body?.mode || '';
      const followup = body?.followup || '';
      let content = 'Stub explanation';
      if (mode === 'brief') {
        content = 'Stub explanation for selection';
      } else if (mode === 'more') {
        content = 'Stub more detail for explanation';
      } else if (followup === 'More detail') {
        content = 'Stub more detail for note';
      } else if (followup) {
        content = `Stub follow-up: ${followup}`;
      } else if (mode === 'followup') {
        content = 'Stub follow-up response';
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content }),
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear?.();
      localStorage.setItem('noteThreshold', '0');
      localStorage.setItem('forcedNotes', JSON.stringify(['Prologue||1', 'I|I|1']));
    });
    await page.reload({ waitUntil: 'networkidle' });
  });

  test('renders note-only state by default', async ({ page }) => {
    const { noteContent, section } = await getPrimarySection(page);
    const text = (await noteContent.textContent() || '').trim();
    expect(text.length).toBeGreaterThan(0);
    await expect(section.locator('aside.explanations textarea')).toHaveCount(0);
    await expect(section.locator('aside.explanations').locator('text=Chat Prompt')).toHaveCount(0);
    await expect(section.locator('aside.explanations').locator('text=Selected Text')).toHaveCount(0);
    await expect(section.locator('aside.explanations').locator('button[aria-label="Delete response"]')).toHaveCount(0);
  });

  test('closes chat box when the note is hidden', async ({ page }) => {
    const { noteContent, section } = await getPrimarySection(page);
    const noteText = (await noteContent.textContent() || '').trim();

    await section.locator('button[aria-label="Hide note"]').click();

    // Chat box becomes invisible for this speech
    await expect(section.locator('.noteContent', { hasText: noteText })).toHaveCount(0, { timeout: 20000 });
    await expect(section.locator('aside.explanations textarea')).toHaveCount(0);
  });

  test('expanding a note supports More responses, follow-ups, ordering, and deletion', async ({ page }) => {
    const { noteContent, section } = await getPrimarySection(page);

    // Expand the note to reveal chat tools
    await noteContent.click();
    const chatInput = section.locator('aside.explanations textarea[placeholder*="Ask a follow"]');
    await expect(chatInput).toBeVisible({ timeout: 20000 });
    await expect(noteContent).toBeVisible();

    // Request "More" detail from the note (second click while expanded)
    await noteContent.click();
    const noteMoreText = 'Stub more detail for note';
    const moreEntry = section.locator('aside.explanations').locator(`text=${noteMoreText}`);
    await expect(moreEntry).toBeVisible({ timeout: 20000 });
    const moreBlock = moreEntry.locator('xpath=ancestor::div[contains(@style,"position: relative")]').first();
    await expect(moreBlock.locator('text=More')).toBeVisible();

    // Submit a follow-up question to populate the chat box
    const question = 'Why is this important?';
    await chatInput.fill(question);
    await chatInput.press('Enter');
    const promptEntry = section.locator('aside.explanations').locator('text=Chat Prompt');
    await expect(promptEntry).toBeVisible({ timeout: 20000 });
    const followupEntry = section.locator('aside.explanations').locator(`text=Stub follow-up: ${question}`);
    await expect(followupEntry).toBeVisible({ timeout: 20000 });

    // Submit a second follow-up to ensure multiple answers stack
    const secondQuestion = 'Give me another angle';
    await chatInput.fill(secondQuestion);
    await chatInput.press('Enter');
    const secondFollowup = section.locator('aside.explanations').locator(`text=Stub follow-up: ${secondQuestion}`);
    await expect(secondFollowup).toBeVisible({ timeout: 20000 });

    // Provider/model attribution should be displayed with at least one response
    await expect(section.locator('aside.explanations').locator('text=/Anthropic/i')).toBeVisible();

    // Ensure ordering: "More" comes before follow-ups
    const order = await moreBlock.evaluate((node, texts) => {
      const container = node.parentElement;
      if (!container) return null;
      const children = Array.from(container.children);
      const indexOf = (needle) => children.findIndex((child) => child.textContent?.includes(needle));
      return {
        more: indexOf(texts.more),
        firstFollowup: indexOf(texts.follow1),
        secondFollowup: indexOf(texts.follow2),
      };
    }, {
      more: noteMoreText,
      follow1: `Stub follow-up: ${question}`,
      follow2: `Stub follow-up: ${secondQuestion}`,
    });
    expect(order?.more).toBeGreaterThanOrEqual(0);
    expect(order?.firstFollowup).toBeGreaterThan(order?.more);
    expect(order?.secondFollowup).toBeGreaterThan(order?.firstFollowup);

    // Delete the most recent follow-up
    const responseDeletes = section.locator('button[aria-label="Delete response"]');
    const deleteCountBefore = await responseDeletes.count();
    await secondFollowup.locator('xpath=ancestor::div[contains(@style,"position: relative")]').first().locator('button[aria-label="Delete response"]').click();
    await expect(section.locator(`text=Stub follow-up: ${secondQuestion}`)).toHaveCount(0);
    await expect(responseDeletes).toHaveCount(deleteCountBefore - 1);

    // Delete the "More" entry to confirm clean-up
    await moreBlock.locator('button[aria-label="Delete response"]').click();
    await expect(section.locator(`text=${noteMoreText}`)).toHaveCount(0);
  });

  test('adds and removes explanations created from selected text', async ({ page }) => {
    test.skip(/Mobile/.test(test.info().project.name), 'Touch projects use different text-selection gestures');

    const { noteContent, section } = await getPrimarySection(page);

    const speech = section.locator('.playText pre');
    await speech.scrollIntoViewIfNeeded();
    const box = await speech.boundingBox();
    expect(box).not.toBeNull();

    // Ensure note mode chat is available
    await noteContent.click();
    await expect(section.locator('aside.explanations textarea[placeholder*="Ask a follow"]')).toBeVisible({ timeout: 20000 });

    // Select a span of speech text to trigger an explanation
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + Math.min(260, box.width - 10), box.y + 20, { steps: 20 });
    await page.mouse.up();

    const explanationTitle = section.locator('aside.explanations').locator('text=Selected Text');
    await expect(explanationTitle).toBeVisible({ timeout: 20000 });

    const explanationBody = section.locator('aside.explanations').locator('text=Stub explanation for selection');
    await expect(explanationBody).toBeVisible({ timeout: 20000 });
    const explanationCard = explanationBody.locator('xpath=ancestor::div[contains(@style,"position: relative")]').first();
    await expect(noteContent).toBeVisible();

    // Request "More" detail on the explanation
    await explanationBody.click();
    const explanationMoreText = 'Stub more detail for explanation';
    const explanationMore = section.locator('aside.explanations').locator(`text=${explanationMoreText}`);
    await expect(explanationMore).toBeVisible({ timeout: 20000 });
    const explanationMoreBlock = explanationMore.locator('xpath=ancestor::div[contains(@style,"marginBottom")]').first();
    await expect(explanationMoreBlock.locator('text=More')).toBeVisible();
    const moreOrder = await explanationCard.evaluate((node, texts) => {
      const children = Array.from(node.children);
      const explanationIndex = children.findIndex((child) => child.textContent?.includes(texts.explanation));
      const moreIndex = children.findIndex((child) => child.textContent?.includes(texts.more));
      return { explanationIndex, moreIndex };
    }, {
      explanation: 'Stub explanation for selection',
      more: explanationMoreText,
    });
    expect(moreOrder.explanationIndex).toBeGreaterThanOrEqual(0);
    expect(moreOrder.moreIndex).toBeGreaterThan(moreOrder.explanationIndex);

    // Clear the DOM selection to prevent auto-regeneration after deletion
    await page.evaluate(() => {
      try {
        const sel = window.getSelection?.();
        sel?.removeAllRanges();
      } catch {}
    });

    // Delete the generated explanation
    const deleteButtons = section.locator('button[aria-label="Delete explanation"]');
    const beforeCount = await deleteButtons.count();
    await explanationCard.locator('button[aria-label="Delete explanation"]').first().click();
    await expect(deleteButtons).toHaveCount(Math.max(0, beforeCount - 1), { timeout: 20000 });
  });
});
