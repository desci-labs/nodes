# CLI Tests

This directory contains tests for the DeSci Nodes CLI.

## Test Structure

```
test/
├── README.md          # This file
├── config.spec.ts     # Unit tests for configuration module
└── cli.spec.ts        # Integration tests for CLI operations
```

## Running Tests

### Quick Start

```bash
# Run all tests (integration tests will be skipped without API key)
npm run test

# Run only unit tests (no server required)
npm run test:unit

# Run only integration tests (requires API key)
npm run test:integration
```

### Unit Tests

Unit tests don't require any external services and test isolated functionality like configuration management.

```bash
npm run test:unit
```

**What's tested:**
- Environment configuration (local, dev, staging, prod)
- API key storage and retrieval
- Private key storage and deletion
- Config clearing

### Integration Tests

Integration tests require a running DeSci Nodes server and a valid API key.

#### Using Dev Environment (Recommended)

The easiest way to run integration tests is against the dev environment:

```bash
# Set your API key (get from https://nodes-dev.desci.com → Profile → API Keys)
export NODES_TEST_API_KEY="your-dev-api-key-here"
export NODES_TEST_ENV="dev"

# Run integration tests
npm run test:integration
```

#### Using Local Environment

For local testing, you need to start the full DeSci Nodes stack:

```bash
# From the nodes repository root
./dockerDev.sh

# Then run tests with local configuration
export NODES_TEST_API_KEY="agu+zEH30gwm77C+Em4scbzdiYOnv8uSvA0qr2XAj5k="
export NODES_TEST_ENV="local"
npm run test:integration
```

#### Using Production (Not Recommended)

```bash
export NODES_TEST_API_KEY="your-prod-api-key"
export NODES_TEST_ENV="prod"
npm run test:integration
```

> ⚠️ **Warning**: Running tests against production will create and delete real nodes.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODES_TEST_API_KEY` | API key for authentication | (none - tests skip if not set) |
| `NODES_TEST_ENV` | Target environment | `local` |

### Environment Options

| Value | API URL | Notes |
|-------|---------|-------|
| `local` | `http://localhost:5420` | Requires local Docker setup |
| `dev` | `https://nodes-api-dev.desci.com` | Development environment |
| `staging` | `https://nodes-api-staging.desci.com` | Staging environment |
| `prod` | `https://nodes-api.desci.com` | Production (use with caution) |

## Writing New Tests

### Unit Tests

Add new unit tests to `config.spec.ts` or create a new `.spec.ts` file:

```typescript
import { describe, test, expect } from "vitest";

describe("My Feature", () => {
  test("should do something", () => {
    expect(true).toBe(true);
  });
});
```

### Integration Tests

Integration tests should use `test.skipIf(!TEST_API_KEY)` to skip when no API key is available:

```typescript
import { describe, test, expect } from "vitest";

const TEST_API_KEY = process.env.NODES_TEST_API_KEY;

describe("My Integration Tests", () => {
  test.skipIf(!TEST_API_KEY)("should interact with server", async () => {
    // Test code here
  });
});
```

## CI/CD Integration

For CI pipelines, set the environment variables as secrets:

```yaml
# GitHub Actions example
env:
  NODES_TEST_API_KEY: ${{ secrets.NODES_TEST_API_KEY }}
  NODES_TEST_ENV: dev

steps:
  - name: Run tests
    run: npm run test
```

## Troubleshooting

### Tests Skip with "NODES_TEST_API_KEY not set"

Set the API key environment variable:
```bash
export NODES_TEST_API_KEY="your-api-key"
```

### "Failed to connect to desci-server"

For local testing:
1. Ensure Docker is running
2. Run `./dockerDev.sh` from the nodes root directory
3. Wait for all services to start (can take a few minutes)

For dev/prod testing:
1. Check your internet connection
2. Verify the API key is valid

### "403" or "401" Errors

Your API key may be invalid or expired. Generate a new one from the web interface.

