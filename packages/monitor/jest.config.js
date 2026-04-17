/** @type {import('jest').Config} */
// Core SDK tests run in plain ts-jest. Tests that touch RN runtime should
// opt into the `@react-native/jest-preset` via a separate project config.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/perf/', '/examples/', '/dashboard/'],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/types/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
