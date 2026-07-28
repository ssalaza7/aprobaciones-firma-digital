/** Utilidades de presentación compartidas por los microfrontends. */

export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(fecha);
}

export function formatearMonto(valor: number, moneda = 'COP'): string {
  return `$ ${new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor)} ${moneda}`;
}

/** mm:ss para la cuenta regresiva del OTP. */
export function formatearCuentaRegresiva(segundos: number): string {
  const seguros = Math.max(0, Math.floor(segundos));
  const minutos = Math.floor(seguros / 60);
  return `${minutos}:${String(seguros % 60).padStart(2, '0')}`;
}
