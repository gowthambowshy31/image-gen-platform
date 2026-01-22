# Testing Guide

## Overview
This project uses Jest and React Testing Library for testing.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

- `__tests__/api/` - API route tests
- `__tests__/components/` - React component tests

## Writing Tests

### API Route Tests
API route tests mock Prisma, authentication, and external services to test the logic in isolation.

Example:
```typescript
import { GET } from '@/app/api/products/route'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma')
jest.mock('@/lib/auth')

describe('/api/products', () => {
  it('should return products', async () => {
    // Test implementation
  })
})
```

### Component Tests
Component tests use React Testing Library to test UI behavior.

Example:
```typescript
import { render, screen } from '@testing-library/react'
import DashboardPage from '@/app/dashboard/page'

describe('DashboardPage', () => {
  it('should render product list', () => {
    render(<DashboardPage />)
    // Test assertions
  })
})
```

## Current Test Coverage

- ✅ Products API (GET with filtering, authentication)
- ✅ Image Generation API (POST, validation, error handling)
- 🔜 Dashboard component tests (planned)
- 🔜 Product detail page tests (planned)

## Mocked Services

- **Prisma**: All database operations are mocked
- **NextAuth**: Authentication is mocked with test user
- **Next.js Router**: Router methods are mocked
- **Gemini AI**: Image generation is mocked

## CI/CD Integration

Add this to your CI pipeline:

```yaml
- name: Run tests
  run: npm test -- --ci --coverage
```
