import { useMemo, useState } from 'react'
import { CheckCircle2, History } from 'lucide-react'
import { registrarOrdenMayorista, ultimaOrdenMayorista } from '../../lib/apiClient'
import { mensajeDeError, saborCorto } from '../../utils/ordenes'
import Stepper from './Stepper'
import ListaProductos from './ListaProductos'

const TAMANOS = ['Mediana', 'Grande']
const clave = (id, tamano) => `${id}|${tamano}`

/**
 * Orden de un mayorista, tan rápida como mandar un mensaje: cliente (con su tamaño y hora habituales), hora,
 * cantidad por sabor y una línea de postres. «Repetir el anterior» carga lo de su última orden. El precio no se
 * pide: queda por cotizar. Pasado el corte de las 10:30 p. m. se avisa, pero se registra igual.
 */
export default function FormMayorista({ empanadas, postres, mayoristas, fecha, corte, onRegistrada, sedeId }) {
  const [clienteId, setClienteId] = useState('')
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [hora, setHora] = useState('7:30')
  const [tamano, setTamano] = useState('Mediana')
  const [cant, setCant] = useState({})
  const [lineasPostres, setLineasPostres] = useState([])
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [hecho, setHecho] = useState(null)

  const cliente = mayoristas.find((c) => c.id === clienteId)

  const resumen = useMemo(() => {
    const por = { Mediana: 0, Grande: 0 }
    for (const [k, n] of Object.entries(cant)) por[k.split('|')[1]] += n
    return por
  }, [cant])
  const total = resumen.Mediana + resumen.Grande

  const elegirCliente = (id) => {
    setClienteId(id)
    setAviso(null)
    setError(null)
    const c = mayoristas.find((x) => x.id === id)
    if (c) {
      if (c.tamano_habitual) setTamano(c.tamano_habitual)
      if (c.hora_habitual) setHora(c.hora_habitual.replace(/^0/, ''))
    }
  }

  const repetirAnterior = async () => {
    if (!clienteId || clienteId === 'nuevo') return
    setError(null)
    setAviso(null)
    try {
      const u = await ultimaOrdenMayorista(clienteId)
      if (!u) return setAviso('Este cliente todavía no tiene una orden anterior.')
      const nuevo = {}
      const conteo = { Mediana: 0, Grande: 0 }
      for (const e of u.empanadas) {
        nuevo[clave(e.productoId, e.tamano)] = (nuevo[clave(e.productoId, e.tamano)] ?? 0) + e.cantidad
        conteo[e.tamano] += e.cantidad
      }
      setCant(nuevo)
      if (u.hora) setHora(u.hora.replace(/^0/, ''))
      setTamano(conteo.Grande > conteo.Mediana ? 'Grande' : 'Mediana')
      const porId = new Map(postres.map((p) => [p.id, p]))
      setLineasPostres(u.postres.map((p) => ({ productoId: p.productoId, nombre: porId.get(p.productoId)?.nombre ?? 'Producto', tamano: p.tamano, cantidad: p.cantidad })))
      setAviso(`Cargado de la orden ${u.numero}. Cambia lo que haga falta y registra.`)
    } catch (err) {
      setError(mensajeDeError(err))
    }
  }

  const listo = (clienteId && (clienteId !== 'nuevo' || nombreNuevo.trim())) && hora.trim() && (total > 0 || lineasPostres.length > 0)

  const enviar = async (e) => {
    e.preventDefault()
    if (!listo || enviando) return
    setEnviando(true)
    setError(null)
    try {
      const empanadasOrden = Object.entries(cant)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => {
          const [productoId, t] = k.split('|')
          return { productoId, tamano: t, cantidad: n }
        })
      const r = await registrarOrdenMayorista({
        cliente: clienteId === 'nuevo' ? { nombre: nombreNuevo.trim() } : { id: clienteId },
        ...(sedeId ? { sedeId } : {}),
        fechaEntrega: fecha,
        hora: hora.trim(),
        empanadas: empanadasOrden,
        postres: lineasPostres.map((l) => ({ productoId: l.productoId, tamano: l.tamano, cantidad: l.cantidad })),
        nota: nota.trim() || null,
      })
      setHecho({ numero: r.numero, fueraDeCorte: r.corte?.fueraDeCorte, cliente: cliente?.nombre ?? nombreNuevo.trim() })
      onRegistrada?.()
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  const limpiar = () => {
    setHecho(null)
    setClienteId('')
    setNombreNuevo('')
    setCant({})
    setLineasPostres([])
    setNota('')
    setAviso(null)
  }

  if (hecho) {
    return (
      <div className="rounded-2xl border border-borde bg-hueso p-5 text-center">
        <CheckCircle2 className="mx-auto text-ok" size={36} aria-hidden="true" />
        <p className="mt-2 text-lg font-bold">Orden {hecho.numero} registrada</p>
        <p className="mt-1 text-sm text-gris">{hecho.cliente} · el total queda por cotizar.</p>
        {hecho.fueraDeCorte && (
          <p className="mt-3 rounded-xl bg-acento-suave px-3 py-2 text-sm font-semibold text-acento-oscuro">
            Se registró fuera de corte: producción lo verá marcado.
          </p>
        )}
        <button type="button" onClick={limpiar} className="mt-4 h-11 w-full rounded-xl bg-tinta text-sm font-semibold text-white">
          Registrar otra orden
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      {corte?.fueraDeCorte && (
        <p role="status" className="rounded-xl bg-acento-suave px-3 py-2.5 text-sm font-semibold text-acento-oscuro">
          {corte.motivo === 'pasado_el_corte'
            ? 'Ya pasó el corte de las 10:30 p. m. Se registra igual, pero queda marcada como fuera de corte.'
            : 'Esta orden es para hoy o antes: queda marcada como fuera de corte.'}
        </p>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-semibold" htmlFor="may-cliente">
          Cliente
        </label>
        <select
          id="may-cliente"
          value={clienteId}
          onChange={(e) => elegirCliente(e.target.value)}
          className="h-12 w-full rounded-xl border border-borde bg-hueso px-3 text-base outline-none focus:border-acento"
        >
          <option value="">Elige un cliente…</option>
          {mayoristas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
          <option value="nuevo">+ Cliente nuevo</option>
        </select>
        {clienteId === 'nuevo' && (
          <input
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            placeholder="Nombre del cliente"
            aria-label="Nombre del cliente nuevo"
            className="h-12 w-full rounded-xl border border-borde bg-hueso px-3 text-base outline-none focus:border-acento"
          />
        )}
        {clienteId && clienteId !== 'nuevo' && (
          <button
            type="button"
            onClick={repetirAnterior}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-tinta text-sm font-semibold text-tinta"
          >
            <History size={16} aria-hidden="true" />
            Repetir el anterior
          </button>
        )}
        {aviso && (
          <p role="status" className="text-xs font-semibold text-ok">
            {aviso}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-semibold" htmlFor="may-hora">
            Hora de despacho
          </label>
          <input
            id="may-hora"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            inputMode="text"
            placeholder="7:30"
            className="h-12 w-full rounded-xl border border-borde bg-hueso px-3 text-base outline-none focus:border-acento"
          />
        </div>
        <div>
          <span className="mb-1 block text-sm font-semibold">Tamaño</span>
          <div role="group" aria-label="Tamaño de las empanadas" className="grid h-12 grid-cols-2 gap-1 rounded-xl bg-borde/60 p-1">
            {TAMANOS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tamano === t}
                onClick={() => setTamano(t)}
                className={`rounded-lg text-sm font-bold transition-colors ${tamano === t ? 'bg-tinta text-white' : 'text-gris'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Empanadas {tamano.toLowerCase()}s por sabor</h3>
          <span className="text-xs font-semibold text-gris" aria-live="polite">
            {resumen.Mediana > 0 && `Medianas ${resumen.Mediana}`}
            {resumen.Mediana > 0 && resumen.Grande > 0 && ' · '}
            {resumen.Grande > 0 && `Grandes ${resumen.Grande}`}
            {total === 0 && 'Sin cantidades'}
          </span>
        </div>
        <ul className="divide-y divide-borde rounded-2xl border border-borde bg-hueso">
          {empanadas.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0 text-[15px] font-medium leading-snug">{saborCorto(p.nombre)}</span>
              <Stepper
                valor={cant[clave(p.id, tamano)] ?? 0}
                onCambio={(n) => setCant((c) => ({ ...c, [clave(p.id, tamano)]: n }))}
                etiqueta={`${saborCorto(p.nombre)} ${tamano.toLowerCase()}`}
              />
            </li>
          ))}
        </ul>
        {resumen.Mediana > 0 && resumen.Grande > 0 && (
          <p className="mt-1 text-xs text-gris">Pidió de las dos medidas: cambia de tamaño arriba para ver o editar cada una.</p>
        )}
      </div>

      <ListaProductos
        titulo="Postres"
        vacio="Sin postres. Agrega los que pidió."
        productos={postres}
        lineas={lineasPostres}
        onCambio={setLineasPostres}
      />

      <div>
        <label className="mb-1 block text-sm font-semibold" htmlFor="may-nota">
          Nota (opcional)
        </label>
        <input
          id="may-nota"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          className="h-12 w-full rounded-xl border border-borde bg-hueso px-3 text-base outline-none focus:border-acento"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!listo || enviando}
        className="h-12 w-full rounded-xl bg-tinta text-base font-semibold text-white transition-opacity disabled:opacity-40"
      >
        {enviando ? 'Registrando…' : 'Registrar orden'}
      </button>
      <p className="text-center text-xs text-gris">El total queda por cotizar.</p>
    </form>
  )
}
