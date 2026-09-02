import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  rootDir: '../libraries/nestjs-libraries/src/neptive',
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
          isolatedModules: true,
          strict: false,
          skipLibCheck: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@gitroom/nestjs-libraries/neptive/(.*)$': '<rootDir>/$1',
    '^@gitroom/nestjs-libraries/(.*)$': '<rootDir>/../$1',
    '^@gitroom/nestjs-libraries/database/(.*)$': '<rootDir>/../database/$1',
    '^@gitroom/helpers/(.*)$': '<rootDir>/../../../helpers/src/$1',
  },
};

export default config;
