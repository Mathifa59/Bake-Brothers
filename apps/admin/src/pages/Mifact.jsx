import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ChevronDown, FileSpreadsheet, Info, Upload } from 'lucide-react'
import { readSheet } from 'read-excel-file/universal'
import { compararCatalogoMifact, filasDesdeMatriz } from '@bakebrothers/domain'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { traerTodo } from '../lib/datos'
import { guardarCodigosMifact } from '../lib/apiClient'
import { formatoPrecio } from '../utils/formato'
import { Pill, Portada, Tarjeta } from '../components/bakeos/ui'

// Importador del catálogo de Mifact (solo admin). El Excel se lee y se cruza en el navegador con
// nuestro catálogo POR NOMBRE; lo único que se guarda son los códigos de Mifact (uno por almacén)
// de lo que el admin deja marcado. NUNCA se cambia un precio ni un nombre: las diferencias son una
// lista para revisar a mano.

const ALMACEN_SIN_DATO = 'sin almacen'

/** Catálogo propio como "unidades vendibles": un producto sin tamaños, o cada tamaño de un producto. */
async function cargarCatalogo() {
  const productos = await traerTodo(() =>
    supabase
      .from('products')
      // `tipo` ya trae la familia ("Alfajores", "Postres"…): `categories` no es legible desde el panel (0013).
      .select('id, nombre, precio_base, tipo, product_sizes(id, tamano, precio)')
      .order('nombre')
  )
  // Códigos ya guardados. Si la migración 0033 aún no está aplicada, la tabla no existe: se puede
  // analizar igual, pero no guardar.
  let codigos = []
  let tablaDeCodigos = true
  try {
    codigos = await traerTodo(() => supabase.from('mifact_codigos').select('product_id, product_size_id, almacen, codigo').order('id'))
  } catch (e) {
    tablaDeCodigos = false
  }
  const porProducto = new Map()
  const porTamano = new Map()
  for (const c of codigos) {
    const mapa = c.product_id ? porProducto : porTamano
    const clave = c.product_id ?? c.product_size_id
    mapa.set(clave, [...(mapa.get(clave) ?? []), { almacen: c.almacen, codigo: c.codigo }])
  }
  const items = []
  for (const p of productos) {
    const categoria = p.tipo ?? null
    const tamanos = (p.product_sizes ?? []).filter((t) => t.precio !== null)
    if (tamanos.length > 0) {
      for (const t of tamanos) {
        items.push({ tipo: 'tamano', id: t.id, nombre: `${p.nombre} ${t.tamano}`, precio: Number(t.precio), categoria, codigos: porTamano.get(t.id) ?? [] })
      }
    } else {
      items.push({ tipo: 'producto', id: p.id, nombre: p.nombre, precio: Number(p.precio_base), categoria, codigos: porProducto.get(p.id) ?? [] })
    }
  }
  return { items, tablaDeCodigos }
}

const agrupar = (lista, clave) => {
  const mapa = new Map()
  for (const x of lista) {
    const k = clave(x) || '(sin categoría)'
    mapa.set(k, [...(mapa.get(k) ?? []), x])
  }
  return [...mapa.entries()].sort((a, b) => b[1].length - a[1].length)
}

function Seccion({ titulo, cantidad, descripcion, abierta = false, children }) {
  return (
    <details open={abierta} className="group mt-3 rounded-2xl border border-borde bg-hueso">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {titulo} <span className="text-acento-oscuro">· {cantidad}</span>
          </p>
          {descripcion && <p className="mt-0.5 text-xs leading-snug text-gris">{descripcion}</p>}
        </div>
        <ChevronDown size={18} className="shrink-0 text-gris transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-borde px-4 pb-4 pt-2">{children}</div>
    </details>
  )
}

