import { useState } from 'react'
import { KeyRound, UserCheck, UserX } from 'lucide-react'
import { validarContrasena } from '@bakebrothers/domain'
import { cambiarContrasena, desactivarCuenta, editarCuenta, reactivarCuenta } from '../../hooks/useEquipo'
import { mensajeDeErrorEquipo } from '../../utils/equipo'
import { BotonCopiar, Campo, CampoContrasena, claseEntrada, Hoja, Interruptor, MensajeError, necesitaLocal, SelectorPerfiles } from './campos'
import Historial from './Historial'

const mismos = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

/** Detalle de una cuenta: editar perfiles/local/avisos, cambiar la contraseña, desactivar o reactivar, y su historial. */
export default function HojaCuenta({ cuenta, sedes, esYo, onCerrar, onCambio }) {
  const [f, setF] = useState({
    nombre: cuenta.nombre ?? '',
    perfiles: cuenta.perfiles,
    sedeId: cuenta.sedeId ?? '',
    avisaOrdenes: cuenta.avisaOrdenes,
    avisaPagos: cuenta.avisaPagos,
    esEncargado: cuenta.esEncargado,
  })
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState(null) // { tipo: 'ok' | 'error', texto }
  const [password, setPassword] = useState('')
  const [cambiandoClave, setCambiandoClave] = useState(false)
  const [claveNueva, setClaveNueva] = useState(null) // la que se acaba de fijar, para copiarla
  const [confirmandoBaja, setConfirmandoBaja] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  // Sube con cada acción hecha: el historial de abajo se vuelve a leer y muestra lo que se acaba de hacer.
  const [version, setVersion] = useState(0)
  const poner = (campo) => (valor) => {
    setMensaje(null)
    setF((x) => ({ ...x, [campo]: valor }))
  }

  const cambiado =
    f.nombre.trim() !== (cuenta.nombre ?? '') ||
    !mismos(f.perfiles, cuenta.perfiles) ||
    (f.sedeId || null) !== (cuenta.sedeId ?? null) ||
    f.avisaOrdenes !== cuenta.avisaOrdenes ||
    f.avisaPagos !== cuenta.avisaPagos ||
    f.esEncargado !== cuenta.esEncargado

  const ejecutar = async (accion) => {
    setOcupado(true)
    setMensaje(null)
    try {
      const r = await accion()
      onCambio()
      setVersion((v) => v + 1)
      return r ?? true
    } catch (err) {
      setMensaje({ tipo: 'error', texto: mensajeDeErrorEquipo(err) })
      return null
    } finally {
      setOcupado(false)
    }
  }

  const guardar = async () => {
    if (!f.nombre.trim()) return setMensaje({ tipo: 'error', texto: 'El nombre no puede quedar vacío.' })
    if (f.perfiles.length === 0) return setMensaje({ tipo: 'error', texto: 'Elige al menos un perfil.' })
    if (necesitaLocal(f.perfiles) && !f.sedeId) return setMensaje({ tipo: 'error', texto: 'Caja y Producción trabajan en un local: elige cuál.' })
    setGuardando(true)
    const ok = await ejecutar(() =>
      editarCuenta(cuenta.id, {
        nombre: f.nombre.trim(),
        perfiles: f.perfiles,
        sedeId: f.sedeId || null,
        avisaOrdenes: f.avisaOrdenes,
        avisaPagos: f.avisaPagos,
        esEncargado: f.esEncargado,
      })
    )
    setGuardando(false)
    if (ok) setMensaje({ tipo: 'ok', texto: 'Cambios guardados.' })
  }

  const fijarClave = async () => {
    const v = validarContrasena(password)
    if (!v.ok) return setMensaje({ tipo: 'error', texto: v.motivo })
    const ok = await ejecutar(() => cambiarContrasena(cuenta.id, password))
    if (ok) {
      setClaveNueva(password)
      setPassword('')
      setCambiandoClave(false)
      setMensaje({ tipo: 'ok', texto: 'Contraseña cambiada. Pásasela por un medio seguro; no se vuelve a mostrar.' })
    }
  }

  const darDeBaja = async () => {
    const r = await ejecutar(() => desactivarCuenta(cuenta.id))
    if (!r) return
    setConfirmandoBaja(false)
    setMensaje({
      tipo: r.sesionBloqueada === false ? 'error' : 'ok',
      texto:
        r.sesionBloqueada === false
          ? 'La cuenta quedó desactivada en Bake OS (ya no ve ningún dato), pero no se pudo bloquear su inicio de sesión en Supabase. Vuelve a intentarlo.'
          : 'Cuenta desactivada: ya no puede entrar. Su historial se conserva.',
    })
  }

  const reactivar = async () => {
    const ok = await ejecutar(() => reactivarCuenta(cuenta.id))
    if (ok) setMensaje({ tipo: 'ok', texto: 'Cuenta reactivada.' })
  }

  const entra = cuenta.usuario ?? cuenta.correo ?? 'sin dato'

  return (
    <Hoja
      titulo={cuenta.nombre ?? entra}
      onCerrar={onCerrar}
      aviso={<MensajeAccion mensaje={mensaje} />}
      pie={
        cuenta.activo && (
          <button
            type="button"
            onClick={guardar}
            disabled={!cambiado || guardando || ocupado}
            className="h-12 w-full rounded-xl bg-tinta text-base font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        )
      }
    >
      <div className="rounded-2xl border border-borde bg-white p-3.5 text-sm">
        <p className="font-semibold">{cuenta.usuario ? 'Entra con el usuario' : 'Entra con el correo'}</p>
        <p className="break-all text-base">{entra}</p>
        {cuenta.usuario && cuenta.correo && <p className="mt-0.5 break-all text-xs text-gris">Correo interno: {cuenta.correo}</p>}
        {!cuenta.activo && <p className="mt-2 text-xs font-semibold text-red-700">Cuenta desactivada. No puede entrar ni ve ningún dato.</p>}
      </div>

      {claveNueva && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-borde bg-white p-3.5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-gris">Contraseña nueva</p>
            <p className="break-all font-mono text-base font-semibold">{claveNueva}</p>
          </div>
          <BotonCopiar texto={claveNueva} />
        </div>
      )}

      {cuenta.activo ? (
        <>
          <Campo etiqueta="Nombre" htmlFor="ec-nombre">
            <input id="ec-nombre" value={f.nombre} onChange={(e) => poner('nombre')(e.target.value)} maxLength={80} className={claseEntrada} />
          </Campo>

          <SelectorPerfiles
            valor={f.perfiles}
            onCambio={poner('perfiles')}
            tieneTransitorio={cuenta.perfiles.includes('empleado_temporal')}
            bloquearAdministracion={esYo}
          />

          <Campo etiqueta="Local" htmlFor="ec-local" ayuda={necesitaLocal(f.perfiles) ? 'Obligatorio para Caja y Producción.' : 'Opcional: sin local ve los dos.'}>
            <select id="ec-local" value={f.sedeId} onChange={(e) => poner('sedeId')(e.target.value)} className={claseEntrada}>
              <option value="">Sin local</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <div className="space-y-4 rounded-2xl border border-borde bg-white p-4">
            <Interruptor activo={f.avisaOrdenes} onCambio={poner('avisaOrdenes')} etiqueta="Avisos de órdenes" ayuda="Aviso de orden nueva y de pedido para hoy." />
            <Interruptor activo={f.avisaPagos} onCambio={poner('avisaPagos')} etiqueta="Avisos de pagos" ayuda="Aviso de pago por confirmar." />
            <Interruptor activo={f.esEncargado} onCambio={poner('esEncargado')} etiqueta="Encargado" ayuda="Puede porcionar productos en Stock." />
          </div>

          <section className="space-y-3 rounded-2xl border border-borde bg-white p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <KeyRound size={16} aria-hidden="true" />
              Contraseña
            </h3>
            {cambiandoClave ? (
              <>
                <CampoContrasena id="ec-clave" valor={password} onCambio={setPassword} autoFocus />
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setCambiandoClave(false); setPassword('') }} className="h-11 rounded-xl border border-borde text-sm font-semibold">
                    Cancelar
                  </button>
                  <button type="button" onClick={fijarClave} disabled={ocupado} className="h-11 rounded-xl bg-tinta text-sm font-semibold text-white disabled:opacity-50">
                    Fijar contraseña
                  </button>
                </div>
              </>
            ) : (
              <button type="button" onClick={() => { setCambiandoClave(true); setClaveNueva(null) }} className="h-11 w-full rounded-xl border border-borde text-sm font-semibold">
                Cambiar contraseña
              </button>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-red-200 bg-red-50/40 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <UserX size={16} aria-hidden="true" />
              Desactivar cuenta
            </h3>
            {esYo ? (
              <p className="text-sm text-gris">No puedes desactivar tu propia cuenta.</p>
            ) : confirmandoBaja ? (
              <>
                <p className="text-sm">
                  ¿Desactivar a <strong>{cuenta.nombre ?? entra}</strong>? Deja de poder entrar y de ver cualquier dato al instante. La cuenta y su historial no se borran y la puedes reactivar.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setConfirmandoBaja(false)} className="h-11 rounded-xl border border-borde bg-white text-sm font-semibold">
                    No, volver
                  </button>
                  <button type="button" onClick={darDeBaja} disabled={ocupado} className="h-11 rounded-xl bg-red-700 text-sm font-semibold text-white disabled:opacity-50">
                    Sí, desactivar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gris">Para cuando alguien deja de trabajar. Nunca se borra: se conserva todo su historial.</p>
                <button type="button" onClick={() => setConfirmandoBaja(true)} className="h-11 w-full rounded-xl border border-red-300 bg-white text-sm font-semibold text-red-700">
                  Desactivar cuenta
                </button>
              </>
            )}
          </section>
        </>
      ) : (
        <button
          type="button"
          onClick={reactivar}
          disabled={ocupado}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-tinta text-base font-semibold text-white disabled:opacity-50"
        >
          <UserCheck size={18} aria-hidden="true" />
          Reactivar cuenta
        </button>
      )}

      <section>
        <h3 className="mb-2 text-sm font-bold">Historial de esta cuenta</h3>
        <Historial key={version} sedes={sedes} objetivoId={cuenta.id} limite={8} compacto />
      </section>
    </Hoja>
  )
}

function MensajeAccion({ mensaje }) {
  if (!mensaje) return null
  if (mensaje.tipo === 'error') return <MensajeError texto={mensaje.texto} />
  return (
    <p role="status" className="rounded-xl bg-ok-suave px-3.5 py-2.5 text-sm text-ok">
      {mensaje.texto}
    </p>
  )
}
