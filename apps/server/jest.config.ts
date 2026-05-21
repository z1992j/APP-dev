import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/unit', '<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Pure-function unit tests only for now; integration tests still live in
  // test/e2e.test.sh and run against a real Postgres + Redis in CI.
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};

export default config;
