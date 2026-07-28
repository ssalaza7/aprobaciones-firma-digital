import React, { useEffect, useMemo, useState } from 'react';
import {
  api,
  Campo,
  ErrorDeApi,
  MensajeError,
  NuevaSolicitud,
  Rol,
} from '@aprobaciones/shared';

export interface PropiedadesFormulario {
  /** El host navega al detalle cuando la solicitud queda creada. */
  onCreada?: (solicitudId: string) => void;
}

interface AprobadorFormulario {
  nombre: string;
  correo: string;
  rol: string;
}

const APROBADORES_REQUERIDOS = 3;

const aprobadorVacio = (): AprobadorFormulario => ({ nombre: '', correo: '', rol: '' });

/**
 * Vista de creación de solicitudes.
 *
 * Valida en cliente lo mismo que el dominio valida en servidor, para dar
 * respuesta inmediata; la fuente de verdad sigue siendo el backend, y sus
 * errores se muestran tal cual.
 */
export default function FormularioSolicitud({ onCreada }: PropiedadesFormulario): JSX.Element {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [nombreSolicitante, setNombreSolicitante] = useState('');
  const [correoSolicitante, setCorreoSolicitante] = useState('');
  const [aprobadores, setAprobadores] = useState<AprobadorFormulario[]>(
    Array.from({ length: APROBADORES_REQUERIDOS }, aprobadorVacio),
  );

  const [roles, setRoles] = useState<Rol[]>([]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vigente = true;
    api
      .roles()
      .then((catalogo) => {
        if (vigente) setRoles(catalogo);
      })
      .catch(() => {
        if (vigente) setErrorApi('No fue posible cargar el catálogo de roles.');
      });
    return () => {
      vigente = false;
    };
  }, []);

  const rolesUsados = useMemo(
    () => aprobadores.map((aprobador) => aprobador.rol).filter(Boolean),
    [aprobadores],
  );

  const actualizarAprobador = (indice: number, campo: keyof AprobadorFormulario, valor: string) => {
    setAprobadores((previos) =>
      previos.map((aprobador, i) => (i === indice ? { ...aprobador, [campo]: valor } : aprobador)),
    );
  };

  const validar = (): Record<string, string> => {
    const nuevos: Record<string, string> = {};
    if (titulo.trim().length < 5) nuevos.titulo = 'El título debe tener al menos 5 caracteres';
    if (descripcion.trim().length < 10)
      nuevos.descripcion = 'La descripción debe tener al menos 10 caracteres';

    const valorMonto = Number(monto);
    if (!monto.trim() || Number.isNaN(valorMonto) || valorMonto <= 0)
      nuevos.monto = 'El monto debe ser un número mayor que cero';

    if (nombreSolicitante.trim().length < 3) nuevos.nombreSolicitante = 'Indique su nombre completo';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correoSolicitante.trim()))
      nuevos.correoSolicitante = 'Indique un correo válido';

    aprobadores.forEach((aprobador, indice) => {
      if (aprobador.nombre.trim().length < 3)
        nuevos[`aprobador-${indice}-nombre`] = 'Nombre incompleto';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(aprobador.correo.trim()))
        nuevos[`aprobador-${indice}-correo`] = 'Correo inválido';
      if (!aprobador.rol) nuevos[`aprobador-${indice}-rol`] = 'Seleccione un rol';
    });

    if (new Set(rolesUsados).size !== rolesUsados.length)
      nuevos.roles = 'Los tres aprobadores deben tener roles distintos';

    const correos = aprobadores.map((a) => a.correo.trim().toLowerCase()).filter(Boolean);
    if (new Set(correos).size !== correos.length)
      nuevos.correos = 'Los tres aprobadores deben tener correos distintos';

    return nuevos;
  };

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setErrorApi(null);

    const nuevosErrores = validar();
    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) return;

    const solicitud: NuevaSolicitud = {
      titulo: titulo.trim(),
      descripcion: descripcion.trim(),
      monto: Number(monto),
      moneda: 'COP',
      solicitante: { nombre: nombreSolicitante.trim(), correo: correoSolicitante.trim() },
      aprobadores: aprobadores.map((aprobador) => ({
        nombre: aprobador.nombre.trim(),
        correo: aprobador.correo.trim(),
        rol: aprobador.rol,
      })),
    };

    setEnviando(true);
    try {
      const respuesta = await api.crearSolicitud(solicitud);
      onCreada?.(respuesta.solicitud.id);
    } catch (error) {
      setErrorApi((error as ErrorDeApi).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} noValidate>
      <MensajeError error={errorApi} />

      <div className="tarjeta">
        <h2>Datos de la compra</h2>

        <Campo etiqueta="Título" error={errores.titulo}>
          <input
            name="titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Compra de 15 portátiles"
            maxLength={140}
          />
        </Campo>

        <Campo etiqueta="Descripción" error={errores.descripcion}>
          <textarea
            name="descripcion"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Detalle del bien o servicio, justificación y proveedor"
            maxLength={2000}
          />
        </Campo>

        <div className="rejilla">
          <Campo etiqueta="Monto (COP)" error={errores.monto}>
            <input
              name="monto"
              type="number"
              min="0"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="45000000"
            />
          </Campo>
        </div>
      </div>

      <div className="tarjeta">
        <h2>Solicitante</h2>
        <div className="rejilla">
          <Campo etiqueta="Nombre" error={errores.nombreSolicitante}>
            <input
              name="solicitante-nombre"
              value={nombreSolicitante}
              onChange={(e) => setNombreSolicitante(e.target.value)}
              placeholder="Ana Restrepo"
            />
          </Campo>
          <Campo etiqueta="Correo" error={errores.correoSolicitante}>
            <input
              name="solicitante-correo"
              type="email"
              value={correoSolicitante}
              onChange={(e) => setCorreoSolicitante(e.target.value)}
              placeholder="ana.restrepo@empresa.com"
            />
          </Campo>
        </div>
      </div>

      <div className="tarjeta">
        <h2>Aprobadores (3 roles distintos)</h2>
        {errores.roles && (
          <div className="alerta alerta--error" role="alert">
            {errores.roles}
          </div>
        )}
        {errores.correos && (
          <div className="alerta alerta--error" role="alert">
            {errores.correos}
          </div>
        )}

        {aprobadores.map((aprobador, indice) => (
          <fieldset key={indice} className="rejilla" style={{ border: 0, padding: 0, margin: 0 }}>
            <Campo etiqueta={`Rol ${indice + 1}`} error={errores[`aprobador-${indice}-rol`]}>
              <select
                aria-label={`Rol del aprobador ${indice + 1}`}
                value={aprobador.rol}
                onChange={(e) => actualizarAprobador(indice, 'rol', e.target.value)}
              >
                <option value="">Seleccione…</option>
                {roles.map((rol) => (
                  <option
                    key={rol.rol}
                    value={rol.rol}
                    disabled={rolesUsados.includes(rol.rol) && aprobador.rol !== rol.rol}
                  >
                    {rol.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Nombre" error={errores[`aprobador-${indice}-nombre`]}>
              <input
                aria-label={`Nombre del aprobador ${indice + 1}`}
                value={aprobador.nombre}
                onChange={(e) => actualizarAprobador(indice, 'nombre', e.target.value)}
              />
            </Campo>

            <Campo etiqueta="Correo" error={errores[`aprobador-${indice}-correo`]}>
              <input
                aria-label={`Correo del aprobador ${indice + 1}`}
                type="email"
                value={aprobador.correo}
                onChange={(e) => actualizarAprobador(indice, 'correo', e.target.value)}
              />
            </Campo>
          </fieldset>
        ))}
      </div>

      <div className="acciones">
        <button type="submit" className="boton" disabled={enviando}>
          {enviando ? 'Creando…' : 'Crear solicitud y enviar enlaces'}
        </button>
        <span className="campo__ayuda">
          Se generará un enlace único por aprobador y se enviará por correo (simulado).
        </span>
      </div>
    </form>
  );
}
