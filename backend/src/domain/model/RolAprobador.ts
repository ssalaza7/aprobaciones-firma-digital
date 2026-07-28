import { ErrorValidacion } from '../exception/errores';

/**
 * Catálogo cerrado de roles que pueden aprobar una compra.
 *
 * El enunciado pide "tres roles distintos": un catálogo cerrado hace que la
 * regla se pueda verificar en el dominio en lugar de confiar en texto libre.
 */
export const ROLES_APROBADOR = [
  'JEFE_AREA',
  'FINANZAS',
  'COMPRAS',
  'LEGAL',
  'GERENCIA',
] as const;

export type RolAprobador = (typeof ROLES_APROBADOR)[number];

const ETIQUETAS: Record<RolAprobador, string> = {
  JEFE_AREA: 'Jefe de Área',
  FINANZAS: 'Finanzas',
  COMPRAS: 'Compras',
  LEGAL: 'Legal',
  GERENCIA: 'Gerencia',
};

export function esRolAprobador(valor: unknown): valor is RolAprobador {
  return typeof valor === 'string' && (ROLES_APROBADOR as readonly string[]).includes(valor);
}

export function rolDe(valor: unknown): RolAprobador {
  if (!esRolAprobador(valor)) {
    throw new ErrorValidacion(
      `Rol no reconocido: "${String(valor)}". Válidos: ${ROLES_APROBADOR.join(', ')}`,
    );
  }
  return valor;
}

export function etiquetaRol(rol: RolAprobador): string {
  return ETIQUETAS[rol];
}
