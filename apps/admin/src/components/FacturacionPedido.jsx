import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, FileText } from 'lucide-react'
import { ESTADOS_ANULABLES, pedidoEsFacturable } from '@bakebrothers/domain'
import {
  abrirPdfDeComprobante,
  anularComprobante,
  consultarEstadoComprobante,
  emitirComprobante,
  guardarFacturacionDeCliente,
  reintentarComprobante,
  traerFacturacionDePedido,
} from '../lib/apiClient'
import { MIFACT_ACTIVO } from '../config/funciones'
import { formatoPrecio } from '../utils/formato'
import { Pill } from './bakeos/ui'

/**
 * Comprobantes electrónicos (boleta / factura) de UN pedido, dentro del propio pedido. Solo administración y solo con
 * Mifact activado (VITE_MIFACT_ACTIVO). La razón social que factura la elige el servidor según el local; el receptor
 * sale SIEMPRE del cliente del pedido: aquí nunca se escribe a quién se factura, solo se completan los datos del cliente.
 */

const TONO_ESTADO = {
  aceptado: 'ok',
  aceptado_con_observaciones: 'ok',
  en_proceso: 'lila',
  pendiente_envio: 'lila',
  anulacion_solicitada: 'neutro',
  anulado: 'neutro',
  rechazado: 'prioridad',
  error: 'prioridad',
}

const NOMBRE_DOC = { 6: 'RUC', 1: 'DNI' }
const textoDoc = (tipoDoc, documento) => (NOMBRE_DOC[tipoDoc] ? `${NOMBRE_DOC[tipoDoc]} ${documento}` : 'sin documento')
const mensajeDe = (err) => err?.mensaje || err?.message || 'No se pudo completar la acción'

const campoInput = 'w-full rounded-lg border border-borde bg-hueso px-3 py-2 text-sm outline-none focus:border-acento'
const botonOscuro = 'rounded-lg bg-tinta px-3 py-2 text-xs font-semibold text-white disabled:opacity-50'
const botonClaro = 'rounded-lg border border-borde bg-hueso px-3 py-2 text-xs font-semibold disabled:opacity-50'

function DatosDelCliente({ cliente, onGuardar, guardando, error }) {
  const [valores, setValores] = useState({
    ruc: cliente.ruc ?? '',
    razonSocial: cliente.razonSocial ?? '',
    direccionFiscal: cliente.direccionFiscal ?? '',
    dni: cliente.dni ?? '',
    correo: cliente.correo ?? '',
  })
  const cambiar = (campo) => (e) => setValores((v) => ({ ...v, [campo]: e.target.value }))
  const guardar = (e) => {
    e.preventDefault()
    // Solo los campos que cambiaron (vacío = borrar).
    const cambios = {}
    for (const [campo, valor] of Object.entries(valores)) if (valor.trim() !== (cliente[campo] ?? '')) cambios[campo] = valor.trim()
    onGuardar(cambios)
  }
  const campos = [
    ['ruc', 'RUC (para factura)', 'numeric', 11],
    ['razonSocial', 'Razón social', 'text', 100],
    ['direccionFiscal', 'Dirección fiscal', 'text', 100],
    ['dni', 'DNI (para boleta)', 'numeric', 8],
    ['correo', 'Correo del cliente', 'email', 100],
  ]
  return (
    <form onSubmit={guardar} className="mt-2 space-y-2 rounded-xl border border-borde bg-crema/60 p-3">
      <p className="text-xs text-gris">Estos datos son del cliente y salen en sus comprobantes. Se guardan en su ficha.</p>
      {campos.map(([campo, etiqueta, modo, max]) => (
        <label key={campo} className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-gris">{etiqueta}</span>
          <input
            value={valores[campo]}
            onChange={cambiar(campo)}
            inputMode={modo === 'numeric' ? 'numeric' : modo === 'email' ? 'email' : 'text'}
            maxLength={max}
            className={`${campoInput} mt-1`}
          />
        </label>
      ))}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={guardando} className={`${botonOscuro} w-full py-2.5`}>
        {guardando ? 'Guardando…' : 'Guardar datos del cliente'}
      </button>
    </form>
  )
}

