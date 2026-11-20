import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { esCorreoValido, validarContrasena, validarUsuario } from '@bakebrothers/domain'
import { crearCuenta } from '../../hooks/useEquipo'
import { mensajeDeErrorEquipo } from '../../utils/equipo'
import { BotonCopiar, Campo, CampoContrasena, claseEntrada, Hoja, Interruptor, MensajeError, necesitaLocal, SelectorPerfiles } from './campos'

const VACIO = {
  nombre: '',
  modo: 'usuario', // 'usuario' (correo interno, contraseña que define el administrador) | 'correo' (correo real)
  usuario: '',
  correo: '',
  password: '',
  invitar: false,
  perfiles: [],
  sedeId: '',
  avisaOrdenes: false,
  avisaPagos: false,
  esEncargado: false,
}

/** Nueva cuenta del equipo: sin invitación por correo; el administrador define el usuario y la contraseña. */
export default function HojaCrear({ sedes, onCerrar, onCreada }) {
  const [f, setF] = useState(VACIO)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [creada, setCreada] = useState(null)
  const poner = (campo) => (valor) => setF((x) => ({ ...x, [campo]: valor }))

  const esAdministracion = f.perfiles.includes('administracion')
  const conInvitacion = f.modo === 'correo' && f.invitar && esAdministracion

  const validar = () => {
    if (!f.nombre.trim()) return 'Escribe el nombre de la persona.'
    if (f.modo === 'usuario') {
      const u = validarUsuario(f.usuario)
      if (!u.ok) return u.motivo
    } else if (!esCorreoValido(f.correo)) {
      return 'Escribe un correo válido.'
    }
    if (f.perfiles.length === 0) return 'Elige al menos un perfil.'
    if (necesitaLocal(f.perfiles) && !f.sedeId) return 'Caja y Producción trabajan en un local: elige cuál.'
    if (!conInvitacion) {
      const p = validarContrasena(f.password)
      if (!p.ok) return p.motivo
    }
    return null
  }

  const enviar = async (e) => {
    e.preventDefault()
    const problema = validar()
    if (problema) return setError(problema)
    setError(null)
    setEnviando(true)
    try {
      const r = await crearCuenta({
        nombre: f.nombre.trim(),
        ...(f.modo === 'usuario' ? { usuario: f.usuario } : { correo: f.correo.trim() }),
        ...(conInvitacion ? { invitar: true } : { password: f.password }),
        perfiles: f.perfiles,
        sedeId: f.sedeId || null,
        avisaOrdenes: f.avisaOrdenes,
        avisaPagos: f.avisaPagos,
        esEncargado: f.esEncargado,
      })
      setCreada({
        entra: f.modo === 'usuario' ? f.usuario.trim().toLowerCase() : f.correo.trim().toLowerCase(),
        password: conInvitacion ? null : f.password,
        invitada: r.invitada === true,
        nombre: f.nombre.trim(),
      })
      onCreada()
    } catch (err) {
      setError(mensajeDeErrorEquipo(err))
    } finally {
      setEnviando(false)
    }
  }

  if (creada) {
    return (
      <Hoja titulo="Cuenta creada" onCerrar={onCerrar} pie={<BotonListo onClick={onCerrar} />}>
        <div className="flex items-start gap-3 rounded-2xl bg-ok-suave p-4">
          <CheckCircle2 size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-ok" />
          <div className="min-w-0">
            <p className="text-[15px] font-bold">{creada.nombre} ya tiene cuenta.</p>
            <p className="mt-1 text-sm text-gris">
              {creada.invitada
                ? `Le mandamos una invitación a ${creada.entra}. Al abrir el enlace define su contraseña.`
                : 'Pásale estos datos por un medio seguro. La contraseña no se vuelve a mostrar (si se pierde, la cambias desde Equipo).'}
            </p>
          </div>
        </div>
        {!creada.invitada && (
          <dl className="space-y-3 rounded-2xl border border-borde bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <dt className="text-xs font-bold uppercase tracking-wide text-gris">{creada.entra.includes('@') ? 'Correo' : 'Usuario'}</dt>
                <dd className="break-all text-base font-semibold">{creada.entra}</dd>
              </div>
              <BotonCopiar texto={creada.entra} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <dt className="text-xs font-bold uppercase tracking-wide text-gris">Contraseña</dt>
                <dd className="break-all font-mono text-base font-semibold">{creada.password}</dd>
              </div>
              <BotonCopiar texto={creada.password} />
            </div>
          </dl>
        )}
      </Hoja>
    )
  }

  return (
    <Hoja
      titulo="Nueva cuenta"
      onCerrar={onCerrar}
      aviso={<MensajeError texto={error} />}
      pie={
        <button
          type="submit"
          form="form-nueva-cuenta"
          disabled={enviando}
          className="h-12 w-full rounded-xl bg-tinta text-base font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {enviando ? 'Creando…' : conInvitacion ? 'Crear y mandar invitación' : 'Crear cuenta'}
        </button>
      }
    >
      <form id="form-nueva-cuenta" onSubmit={enviar} className="space-y-5" noValidate>
        <Campo etiqueta="Nombre de la persona" htmlFor="nc-nombre">
          <input id="nc-nombre" value={f.nombre} onChange={(e) => poner('nombre')(e.target.value)} maxLength={80} autoComplete="off" className={claseEntrada} />
        </Campo>

        <div className="space-y-2">
          <p className="text-sm font-semibold">Cómo entra</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cómo entra">
            {[
              ['usuario', 'Con usuario'],
              ['correo', 'Con correo real'],
            ].map(([valor, texto]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={f.modo === valor}
                onClick={() => poner('modo')(valor)}
                className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${f.modo === valor ? 'border-acento bg-acento-suave/60' : 'border-borde bg-white'}`}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>

        {f.modo === 'usuario' ? (
          <Campo etiqueta="Usuario" htmlFor="nc-usuario" ayuda="Ejemplo: caja.cedros. Letras sin tilde, números, punto o guion. Es lo que escribe para entrar.">
            <input
              id="nc-usuario"
              value={f.usuario}
              onChange={(e) => poner('usuario')(e.target.value)}
              maxLength={30}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              className={claseEntrada}
            />
          </Campo>
        ) : (
          <Campo etiqueta="Correo" htmlFor="nc-correo" ayuda="Para administradores con correo propio. Entra con este correo.">
            <input
              id="nc-correo"
              type="email"
              value={f.correo}
              onChange={(e) => poner('correo')(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              className={claseEntrada}
            />
          </Campo>
        )}

        <SelectorPerfiles valor={f.perfiles} onCambio={poner('perfiles')} />

        {(necesitaLocal(f.perfiles) || f.sedeId) && (
          <Campo etiqueta="Local" htmlFor="nc-local" ayuda="Caja y Producción solo ven los datos de su local.">
            <select id="nc-local" value={f.sedeId} onChange={(e) => poner('sedeId')(e.target.value)} className={claseEntrada}>
              <option value="">Elige un local…</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {!necesitaLocal(f.perfiles) && !f.sedeId && sedes.length > 0 && (
          <button type="button" onClick={() => poner('sedeId')(sedes[0].id)} className="text-sm font-semibold text-acento-oscuro underline">
            Asignarle un local (opcional)
          </button>
        )}

        <div className="space-y-4 rounded-2xl border border-borde bg-white p-4">
          <Interruptor activo={f.avisaOrdenes} onCambio={poner('avisaOrdenes')} etiqueta="Avisos de órdenes" ayuda="Le llega el aviso cuando se registra una orden o un pedido para hoy." />
          <Interruptor activo={f.avisaPagos} onCambio={poner('avisaPagos')} etiqueta="Avisos de pagos" ayuda="Le llega el aviso cuando hay un pago por confirmar." />
          <Interruptor activo={f.esEncargado} onCambio={poner('esEncargado')} etiqueta="Encargado" ayuda="Puede porcionar productos en Stock (además de su perfil)." />
        </div>

        {f.modo === 'correo' && esAdministracion && (
          <Interruptor
            activo={f.invitar}
            onCambio={poner('invitar')}
            etiqueta="Mandar invitación por correo"
            ayuda="En vez de definir tú la contraseña, le llega un correo para que la defina ella o él. Solo para administradores."
          />
        )}

        {!conInvitacion && (
          <Campo etiqueta="Contraseña" htmlFor="nc-password" ayuda="Mínimo 10 caracteres. Puedes generar una y copiarla al terminar.">
            <CampoContrasena id="nc-password" valor={f.password} onCambio={poner('password')} />
          </Campo>
        )}
      </form>
    </Hoja>
  )
}

function BotonListo({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="h-12 w-full rounded-xl bg-tinta text-base font-semibold text-white">
      Listo
    </button>
  )
}
