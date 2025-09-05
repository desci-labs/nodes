import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  test: {
    globals: false,
    environment: 'node',
    // Allows reuse of a single server/app instance across all tests
    isolate: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    setupFiles: ['dotenv/config', './test/setup.ts'],
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    //fileParallelism: false,
    // Only show console output for failed tests
    silent: 'passed-only',
    pool: 'forks',
    poolOptions: {
      forks: {
        // Run tests sequentially. Required, as we throw side effects on the database which cause failures when running in parallel.
        singleFork: true,
      },
    },
    reporters: process.env.GITHUB_ACTIONS ? ['verbose', 'github-actions'] : ['verbose'],
  },
  resolve: {
    extensions: ['.js', '.ts', '.json'],
  },
}));
