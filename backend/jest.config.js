/**
 * Configuración de pruebas.
 *
 * El umbral global está en el 60% que pide el enunciado; el dominio y la capa
 * de aplicación —donde vive el riesgo real— se exigen al 90%.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/index.ts',
  ],
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { statements: 60, branches: 60, functions: 60, lines: 60 },
    './src/domain/': { statements: 90, branches: 85, functions: 90, lines: 90 },
    './src/application/': { statements: 90, branches: 80, functions: 90, lines: 90 },
  },
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
};
