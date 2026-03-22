# Phase 5: Comprehensive Testing Guide

## 🎯 Testing Strategy Overview

### Test Coverage Goals
- **Unit Tests**: 80% backend coverage
- **Integration Tests**: 100% API endpoint coverage
- **Component Tests**: 70% frontend component coverage
- **E2E Tests**: 100% critical user flows
- **Performance Tests**: Load testing at 10K concurrent users

### Test Pyramid

```
        /\
       /E2E\
      /----\
     /  API \
    /-------\
   / Unit &  \
  / Component \
 /           \
```

---

## 📋 Test Categories & Counts

### 1. Unit Tests (120+ tests)

**Backend Services (40+ tests)**
- `bulk-email-service.ts`: 12 tests
  - [ ] Email batch processing
  - [ ] Template personalization
  - [ ] SMTP pooling
  - [ ] Rate limiting
  - [ ] Error handling
  - [ ] Queue management

- `email-renderer.ts`: 10 tests
  - [ ] HTML rendering
  - [ ] Token replacement
  - [ ] Tracking pixel injection
  - [ ] Link tracking
  - [ ] CSS inlining
  - [ ] Plaintext conversion

- `campaign-service.ts`: 8 tests
  - [ ] Campaign creation
  - [ ] Draft management
  - [ ] Schedule calculation
  - [ ] Status transitions

- `authentication-service.ts`: 10 tests
  - [ ] Token generation
  - [ ] Token validation
  - [ ] Session management
  - [ ] Permission checks

**Frontend Utilities (50+ tests)**
- `email-validator.ts`: 8 tests
  - [ ] Valid email detection
  - [ ] Invalid format rejection
  - [ ] Disposable email detection

- `contact-validator.ts`: 12 tests
  - [ ] Field validation
  - [ ] Required field checks
  - [ ] Data type validation

- `template-processor.ts`: 15 tests
  - [ ] Token parsing
  - [ ] Conditional block parsing
  - [ ] Dynamic block rendering

- `api-client.ts`: 15 tests
  - [ ] Request formatting
  - [ ] Error handling
  - [ ] Retry logic
  - [ ] Response parsing

### 2. Integration Tests (35+ tests)

**API Endpoints (25+ tests)** - Already created
- `GET /api/sender-profiles` (3 tests)
- `GET /api/email-templates` (4 tests)
- `POST /api/campaigns/send-test` (5 tests)
- `POST /api/campaigns` (6 tests)
- `POST /api/campaigns/:id/send` (4 tests)
- Email rendering tests (5 tests)
- Performance tests (2 tests)

**Database Integration (10+ tests)**
- [ ] Contact insertion/update
- [ ] Campaign queries
- [ ] Event tracking
- [ ] Metric calculations

### 3. Component Tests (45+ tests)

**Campaign Builder Components (20+ tests)** - Partially created
- `CampaignWizard.test.tsx` (8 tests)
- `Step1CampaignDetails.test.tsx` (6 tests)
- `Step2EmailContent.test.tsx` (12 tests) ✅
- `Step3Audience.test.tsx` (8 tests)
- `Step4Schedule.test.tsx` (6 tests)
- `Step5Review.test.tsx` (6 tests)

**Email Builder Components (15+ tests)**
- `EmailBuilder.test.tsx` (8 tests)
- `TemplateSelectorModal.test.tsx` (6 tests)
- `EmailPreview.test.tsx` (8 tests)
- `SendTestEmailModal.test.tsx` (6 tests)

**Utility Components (10+ tests)**
- `ContactList.test.tsx` (6 tests)
- `FilterBuilder.test.tsx` (8 tests)
- `ScheduleSelector.test.tsx` (6 tests)

### 4. E2E Tests (35+ tests)

**Campaign Flows (15+ tests)**
- [ ] Complete campaign creation flow
- [ ] A/B test setup flow
- [ ] Conditional personalization flow
- [ ] Template editing flow
- [ ] Campaign scheduling flow
- [ ] Draft save/resume flow

**User Workflows (10+ tests)**
- [ ] New user campaign creation
- [ ] Template selection flow
- [ ] Audience segmentation flow
- [ ] Campaign performance review

**Error Scenarios (10+ tests)**
- [ ] Invalid email handling
- [ ] Contact validation errors
- [ ] Template rendering errors
- [ ] Network error recovery

### 5. Performance Tests (15+ tests)

