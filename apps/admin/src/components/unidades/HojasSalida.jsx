import { useMemo, useState } from 'react'
import { Minus, Plus, Search, X } from 'lucide-react'
import { confirmarSalio, crearSalida, editarSalida, mensajeDeErrorUnidades, registrarDevolucion } from '../../lib/unidadesApi'
import { diaLegible, mananaLima, nombreSku } from '../../utils/unidades'
import { Campo, claseEntrada, Hoja, Interruptor, MensajeError } from '../equipo/campos'

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Buscador de productos (con su tamaño) para agregar líneas. */
function SelectorProductos({ skus, yaAgregados, onAgregar }) {
  const [texto, setTexto] = useState('')
  const resultados = useMemo(() => {
    const q = sinTildes(texto).trim()
    if (!q) return []
    const palabras = q.split(/\s+/)
    return skus.filter((s) => !yaAgregados.has(s.clave) && palabras.every((p) => sinTildes(nombreSku(s)).includes(p))).slice(0, 8)
  }, [texto, skus, yaAgregados])
  return (
    <div className="space-y-2">
      <label className="flex min-h-11 items-center gap-2 rounded-xl border border-borde bg-white px-3">
        <Search size={16} aria-hidden="true" className="shrink-0 text-gris" />
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Agregar producto (ej. empanada, carrot individual)"
          aria-label="Buscar producto para agregar"
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-gris/70"
        />
      </label>
      {resultados.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-borde bg-white">
          {resultados.map((s) => (
            <li key={s.clave} className="border-b border-borde/60 last:border-0">
              <button
                type="button"
                onClick={() => {
                  onAgregar(s)
                  setTexto('')
                }}
                className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm"
              >
                <span className="min-w-0 truncate">{nombreSku(s)}</span>
                <Plus size={16} aria-hidden="true" className="shrink-0 text-gris" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {texto.trim() && resultados.length === 0 && <p className="px-1 text-xs text-gris">Ningún producto coincide (o ya está en la lista).</p>}
    </div>
  )
}

/** Cantidad con − / número / +. */
function Cantidad({ valor, onCambio, minimo = 0, etiqueta }) {
  const poner = (n) => onCambio(Math.min(5000, Math.max(minimo, Math.trunc(Number(n)) || minimo)))
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" aria-label={`Una menos de ${etiqueta}`} disabled={valor <= minimo} onClick={() => poner(valor - 1)} className="grid h-11 w-11 place-items-center rounded-xl border border-borde bg-white disabled:opacity-30">
        <Minus size={16} aria-hidden="true" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={minimo}
        value={valor}
        onChange={(e) => poner(e.target.value)}
        aria-label={`Cantidad de ${etiqueta}`}
        className="h-11 w-16 rounded-xl border border-borde bg-white text-center text-base font-bold outline-none focus:border-acento"
      />
      <button type="button" aria-label={`Una más de ${etiqueta}`} onClick={() => poner(valor + 1)} className="grid h-11 w-11 place-items-center rounded-xl border border-borde bg-white">
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

function Lineas({ lineas, onCambio, onQuitar, minimo = 1 }) {
  if (lineas.length === 0) return <p className="rounded-xl bg-borde/40 px-3.5 py-3 text-sm text-gris">Todavía no hay productos. Búscalos arriba.</p>
  return (
    <ul className="flex flex-col gap-2">
      {lineas.map((l) => (
        <li key={l.clave} className="flex items-center gap-2 rounded-xl border border-borde bg-white p-2.5">
          <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">{l.nombre}</p>
          <Cantidad valor={l.cantidad} onCambio={(n) => onCambio(l.clave, n)} minimo={minimo} etiqueta={l.nombre} />
          {onQuitar && (
            <button type="button" aria-label={`Quitar ${l.nombre}`} onClick={() => onQuitar(l.clave)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-gris">
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

const skuDeItem = (i) => ({ clave: `${i.productId}:${i.productSizeId ?? ''}`, productId: i.productId, productSizeId: i.productSizeId })
const claveSku = (s) => `${s.productId}:${s.productSizeId ?? ''}`
const aLinea = (s, cantidad) => ({ clave: claveSku(s), productId: s.productId, productSizeId: s.productSizeId, nombre: nombreSku(s), cantidad })

/** Nueva salida a calle, o edición de una planificada. */
export function HojaSalida({ unidades, sedes, skus, salida, onCerrar, onGuardada }) {
  const calle = unidades.find((u) => u.codigo !== 'mayoristas' && u.activa) ?? unidades[0]
  const [unidadId, setUnidadId] = useState(salida?.unidadId ?? calle?.id ?? '')
  const [fecha, setFecha] = useState(salida?.fecha ?? mananaLima())
  const [sedeId, setSedeId] = useState(salida?.sedeId ?? sedes[0]?.id ?? '')
  const [nota, setNota] = useState(salida?.nota ?? '')
  const [yaSalio, setYaSalio] = useState(false)
  const [lineas, setLineas] = useState(() => (salida ? salida.items.map((i) => ({ ...skuDeItem(i), nombre: i.tamano ? `${i.producto} · ${i.tamano}` : i.producto, cantidad: i.cantidad })) : []))
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const yaAgregados = useMemo(() => new Set(lineas.map((l) => l.clave)), [lineas])

  const guardar = async () => {
    if (!fecha) return setError('Elige la fecha en que sale.')
    if (!sedeId) return setError('Elige el local de donde sale.')
    if (lineas.length === 0) return setError('Agrega al menos un producto.')
    setEnviando(true)
    setError(null)
    const items = lineas.map((l) => ({ productId: l.productId, productSizeId: l.productSizeId, cantidad: l.cantidad }))
    try {
      if (salida?.id) await editarSalida(salida.id, { fecha, sedeId, nota: nota.trim() || null, items })
      else await crearSalida({ unidadId, sedeId, fecha, nota: nota.trim() || null, items, confirmar: yaSalio })
      onGuardada()
      onCerrar()
    } catch (err) {
      setError(mensajeDeErrorUnidades(err))
    } finally {
      setEnviando(false)
    }
  }

  const unidadesCalle = unidades.filter((u) => u.codigo !== 'mayoristas' && u.activa)
  return (
    <Hoja
      titulo={salida?.id ? 'Editar salida planificada' : 'Nueva salida a calle'}
      onCerrar={onCerrar}
      aviso={<MensajeError texto={error} />}
      pie={
        <button type="button" onClick={guardar} disabled={enviando} className="h-12 w-full rounded-xl bg-tinta text-base font-semibold text-white disabled:opacity-50">
          {enviando ? 'Guardando…' : salida?.id ? 'Guardar cambios' : yaSalio ? 'Registrar lo que salió' : 'Planificar salida'}
        </button>
      }
    >
      {!salida?.id && unidadesCalle.length > 1 && (
        <Campo etiqueta="Unidad" htmlFor="sal-unidad">
          <select id="sal-unidad" value={unidadId} onChange={(e) => setUnidadId(e.target.value)} className={claseEntrada}>
            {unidadesCalle.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </Campo>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Fecha en que sale" htmlFor="sal-fecha">
          <input id="sal-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={claseEntrada} />
        </Campo>
        <Campo etiqueta="Local de origen" htmlFor="sal-sede">
          <select id="sal-sede" value={sedeId} onChange={(e) => setSedeId(e.target.value)} className={claseEntrada}>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      {!salida?.id && (
        <div className="rounded-2xl border border-borde bg-white p-3.5">
          <Interruptor
            activo={yaSalio}
            onCambio={setYaSalio}
            etiqueta="Ya salió"
            ayuda={yaSalio ? 'Se registra ahora como salida confirmada: descuenta el Stock y se valoriza.' : 'Se registra como planificada (entra a la hoja de producción) y se confirma cuando salga.'}
          />
        </div>
      )}
      <SelectorProductos skus={skus} yaAgregados={yaAgregados} onAgregar={(s) => setLineas((ls) => [...ls, aLinea(s, 1)])} />
      <Lineas lineas={lineas} onCambio={(clave, n) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, cantidad: n } : l)))} onQuitar={(clave) => setLineas((ls) => ls.filter((l) => l.clave !== clave))} />
      <Campo etiqueta="Nota (opcional)" htmlFor="sal-nota">
        <input id="sal-nota" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} className={claseEntrada} />
      </Campo>
    </Hoja>
  )
}

/** Confirmar lo que salió de verdad (parte de lo planificado). */
export function HojaSalio({ salida, skus, onCerrar, onHecha }) {
  const [lineas, setLineas] = useState(() => salida.items.map((i) => ({ clave: i.id, itemId: i.id, nombre: i.tamano ? `${i.producto} · ${i.tamano}` : i.producto, cantidad: i.cantidad, planificado: i.cantidad })))
  const [nuevos, setNuevos] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [avisos, setAvisos] = useState(null)
  const yaAgregados = useMemo(() => new Set([...salida.items.map((i) => `${i.productId}:${i.productSizeId ?? ''}`), ...nuevos.map((n) => n.clave)]), [salida, nuevos])

  const confirmar = async () => {
    setEnviando(true)
    setError(null)
    try {
      const r = await confirmarSalio(salida.id, {
        items: lineas.map((l) => ({ itemId: l.itemId, cantidadSalio: l.cantidad })),
        ...(nuevos.length ? { nuevos: nuevos.map((n) => ({ productId: n.productId, productSizeId: n.productSizeId, cantidad: n.cantidad })) } : {}),
      })
      onHecha()
      if (r.avisos?.length) setAvisos(r.avisos)
      else onCerrar()
    } catch (err) {
      setError(mensajeDeErrorUnidades(err))
    } finally {
      setEnviando(false)
    }
  }

  if (avisos)
    return (
      <Hoja titulo="Salida confirmada" onCerrar={onCerrar} pie={<button type="button" onClick={onCerrar} className="h-12 w-full rounded-xl bg-tinta text-base font-semibold text-white">Listo</button>}>
        <p className="text-sm">Quedó registrada, pero hay que revisar el Stock:</p>
        <ul className="space-y-2">
          {avisos.map((a) => (
            <li key={a} className="rounded-xl bg-acento-suave px-3.5 py-2.5 text-sm text-acento-oscuro">
              {a}
            </li>
          ))}
        </ul>
      </Hoja>
    )

  return (
    <Hoja
      titulo="¿Qué salió de verdad?"
      onCerrar={onCerrar}
      aviso={<MensajeError texto={error} />}
      pie={
        <button type="button" onClick={confirmar} disabled={enviando} className="h-12 w-full rounded-xl bg-tinta text-base font-semibold text-white disabled:opacity-50">
          {enviando ? 'Confirmando…' : 'Confirmar que salió'}
        </button>
      }
    >
      <p className="text-sm text-gris">
        {salida.unidad} · {diaLegible(salida.fecha)}. Cambia lo que no salió igual a lo planificado (0 si no salió). Al confirmar se descuenta del Stock de {salida.sede ?? 'el local'} donde hay conteo y se valoriza al precio interno de hoy.
      </p>
      <ul className="flex flex-col gap-2">
        {lineas.map((l) => (
          <li key={l.clave} className="flex items-center gap-2 rounded-xl border border-borde bg-white p-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug">{l.nombre}</p>
              <p className="text-[11px] text-gris">Planificado: {l.planificado}</p>
            </div>
            <Cantidad valor={l.cantidad} onCambio={(n) => setLineas((ls) => ls.map((x) => (x.clave === l.clave ? { ...x, cantidad: n } : x)))} etiqueta={l.nombre} />
          </li>
        ))}
      </ul>
      <SelectorProductos skus={skus} yaAgregados={yaAgregados} onAgregar={(s) => setNuevos((ns) => [...ns, aLinea(s, 1)])} />
      {nuevos.length > 0 && (
        <>
          <p className="text-xs font-bold uppercase tracking-wide text-gris">No estaban planificados</p>
          <Lineas lineas={nuevos} onCambio={(clave, n) => setNuevos((ns) => ns.map((x) => (x.clave === clave ? { ...x, cantidad: n } : x)))} onQuitar={(clave) => setNuevos((ns) => ns.filter((x) => x.clave !== clave))} />
        </>
      )}
    </Hoja>
  )
}

/** Anotar lo que volvió de una salida que ya salió. */
export function HojaDevolucion({ salida, regresaAStock, onCerrar, onHecha }) {
  const [lineas, setLineas] = useState(() =>
    salida.items.map((i) => ({ clave: i.id, itemId: i.id, nombre: i.tamano ? `${i.producto} · ${i.tamano}` : i.producto, salio: i.cantidadSalio ?? 0, cantidad: i.cantidadDevuelta ?? 0 }))
  )
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  const guardar = async () => {
    setEnviando(true)
    setError(null)
    try {
      await registrarDevolucion(salida.id, lineas.map((l) => ({ itemId: l.itemId, cantidadDevuelta: Math.min(l.cantidad, l.salio) })))
      onHecha()
      onCerrar()
    } catch (err) {
      setError(mensajeDeErrorUnidades(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Hoja
      titulo="¿Qué volvió?"
      onCerrar={onCerrar}
      aviso={<MensajeError texto={error} />}
      pie={
        <button type="button" onClick={guardar} disabled={enviando} className="h-12 w-full rounded-xl bg-tinta text-base font-semibold text-white disabled:opacity-50">
          {enviando ? 'Guardando…' : 'Guardar lo que volvió'}
        </button>
      }
    >
      <p className="text-sm text-gris">
        {salida.unidad} · {diaLegible(salida.fecha)}. {regresaAStock ? `Lo que vuelve regresa al Stock de ${salida.sede ?? 'el local'} (donde hay conteo) y se descuenta del valor.` : 'Lo que vuelve se descuenta del valor.'}
      </p>
      <ul className="flex flex-col gap-2">
        {lineas.map((l) => (
          <li key={l.clave} className="flex items-center gap-2 rounded-xl border border-borde bg-white p-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug">{l.nombre}</p>
              <p className="text-[11px] text-gris">Salieron {l.salio}</p>
            </div>
            <Cantidad valor={l.cantidad} onCambio={(n) => setLineas((ls) => ls.map((x) => (x.clave === l.clave ? { ...x, cantidad: Math.min(n, l.salio) } : x)))} etiqueta={`${l.nombre} que volvió`} />
          </li>
        ))}
      </ul>
    </Hoja>
  )
}
