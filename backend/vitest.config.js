import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Todos os arquivos compartilham o mesmo banco de teste → execução sequencial.
    fileParallelism: false,
    setupFiles: ['./tests/setup-env.js'],
    globalSetup: ['./tests/global-setup.js'],
    testTimeout: 20000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
      exclude: ['src/server.js'],
    },
  },
});