**Load Testing**
- [ ] API endpoints at 1K req/s
- [ ] Campaign send at 10K emails/min
- [ ] Database queries = 80% backend, 70% frontend
- [ ] No console errors or warnings
- [ ] No TypeScript errors
- [ ] ESLint passing

**API Tests:**
- [ ] All 5 endpoints tested (25+ tests)
- [ ] Response times  1,000 emails/min

**Database:**
- [ ] Migrations completed
- [ ] Indexes created
- [ ] Backups working
- [ ] Query performance good

**Security:**
- [ ] Authentication working
- [ ] Authorization enforced
- [ ] Input validation complete
- [ ] SQL injection prevented
- [ ] XSS protection active

---

## 🐛 Debugging Tests

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Cannot find module" | Import path wrong | Check file name and path |
| "Timeout" | Async operation too slow | Increase timeout or fix slow operation |
| "undefined is not a function" | Mock not set up | Add mock in test setup |
| "Element not found" | DOM not rendered | Use waitFor() for async render |
| "API call failed" | Service mock missing | Add msw mock or stub |

### Debug Commands

```bash
# Run with debug output
DEBUG=* npm run test

# Run single test with detailed output
npm run test -- --reporter=verbose campaign-creation.test.ts

# Run with debugger
node --inspect-brk ./node_modules/.bin/vitest

# Check coverage gaps
npm run test:coverage -- --reporter=html
# Open coverage/index.html
```

---

## 📊 Test Reporting

### Coverage Report

```bash
# Generate coverage report
npm run test:coverage

# Output summary
-----------|---------|---------|---------|---------|
File       | % Stmts | % Branch| % Funcs | % Lines |
-----------|---------|---------|---------|---------|
Backend    |    84%  |    79%  |    88%  |    84%  |
Frontend   |    76%  |    72%  |    81%  |    76%  |
-----------|---------|---------|---------|---------|
Total      |    80%  |    75%  |    84%  |    80%  |
-----------|---------|---------|---------|---------|
```

### Test Metrics

**Tracking:**
- [ ] Total tests: 250+
- [ ] Passing: 100%
- [ ] Flaky tests: 0%
- [ ] Average runtime: -
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint
      
      - name: Run type check
        run: npm run type-check
      
      - name: Run tests
        run: npm run test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
      
      - name: Run E2E tests
        run: npm run test:e2e
      
      - name: Run performance tests
        run: npm run test:perf
```

---

## 📈 Performance Benchmarks

### Baseline Metrics

**Before Optimization:**
```
API Response Time (p95): 450ms
Email Rendering Time: 185ms
Campaign Send Rate: 850 emails/min
Database Query Time: 125ms
Frontend Bundle: 780KB gzipped
```

**Target Metrics:**
```
API Response Time (p95):  r.status === 200,
    'response time  r.timings.duration  {
  const { container } = render();
  expect(container).toMatchSnapshot();
});
```

### Visual Regression Testing

```typescript
import { toMatchImageSnapshot } from 'jest-image-snapshot';

it('should render email correctly', async () => {
  const { container } = render();
  await waitFor(() => container.querySelector('.email-preview'));
  expect(container).toMatchImageSnapshot();
});
```

### Accessibility Testing

```typescript
import { axe, toHaveNoViolations } from 'jest-axe';

it('should have no accessibility violations', async () => {
  const { container } = render();
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

---

## 📚 Test Data

### Mock Data Factory

```typescript
// test/factories.ts
export function createContact(overrides = {}) {
  return {
    id: 'cont_' + Math.random().toString(36).substr(2, 9),
    email: 'user@example.com',
    firstName: 'John',
    lastName: 'Doe',
    ...overrides
  };
}

export function createCampaign(overrides = {}) {
  return {
    id: 'camp_' + Math.random().toString(36).substr(2, 9),
    name: 'Test Campaign',
    status: 'draft',
    ...overrides
  };
}
```

---

## 🎓 Best Practices

### ✅ DO
- Write tests as you write code
- Test behavior, not implementation
- Use descriptive test names
- Test error scenarios
- Mock external services
- Keep tests independent
- Use factories for test data
- Run tests frequently

### ❌ DON'T
- Test implementation details
- Write tests after code is done
- Skip error cases
- Depend on test order
- Use hardcoded test data
- Mock everything
- Write overly complex tests
- Ignore flaky tests

---

*Phase 5: Comprehensive Testing Guide*
*Status: Ready for Implementation*