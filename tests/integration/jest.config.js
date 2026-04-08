/**
 * Jest Configuration for Integration Tests
 */

module.exports = {
  // Test Environment
  testEnvironment: 'node',
  
  // Test File Patterns
  testMatch: [
    '**/tests/integration/**/*.test.ts',
  ],
  
  // TypeScript Support
  preset: 'ts-jest',
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  
  // Module Resolution
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Path Mappings (muss mit tsconfig.json übereinstimmen)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@backend/(.*)$': '<rootDir>/backend/src/$1',
    '^@bot/(.*)$': '<rootDir>/bot/discord/src/$1',
  },
  
  // Setup Files
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.ts'],
  
  // Coverage
  collectCoverageFrom: [
    'backend/src/**/*.ts',
    'bot/discord/src/**/*.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Test Timeouts
  testTimeout: 30000, // 30 Sekunden pro Test
  
  // Verbose Output
  verbose: true,
  
  // Fail on Console Errors
  errorOnDeprecated: true,
  
  // Globals
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/backend/tsconfig.json',
    },
  },
  
  // Reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/reports',
        outputName: 'integration-tests.xml',
      },
    ],
  ],
};
