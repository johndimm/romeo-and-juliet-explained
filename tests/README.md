# Automated Tests

This test suite verifies all major features of the Romeo and Juliet Explained app before releasing a new version.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in UI mode (interactive)
npm run test:ui

# Run a specific test file
npx playwright test tests/comprehensive-features.spec.js
npx playwright test tests/first-load-scroll.spec.js
npx playwright test tests/chat-box.spec.js

# Run tests in headed mode (see browser)
npx playwright test --headed

# Run tests for specific browser
npx playwright test --project=chromium
npx playwright test --project="Mobile Chrome"
```

## Test Coverage

### Comprehensive Features Test (`comprehensive-features.spec.js`)

This is the main test suite that should be run before every release. It covers:

1. **Welcome Panel**
   - Shows on first visit
   - Can be dismissed
   - Doesn't show after being dismissed

2. **Table of Contents Navigation**
   - Desktop TOC links navigate to sections
   - Mobile TOC popup opens and closes
   - TOC top link scrolls to top

3. **Search Functionality**
   - Performs search and highlights results
   - Navigates between results with next/prev buttons
   - Clears search results
   - Shows "No results" for empty searches

4. **Settings Panel**
   - Opens and closes correctly
   - Adjusts font size
   - Adjusts note threshold

5. **About and User Guide Panels**
   - Opens About panel
   - Opens User Guide panel

6. **Print Panel**
   - Opens print panel

7. **Note Interactions**
   - Shows and hides notes
   - Expands notes to show chat interface

8. **Text Selection and Explanations**
   - Creates explanations from text selection (desktop)

9. **Mobile-Specific Features**
   - Shows mobile menu
   - Has correct header height

10. **Scroll Behavior**
    - Restores scroll position on page reload

11. **Accessibility**
    - Has proper ARIA labels on interactive elements

### First Load Scroll Position Test (`first-load-scroll.spec.js`)

1. **Desktop first load test**: Verifies scroll position is at top and book title is visible
2. **Mobile first load test**: Same verification for mobile viewport
3. **TOC flash test**: Ensures there's no visible flash of the table of contents before scrolling to top

### Chat Box Test (`chat-box.spec.js`)

Tests the chat/explanation interface:
- Note rendering and expansion
- Follow-up questions
- Text selection explanations
- Deletion of explanations

### Scroll Restoration Test (`scroll-restore-no-flash.spec.js`)

Tests that scroll position is properly restored without showing wrong content.

## Pre-Release Checklist

Before releasing a new version, run:

```bash
# Run all tests
npm test

# Verify all tests pass
# If any fail, fix the issues before releasing
```

## Requirements

- Node.js and npm installed
- Playwright browsers installed (run `npx playwright install` if needed)
- Dev server running on port 3000 (tests will start it automatically)

## Troubleshooting

If tests fail:
1. Make sure the dev server is running or can be started automatically
2. Check that all API endpoints are accessible
3. Verify browser dependencies are installed: `npx playwright install`
4. Run tests in headed mode to see what's happening: `npx playwright test --headed`