function ChipVariante({ v }) {
  const estado = { nuevo: ['lila', 'nuevo'], igual: ['ok', 'ya guardado'], distinto: ['prioridad', 'otro código'] }[v.codigo]
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="font-semibold">{v.fila.almacen ?? 'sin almacén'}</span>
      <span className="text-gris">{v.fila.codigo}</span>
      <Pill tono={estado[0]}>{estado[1]}</Pill>
      {v.codigo === 'distinto' && <span className="text-gris">ya tiene {v.codigoActual}</span>}
      {v.fila.precio !== null && <span className="text-gris">{formatoPrecio(v.fila.precio)}</span>}
      {v.precioDistinto && (
        <span className="font-semibold text-acento-oscuro">
          {v.diferenciaPrecio > 0 ? '+' : '−'}
          {formatoPrecio(Math.abs(v.diferenciaPrecio))} vs. nuestro
        </span>
      )}
    </li>
  )
}

function FilaCoincidencia({ c, marcada, alCambiar, puedeGuardar }) {
  const guardables = c.variantes.filter((v) => v.codigo === 'nuevo').length
  return (
    <li className="py-3">
      <label className={`flex items-start gap-3 ${guardables > 0 && puedeGuardar ? 'cursor-pointer' : ''}`}>
        <input
          type="checkbox"
          checked={marcada}
          disabled={guardables === 0 || !puedeGuardar}
          onChange={(e) => alCambiar(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-[#D86820]"
          aria-label={`Guardar los códigos de ${c.item.nombre}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-snug">{c.item.nombre}</span>
          <span className="block text-xs leading-snug text-gris">
            Mifact: {c.producto.nombre}
            {c.confianza === 'probable' && ` · parecido ${Math.round(c.puntaje * 100)}%`}
            {` · nuestro ${c.item.precio !== null ? formatoPrecio(c.item.precio) : '—'}`}
          </span>
          <ul className="mt-1.5 space-y-1">
            {c.variantes.map((v) => (
              <ChipVariante key={v.fila.codigo} v={v} />
            ))}
          </ul>
        </span>
      </label>
    </li>
  )
}

export default function Mifact() {
  const { perfil } = useAuth()
  const entrada = useRef(null)
  const [catalogo, setCatalogo] = useState(null)
  const [errorCatalogo, setErrorCatalogo] = useState(null)
  const [archivo, setArchivo] = useState(null) // { nombre, lectura }
  const [leyendo, setLeyendo] = useState(false)
  const [errorArchivo, setErrorArchivo] = useState(null)
  const [marcadas, setMarcadas] = useState(new Set())
  const [guardando, setGuardando] = useState(false)
  const [resultadoGuardado, setResultadoGuardado] = useState(null)
  const [errorGuardado, setErrorGuardado] = useState(null)

  const recargarCatalogo = useCallback(async () => {
    try {
      setCatalogo(await cargarCatalogo())
      setErrorCatalogo(null)
    } catch (e) {
      setErrorCatalogo(e.message ?? String(e))
    }
  }, [])
  useEffect(() => {
    recargarCatalogo()
  }, [recargarCatalogo])

  const comparacion = useMemo(
    () => (archivo?.lectura.filas.length && catalogo ? compararCatalogoMifact(archivo.lectura.filas, catalogo.items) : null),
    [archivo, catalogo]
  )

  // Marcadas por defecto: las coincidencias EXACTAS con algún código nuevo. Las probables las confirma una persona.
  useEffect(() => {
    if (!comparacion) return setMarcadas(new Set())
    setMarcadas(new Set(comparacion.coincidencias.filter((c) => c.confianza === 'exacta' && c.variantes.some((v) => v.codigo === 'nuevo')).map((c) => c.item.id)))
  }, [comparacion])

  if (perfil?.rol !== 'admin') return <Navigate to="/resumen" replace />

  async function elegirArchivo(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setErrorArchivo(null)
    setResultadoGuardado(null)
    setErrorGuardado(null)
    setArchivo(null)
    setLeyendo(true)
    try {
      if (!/\.xlsx$/i.test(f.name)) throw new Error('Sube el Excel en formato .xlsx (en Mifact, exporta los productos a Excel).')
      const lectura = filasDesdeMatriz(await readSheet(f))
      if (lectura.error) throw new Error(lectura.error)
      if (lectura.filas.length === 0) throw new Error('El archivo no trae productos.')
      setArchivo({ nombre: f.name, lectura })
    } catch (err) {
      setErrorArchivo(err.message ?? 'No se pudo leer el archivo.')
    } finally {
      setLeyendo(false)
    }
  }

  const puedeGuardar = catalogo?.tablaDeCodigos === true
  const seleccionables = comparacion?.coincidencias.filter((c) => c.variantes.some((v) => v.codigo === 'nuevo')) ?? []
  const asignaciones = (comparacion?.coincidencias ?? [])
    .filter((c) => marcadas.has(c.item.id))
    .flatMap((c) =>
      c.variantes
        .filter((v) => v.codigo === 'nuevo')
        .map((v) => ({ tipo: c.item.tipo, id: c.item.id, almacen: v.fila.almacen ?? ALMACEN_SIN_DATO, codigo: v.fila.codigo, codigoBarras: v.fila.codigoBarras }))
    )

  async function guardar() {
    setGuardando(true)
    setErrorGuardado(null)
    try {
      setResultadoGuardado(await guardarCodigosMifact(asignaciones))
      await recargarCatalogo() // los guardados pasan a "ya guardado"
    } catch (err) {
      setErrorGuardado(err.detalle ?? err.message ?? 'No se pudieron guardar los códigos.')
    } finally {
      setGuardando(false)
    }
  }

  const alternar = (id, valor) =>
    setMarcadas((actual) => {
      const nuevo = new Set(actual)
      if (valor) nuevo.add(id)
      else nuevo.delete(id)
      return nuevo
    })
  const marcarProbables = () =>
    setMarcadas((actual) => new Set([...actual, ...seleccionables.filter((c) => c.confianza === 'probable').map((c) => c.item.id)]))

  const r = comparacion?.resumen
  const exactas = comparacion?.coincidencias.filter((c) => c.confianza === 'exacta') ?? []
  const probables = comparacion?.coincidencias.filter((c) => c.confianza === 'probable') ?? []
  const conPrecio = comparacion?.coincidencias.filter((c) => c.precioDistinto) ?? []
  const conNombre = comparacion?.coincidencias.filter((c) => c.nombreDistinto) ?? []

  return (
    <>
      <Portada titulo="Importar de Mifact" subtitulo="Cruza el Excel de productos de Mifact con nuestro catálogo." accion={false} />

      <div role="note" className="mt-4 flex gap-3 rounded-2xl border border-borde bg-lila-suave/60 p-4 text-sm leading-relaxed">
        <Info size={18} className="mt-0.5 shrink-0 text-lila" aria-hidden="true" />
        <p>
          Sube el Excel de productos que exporta Mifact. Se cruza <span className="font-semibold">por nombre</span> y se guardan los{' '}
          <span className="font-semibold">códigos de Mifact</span> (uno por almacén) de lo que dejes marcado.{' '}
          <span className="font-semibold">No cambia ningún precio ni nombre</span>: las diferencias son una lista para revisar a mano.
        </p>
      </div>

      {errorCatalogo && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          No se pudo leer nuestro catálogo: {errorCatalogo}
        </p>
      )}
      {catalogo && !catalogo.tablaDeCodigos && (
        <p role="alert" className="mt-4 flex gap-2 rounded-xl bg-acento-suave p-3 text-sm leading-relaxed text-acento-oscuro">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          La base aún no tiene la tabla de códigos de Mifact (migración 0033 pendiente). Puedes subir el archivo y ver las diferencias, pero todavía no se pueden guardar códigos.
        </p>
      )}

      <input ref={entrada} type="file" accept=".xlsx" onChange={elegirArchivo} className="sr-only" aria-label="Archivo Excel de Mifact" />
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={leyendo || !catalogo}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-tinta px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        <Upload size={16} aria-hidden="true" />
        {leyendo ? 'Leyendo el archivo…' : archivo ? 'Subir otro archivo' : 'Elegir el Excel de Mifact (.xlsx)'}
      </button>

      {errorArchivo && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {errorArchivo}
        </p>
      )}

      {archivo && r && (
        <>
          <Tarjeta className="mt-4 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <FileSpreadsheet size={16} className="text-ok" aria-hidden="true" />
              <span className="min-w-0 truncate">{archivo.nombre}</span>
            </p>
            <p className="mt-1 text-xs leading-snug text-gris">
              {archivo.lectura.filasLeidas} filas · {r.productosMifact} productos distintos (cada producto aparece una vez por almacén) · columnas leídas:{' '}
              {Object.values(archivo.lectura.columnas).filter(Boolean).join(', ')}
              {archivo.lectura.filasIncompletas > 0 && ` · ${archivo.lectura.filasIncompletas} filas sin código o nombre (ignoradas)`}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              {[
                ['Coinciden exactos', r.exactas, 'ok'],
                ['Probables', r.probables, 'lila'],
                ['Precio distinto', r.conPrecioDistinto, 'prioridad'],
                ['Solo en Mifact', r.soloMifact, 'neutro'],
                ['Solo en nuestro catálogo', r.soloNuestro, 'neutro'],
                ['Ambiguas', r.ambiguas, 'neutro'],
              ].map(([etiqueta, n, tono]) => (
                <div key={etiqueta} className="rounded-xl border border-borde bg-crema px-2 py-2.5">
                  <p className="text-xl font-bold leading-none">{n}</p>
                  <p className="mt-1 text-[10.5px] font-semibold uppercase leading-tight tracking-wide text-gris">{etiqueta}</p>
                </div>
              ))}
            </div>
          </Tarjeta>

          <Seccion titulo="Coinciden exactos" cantidad={exactas.length} descripcion="Mismo nombre. Marcados para guardar sus códigos." abierta>
            <ul className="divide-y divide-borde">
              {exactas.map((c) => (
                <FilaCoincidencia key={c.item.id} c={c} marcada={marcadas.has(c.item.id)} alCambiar={(v) => alternar(c.item.id, v)} puedeGuardar={puedeGuardar} />
              ))}
            </ul>
          </Seccion>

          <Seccion titulo="Probables: revisa y confirma" cantidad={probables.length} descripcion="Parecidos pero no idénticos (p. ej. “Mini Carrot cake” y “Carrot Cake Mini 16cm”). No se guardan solos.">
            {probables.length > 0 && puedeGuardar && (
              <button type="button" onClick={marcarProbables} className="mb-1 rounded-lg border border-borde px-3 py-1.5 text-xs font-semibold text-acento-oscuro">
                Marcar todas las probables
              </button>
            )}
            <ul className="divide-y divide-borde">
              {probables.map((c) => (
                <FilaCoincidencia key={c.item.id} c={c} marcada={marcadas.has(c.item.id)} alCambiar={(v) => alternar(c.item.id, v)} puedeGuardar={puedeGuardar} />
              ))}
            </ul>
          </Seccion>

          <Seccion titulo="Precio distinto" cantidad={conPrecio.length} descripcion="El precio de Mifact (con IGV) no es igual al nuestro. Solo informativo: no se cambia nada.">
            <ul className="divide-y divide-borde">
              {conPrecio.map((c) => (
                <li key={c.item.id} className="py-3 text-sm">
                  <p className="font-semibold leading-snug">{c.item.nombre}</p>
                  <p className="text-xs text-gris">Nuestro precio: {formatoPrecio(c.item.precio)}</p>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {c.variantes.map((v) => (
                      <li key={v.fila.codigo} className={v.precioDistinto ? 'font-semibold text-acento-oscuro' : 'text-gris'}>
                        {v.fila.almacen ?? 'sin almacén'}: {v.fila.precio !== null ? formatoPrecio(v.fila.precio) : '—'}
                        {v.precioDistinto && ` (${v.diferenciaPrecio > 0 ? '+' : '−'}${formatoPrecio(Math.abs(v.diferenciaPrecio))})`}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Seccion>

          <Seccion titulo="Nombre distinto" cantidad={conNombre.length} descripcion="Calzan, pero el nombre se escribe distinto en Mifact y en nuestro catálogo.">
            <ul className="divide-y divide-borde">
              {conNombre.map((c) => (
                <li key={c.item.id} className="py-2.5 text-xs leading-snug">
                  <span className="font-semibold">{c.item.nombre}</span> <span className="text-gris">↔ {c.producto.nombre}</span>
                </li>
              ))}
            </ul>
          </Seccion>

          <Seccion titulo="Solo en Mifact" cantidad={comparacion.soloMifact.length} descripcion="Productos de Mifact sin equivalente en nuestro catálogo, por categoría de Mifact.">
            {agrupar(comparacion.soloMifact, (p) => p.categoria).map(([categoria, lista]) => (
              <details key={categoria} className="mt-2 rounded-xl border border-borde bg-crema">
                <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold">
                  {categoria} <span className="text-gris">· {lista.length}</span>
                </summary>
                <ul className="divide-y divide-borde px-3 pb-2">
                  {lista.map((p) => (
                    <li key={p.variantes[0].codigo} className="py-2 text-xs leading-snug">
                      <span className="font-semibold">{p.nombre}</span>{' '}
                      <span className="text-gris">
                        · {p.variantes.map((v) => `${v.almacen ?? '—'} ${v.precio !== null ? formatoPrecio(v.precio) : ''}`).join(' · ')}
                      </span>
                      {p.sugerencia && <span className="block text-acento-oscuro">¿Será “{p.sugerencia.nombre}”? ({Math.round(p.sugerencia.puntaje * 100)}% parecido)</span>}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </Seccion>

          <Seccion titulo="Solo en nuestro catálogo" cantidad={comparacion.soloNuestro.length} descripcion="Productos nuestros que no aparecen en Mifact, por categoría.">
            {agrupar(comparacion.soloNuestro, (i) => i.categoria).map(([categoria, lista]) => (
              <details key={categoria} className="mt-2 rounded-xl border border-borde bg-crema">
                <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold">
                  {categoria} <span className="text-gris">· {lista.length}</span>
                </summary>
                <ul className="divide-y divide-borde px-3 pb-2">
                  {lista.map((i) => (
                    <li key={i.id} className="py-2 text-xs leading-snug">
                      <span className="font-semibold">{i.nombre}</span> <span className="text-gris">· {i.precio !== null ? formatoPrecio(i.precio) : '—'}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </Seccion>

          {comparacion.ambiguas.length > 0 && (
            <Seccion titulo="Ambiguas" cantidad={comparacion.ambiguas.length} descripcion="No se asignan solas: pueden ser de más de un producto nuestro.">
              <ul className="divide-y divide-borde">
                {comparacion.ambiguas.map((a) => (
                  <li key={a.producto.variantes[0].codigo} className="py-2.5 text-xs leading-snug">
                    <span className="font-semibold">{a.producto.nombre}</span> <span className="text-gris">— {a.motivo}</span>
                    <span className="block text-gris">Candidatos: {a.candidatos.map((x) => x.nombre).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}

          {resultadoGuardado && (
            <div role="status" className="mt-4 rounded-2xl border border-ok/30 bg-ok-suave p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold text-ok">
                <CheckCircle2 size={16} aria-hidden="true" /> {resultadoGuardado.resumen.guardados} códigos guardados
              </p>
              <p className="mt-1 text-xs text-gris">
                {resultadoGuardado.resumen.iguales} ya estaban guardados · {resultadoGuardado.resumen.rechazados} rechazados
              </p>
              {resultadoGuardado.resultados
                .filter((x) => !['guardado', 'igual'].includes(x.resultado))
                .map((x) => (
                  <p key={`${x.id}-${x.almacen}`} className="mt-1 text-xs text-acento-oscuro">
                    {x.almacen} · {x.codigo}: {x.resultado === 'codigo_en_uso' ? 'código en uso' : x.resultado === 'item_con_otro_codigo' ? 'ya tenía otro código' : 'producto no encontrado'}
                    {x.detalle ? ` (${x.detalle})` : ''}
                  </p>
                ))}
            </div>
          )}
          {errorGuardado && (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {errorGuardado}
            </p>
          )}

          <div className="sticky bottom-0 mt-4 bg-crema/95 pb-3 pt-2 backdrop-blur">
            <button
              type="button"
              onClick={guardar}
              disabled={guardando || asignaciones.length === 0 || !puedeGuardar}
              className="w-full rounded-xl bg-acento-oscuro px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {guardando ? 'Guardando…' : `Guardar ${asignaciones.length} código${asignaciones.length === 1 ? '' : 's'} (${marcadas.size} producto${marcadas.size === 1 ? '' : 's'})`}
            </button>
          </div>
        </>
      )}
    </>
  )
}
