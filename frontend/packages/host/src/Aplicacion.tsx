import React from 'react';
import { NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  DetalleSolicitud,
  FormularioSolicitud,
  PanelSolicitudes,
  PantallaAprobacion,
  Remoto,
} from './remotos';

/**
 * Contenedor: layout, rutas y cableado de navegación hacia los remotos.
 *
 * Los microfrontends no conocen react-router; reciben callbacks. Si mañana el
 * host cambia de enrutador, los remotos no se tocan.
 */
export default function Aplicacion(): JSX.Element {
  return (
    <>
      <Cabecera />
      <main className="contenido">
        <Routes>
          <Route path="/" element={<RutaPanel />} />
          <Route path="/nueva" element={<RutaNueva />} />
          <Route path="/solicitudes/:id" element={<RutaDetalle />} />
          <Route path="/approve" element={<RutaAprobacion />} />
          <Route path="*" element={<NoEncontrada />} />
        </Routes>
      </main>
    </>
  );
}

function Cabecera(): JSX.Element {
  const clase = ({ isActive }: { isActive: boolean }) => (isActive ? 'activo' : '');
  return (
    <header className="cabecera">
      <div className="cabecera__contenido">
        <div className="cabecera__marca">
          Aprobaciones
          <span>Firma digital concatenada</span>
        </div>
        <nav>
          <NavLink to="/" className={clase} end>
            Panel
          </NavLink>
          <NavLink to="/nueva" className={clase}>
            Nueva solicitud
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function RutaPanel(): JSX.Element {
  const navegar = useNavigate();
  return (
    <Remoto nombre="solicitante">
      <PanelSolicitudes
        onAbrir={(id) => navegar(`/solicitudes/${id}`)}
        onNueva={() => navegar('/nueva')}
      />
    </Remoto>
  );
}

function RutaNueva(): JSX.Element {
  const navegar = useNavigate();
  return (
    <>
      <div className="encabezado-pagina">
        <h1>Nueva solicitud de compra</h1>
        <p>Cada aprobador recibirá un enlace único con validación por código de un solo uso.</p>
      </div>
      <Remoto nombre="solicitante">
        <FormularioSolicitud onCreada={(id) => navegar(`/solicitudes/${id}`)} />
      </Remoto>
    </>
  );
}

function RutaDetalle(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navegar = useNavigate();
  return (
    <Remoto nombre="solicitante">
      <DetalleSolicitud solicitudId={id ?? ''} onVolver={() => navegar('/')} />
    </Remoto>
  );
}

/** Ruta del enlace enviado por correo: /approve?solicitud_id=…&approver_token=… */
function RutaAprobacion(): JSX.Element {
  const [parametros] = useSearchParams();
  return (
    <div className="contenido--estrecho" style={{ margin: '0 auto' }}>
      <Remoto nombre="aprobador">
        <PantallaAprobacion
          solicitudId={parametros.get('solicitud_id') ?? ''}
          tokenAprobador={parametros.get('approver_token') ?? ''}
        />
      </Remoto>
    </div>
  );
}

function NoEncontrada(): JSX.Element {
  return (
    <div className="tarjeta vacio">
      <h1>Página no encontrada</h1>
      <p>Revise el enlace que recibió por correo.</p>
    </div>
  );
}
