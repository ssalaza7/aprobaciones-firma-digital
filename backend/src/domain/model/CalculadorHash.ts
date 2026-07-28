/**
 * Servicio de dominio: primitiva de hash usada para encadenar las firmas.
 *
 * El dominio decide *qué* se firma y *cómo* se enlaza cada firma con la
 * anterior; el algoritmo concreto (SHA-256) lo aporta la infraestructura. Así
 * el modelo sigue sin importar `node:crypto` y la cadena se puede probar con
 * un hash trivial.
 */
export interface CalculadorHash {
  (contenido: string): string;
}
