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
};

export default config;
