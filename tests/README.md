# Automated Tests

## First Load Scroll Position Test

This test suite verifies that the page scrolls to the correct position on first load.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in UI mode (interactive)
npm run test:ui

# Run a specific test file
npx playwright test tests/first-load-scroll.spec.js

# Run tests in headed mode (see browser)
npx playwright test --headed
```

### Test Coverage

The `first-load-scroll.spec.js` test file includes:

1. **Desktop first load test**: Verifies scroll position is at top and book title is visible
2. **Mobile first load test**: Same verification for mobile viewport
3. **TOC flash test**: Ensures there's no visible flash of the table of contents before scrolling to top

### Requirements

- Node.js and npm installed
- Playwright browsers installed (run `npx playwright install` if needed)
- Dev server running on port 3000 (tests will start it automatically)

