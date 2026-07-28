/**
 * Pruebas de los microfrontends con jsdom + Testing Library.
 *
 * Un único proyecto para los tres paquetes: comparten configuración y el
 * umbral de cobertura del 60% que pide el enunciado se mide sobre el conjunto.
 */
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  roots: ['<rootDir>/packages', '<rootDir>/test'],
  testMatch: ['**/*.test.tsx', '**/*.test.ts'],
  moduleNameMapper: {
    '\\.css$': '<rootDir>/test/estiloVacio.js',
    '^@aprobaciones/shared$': '<rootDir>/packages/shared/src/index.ts',
    '^@aprobaciones/shared/(.*)$': '<rootDir>/packages/shared/$1',
    // Los remotos federados no existen fuera de webpack: en pruebas se sustituyen.
    '^solicitante/(.*)$': '<rootDir>/test/dobles/remotoSolicitante.tsx',
    '^aprobador/(.*)$': '<rootDir>/test/dobles/remotoAprobador.tsx',
  },
  collectCoverageFrom: [
    'packages/*/src/**/*.{ts,tsx}',
    '!packages/*/src/index.ts',
    '!packages/*/src/bootstrap.tsx',
  ],
  coverageReporters: ['text-summary', 'lcov'],
  coverageThreshold: {
    global: { statements: 60, branches: 60, functions: 60, lines: 60 },
  },
  clearMocks: true,
};
