import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@puzzle-roll/shared(.*)$': '<rootDir>/src$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/__tests__/**', '!src/**/index.ts'],
};

export default config;
