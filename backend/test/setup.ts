/**
 * Silencia el log informativo del notificador simulado durante las pruebas.
 * `console.error` se deja pasar: si algo falla de verdad, queremos verlo.
 */
beforeAll(() => {
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});
