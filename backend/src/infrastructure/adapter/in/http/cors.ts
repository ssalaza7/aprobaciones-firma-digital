/**
 * Cabeceras CORS compartidas por el handler de Lambda y el servidor local.
 *
 * El frontend son microfrontends servidos desde otro origen, así que la API
 * tiene que declararlo explícitamente en ambos entornos.
 */
export function cabecerasCors(
  origenSolicitado: string | undefined,
  origenesPermitidos: string[],
): Record<string, string> {
  const permiteTodo = origenesPermitidos.includes('*');
  const origen =
    permiteTodo || !origenSolicitado
      ? '*'
      : origenesPermitidos.includes(origenSolicitado)
        ? origenSolicitado
        : origenesPermitidos[0] ?? '*';

  return {
    'Access-Control-Allow-Origin': origen,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}