function FilaComprobante({ c, ocupado, onVerPdf, onActualizar, onReintentar, onPedirAnular }) {
  const anulable = ESTADOS_ANULABLES.includes(c.estado)
  return (
    <li className="rounded-xl border border-borde bg-hueso p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{c.numero}</span>
        <Pill tono={TONO_ESTADO[c.estado] ?? 'neutro'}>{c.estadoLegible}</Pill>
        {c.entorno === 'demo' && <Pill tono="lila">Prueba</Pill>}
        <span className="ml-auto text-sm font-semibold">{formatoPrecio(c.total)}</span>
      </div>
      <p className="mt-1 text-xs capitalize text-gris">
        {c.tipo} · {c.receptor.nombre} · {textoDoc(c.receptor.tipoDoc, c.receptor.documento)} · {c.fechaEmision}
      </p>
      {c.sunat?.descripcion && <p className="mt-1 text-xs text-gris">SUNAT: {c.sunat.descripcion}</p>}
      {c.motivoAnulacion && <p className="mt-1 text-xs text-gris">Motivo de la anulación: {c.motivoAnulacion}</p>}
      {c.ultimoError && (c.estado === 'error' || c.estado === 'pendiente_envio') && (
        <p className="mt-1 text-xs text-acento-oscuro">{c.ultimoError}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {c.estado !== 'pendiente_envio' && c.estado !== 'error' && (
          <button type="button" onClick={() => onVerPdf(c)} disabled={ocupado} className={botonOscuro}>
            Ver PDF
          </button>
        )}
        {c.estado === 'pendiente_envio' ? (
          <button type="button" onClick={() => onReintentar(c)} disabled={ocupado} className={botonOscuro}>
            Reintentar envío
          </button>
        ) : (
          c.estado !== 'error' && (
            <button type="button" onClick={() => onActualizar(c)} disabled={ocupado} className={botonClaro}>
              Actualizar estado
            </button>
          )
        )}
        {anulable && (
          <button type="button" onClick={() => onPedirAnular(c)} disabled={ocupado} className={`${botonClaro} text-red-700`}>
            Anular…
          </button>
        )}
      </div>
    </li>
  )
}

/** Solo administración, solo con Mifact activado y solo en ventas firmes (no en borrador, ni esperando el pago, ni anuladas). */
export const mostrarFacturacion = (pedido, perfil) => MIFACT_ACTIVO && perfil?.rol === 'admin' && pedidoEsFacturable(pedido.estado)

export default function FacturacionPedido({ pedido, perfil }) {
  const [abierto, setAbierto] = useState(false)
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [confirmar, setConfirmar] = useState(null) // { tipo } | { anular: comprobante }
  const [motivo, setMotivo] = useState('')
  const [editando, setEditando] = useState(false)
  const [errorCliente, setErrorCliente] = useState(null)

  const cargar = useCallback(async () => {
    try {
      setDatos(await traerFacturacionDePedido(pedido.numero))
      setError(null)
    } catch (err) {
      setError(mensajeDe(err))
    }
  }, [pedido.numero])

  useEffect(() => {
    if (abierto && !datos && !error) cargar()
  }, [abierto, datos, error, cargar])

  if (!mostrarFacturacion(pedido, perfil)) return null

  const ejecutar = async (accion, despues) => {
    setOcupado(true)
    setError(null)
    try {
      await accion()
      despues?.()
      await cargar()
    } catch (err) {
      // Se refresca primero (puede haber quedado un comprobante a medias) y recién después se muestra el error.
      await cargar()
      setError(mensajeDe(err))
    } finally {
      setOcupado(false)
    }
  }

  const emitir = (tipo) => ejecutar(() => emitirComprobante(pedido.numero, tipo), () => setConfirmar(null))
  const anular = (c) => ejecutar(() => anularComprobante(c.id, motivo), () => (setConfirmar(null), setMotivo('')))
  const verPdf = (c) => ejecutar(() => abrirPdfDeComprobante(c.id, `${c.numero}.pdf`))
  const guardarCliente = async (cambios) => {
    if (Object.keys(cambios).length === 0) return setEditando(false)
    setOcupado(true)
    setErrorCliente(null)
    try {
      await guardarFacturacionDeCliente(datos.cliente.id, cambios)
      setEditando(false)
      await cargar()
    } catch (err) {
      setErrorCliente(mensajeDe(err))
    } finally {
      setOcupado(false)
    }
  }

  const vigente = datos?.comprobantes.some((c) => ['pendiente_envio', 'en_proceso', 'aceptado', 'aceptado_con_observaciones'].includes(c.estado))
  const cantidad = datos?.comprobantes.length

  return (
    <div className="mt-2 w-full">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        className="flex items-center gap-1.5 rounded-lg border border-borde bg-hueso px-3 py-2 text-xs font-semibold"
      >
        <FileText size={14} aria-hidden="true" />
        Comprobante{cantidad ? ` · ${cantidad}` : ''}
        <ChevronDown size={14} aria-hidden="true" className={abierto ? 'rotate-180' : ''} />
      </button>

      {abierto && (
        <div className="mt-2 rounded-xl border border-borde bg-crema/40 p-3" data-facturacion={pedido.numero}>
          {!datos && !error && <p className="text-xs text-gris">Cargando…</p>}
          {error && (
            <p role="alert" className="mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
              {error}
            </p>
          )}

          {datos && (
            <>
              <p className="text-xs text-gris">
                Factura con <span className="font-semibold text-tinta">{datos.emisor.razonSocial}</span>
                {datos.emisor.entorno === 'demo' && ' (entorno de pruebas)'}
              </p>
              {!datos.emisor.configurado && (
                <p className="mt-1 rounded-lg bg-acento-suave p-2 text-xs text-acento-oscuro">
                  Este local todavía no tiene la facturación configurada: no se puede emitir.
                </p>
              )}
              <p className="mt-1 text-xs text-gris">
                Cliente: <span className="font-semibold text-tinta">{datos.cliente.razonSocial || datos.cliente.nombre}</span>
                {datos.cliente.ruc ? ` · RUC ${datos.cliente.ruc}` : datos.cliente.dni ? ` · DNI ${datos.cliente.dni}` : ' · sin documento'}
              </p>

              {datos.comprobantes.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {datos.comprobantes.map((c) => (
                    <FilaComprobante
                      key={c.id}
                      c={c}
                      ocupado={ocupado}
                      onVerPdf={verPdf}
                      onActualizar={(x) => ejecutar(() => consultarEstadoComprobante(x.id))}
                      onReintentar={(x) => ejecutar(() => reintentarComprobante(x.id))}
                      onPedirAnular={(x) => (setConfirmar({ anular: x }), setMotivo(''))}
                    />
                  ))}
                </ul>
              )}

              {confirmar?.anular && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
                  <p className="text-xs font-semibold text-red-800">
                    ¿Anular {confirmar.anular.numero}? Se le pide a SUNAT la baja del comprobante y no se puede deshacer.
                  </p>
                  <label className="mt-2 block">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-red-800">Motivo (obligatorio)</span>
                    <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={100} className={`${campoInput} mt-1`} />
                  </label>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => anular(confirmar.anular)}
                      disabled={ocupado || motivo.trim().length < 3}
                      className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Sí, anular
                    </button>
                    <button type="button" onClick={() => setConfirmar(null)} disabled={ocupado} className={botonClaro}>
                      No, dejarlo
                    </button>
                  </div>
                </div>
              )}

              {!vigente && (
                <div className="mt-3 space-y-2">
                  {['boleta', 'factura'].map((tipo) => {
                    const opcion = datos.puede[tipo]
                    const etiqueta = tipo === 'boleta' ? 'Emitir boleta' : 'Emitir factura'
                    return (
                      <div key={tipo}>
                        <button
                          type="button"
                          onClick={() => setConfirmar({ tipo })}
                          disabled={ocupado || !opcion.ok || !datos.emisor.configurado}
                          className={`${botonOscuro} w-full py-2.5`}
                        >
                          {etiqueta}
                        </button>
                        {!opcion.ok && <p className="mt-1 text-xs text-gris">{opcion.motivo}</p>}
                      </div>
                    )
                  })}

                  {confirmar?.tipo && datos.puede[confirmar.tipo].ok && (
                    <div className="rounded-xl border border-borde bg-hueso p-3">
                      <p className="text-xs">
                        ¿Emitir {confirmar.tipo} de <span className="font-semibold">{formatoPrecio(datos.pedido.total)}</span> a nombre de{' '}
                        <span className="font-semibold">{datos.puede[confirmar.tipo].receptor.nombre}</span> (
                        {textoDoc(datos.puede[confirmar.tipo].receptor.tipoDoc, datos.puede[confirmar.tipo].receptor.documento)}) con{' '}
                        {datos.emisor.razonSocial}?
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => emitir(confirmar.tipo)} disabled={ocupado} className={botonOscuro}>
                          {ocupado ? 'Emitiendo…' : 'Sí, emitir'}
                        </button>
                        <button type="button" onClick={() => setConfirmar(null)} disabled={ocupado} className={botonClaro}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  <button type="button" onClick={() => setEditando((e) => !e)} className="text-xs font-semibold underline">
                    {editando ? 'Cerrar datos del cliente' : 'Completar o corregir los datos del cliente'}
                  </button>
                  {editando && (
                    <DatosDelCliente
                      cliente={datos.cliente}
                      onGuardar={guardarCliente}
                      guardando={ocupado}
                      error={errorCliente}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
