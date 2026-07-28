import React, { useEffect, useState } from 'react';
import { formatearCuentaRegresiva } from '@aprobaciones/shared';

/**
 * Cuenta regresiva de la vigencia del OTP (3 minutos).
 *
 * Es solo informativa: quien decide si el código sigue vivo es el backend.
 */
export default function CuentaRegresiva({ expiraEn }: { expiraEn: string }): JSX.Element {
  const restantes = () => Math.max(0, Math.round((new Date(expiraEn).getTime() - Date.now()) / 1000));
  const [segundos, setSegundos] = useState(restantes);

  useEffect(() => {
    setSegundos(restantes());
    const intervalo = setInterval(() => {
      setSegundos((previo) => {
        if (previo <= 1) {
          clearInterval(intervalo);
          return 0;
        }
        return previo - 1;
      });
    }, 1000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiraEn]);

  if (segundos === 0) {
    return <strong className="cuenta-regresiva cuenta-regresiva--urgente">expiró</strong>;
  }

  return (
    <strong className={`cuenta-regresiva${segundos <= 30 ? ' cuenta-regresiva--urgente' : ''}`}>
      {formatearCuentaRegresiva(segundos)}
    </strong>
  );
}
