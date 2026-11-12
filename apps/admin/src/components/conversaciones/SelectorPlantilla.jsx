import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FileText, Search, X } from 'lucide-react'
import { textoDePlantilla } from '@bakebrothers/domain'
import { plantillasDeConversacion } from '../../lib/apiClient'
import { mensajeDeErrorDeEnvio } from '../../utils/conversaciones'

const CATEGORIAS = { UTILITY: 'Utilidad', MARKETING: 'Marketing', AUTHENTICATION: 'Autenticación' }

/**
 * Hoja para elegir una plantilla APROBADA de WhatsApp (se leen de Meta en el momento, no se escriben a mano) y llenar
 * sus variables. Se usa cuando la ventana de 24 horas ya cerró y el texto libre no se puede enviar. En celular ocupa
 * casi toda la pantalla desde abajo; en escritorio es un recuadro centrado.
 */
export default function SelectorPlantilla({ conversacionId, ocupado, errorAccion, onEnviar, onCerrar }) {
  const [estado, setEstado] = useState({ cargando: true, error: null, plantillas: [], noSoportadas: 0 })
  const [busqueda, setBusqueda] = useState('')
  const [elegida, setElegida] = useState(null)
  const [valores, setValores] = useState({})

  useEffect(() => {
    let cancelado = false
    plantillasDeConversacion(conversacionId)
      .then((d) => !cancelado && setEstado({ cargando: false, error: null, plantillas: d.plantillas ?? [], noSoportadas: d.noSoportadas ?? 0 }))
      .catch((e) => !cancelado && setEstado({ cargando: false, error: e, plantillas: [], noSoportadas: 0 }))
    return () => {
      cancelado = true
    }
  }, [conversacionId])

  useEffect(() => {
    const alTeclear = (e) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return estado.plantillas
    return estado.plantillas.filter((p) => p.nombre.toLowerCase().includes(t) || p.cuerpo.toLowerCase().includes(t))
  }, [estado.plantillas, busqueda])

  const completa = elegida && elegida.variables.every((v) => (valores[v.clave] ?? '').trim())

  const elegir = (p) => {
    setElegida(p)
    // Precarga el ejemplo que dio quien creó la plantilla, para que se vea cómo queda; la persona lo cambia.
    setValores(Object.fromEntries(p.variables.map((v) => [v.clave, ''])))
  }

  const enviar = async () => {
    if (!completa || ocupado) return
    const ok = await onEnviar({ nombre: elegida.nombre, idioma: elegida.idioma, valores })
    if (ok) onCerrar()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/50 sm:items-center" role="presentation" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Enviar una plantilla de WhatsApp"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full flex-col rounded-t-3xl bg-hueso shadow-xl sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-borde px-4 py-3">
          {elegida ? (
            <button onClick={() => setElegida(null)} aria-label="Volver a la lista de plantillas" className="grid h-11 w-11 place-items-center rounded-xl text-gris">
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
          ) : (
            <FileText size={20} aria-hidden="true" className="ml-1 text-gris" />
          )}
          <h2 className="min-w-0 flex-1 truncate text-base font-bold">{elegida ? elegida.nombre : 'Enviar una plantilla'}</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="grid h-11 w-11 place-items-center rounded-xl text-gris">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {!elegida && (
            <>
              <p className="mb-3 text-sm text-gris">
                Pasaron más de 24 horas desde el último mensaje del cliente, así que WhatsApp solo deja enviar una plantilla aprobada.
              </p>
              {estado.cargando && <p className="py-8 text-center text-sm text-gris">Leyendo las plantillas aprobadas en WhatsApp…</p>}
              {estado.error && (
                <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                  {mensajeDeErrorDeEnvio(estado.error)}
                  {typeof estado.error.detalle === 'string' && <span className="mt-1 block text-xs opacity-80">{estado.error.detalle}</span>}
                </p>
              )}
              {!estado.cargando && !estado.error && estado.plantillas.length === 0 && (
                <p className="rounded-xl bg-borde/50 px-3.5 py-3 text-sm text-gris">
                  Todavía no hay plantillas aprobadas que se puedan enviar desde aquí. Se crean y se aprueban en WhatsApp Manager (Meta); cuando estén aprobadas aparecen solas en esta lista.
                  {estado.noSoportadas > 0 && ` Hay ${estado.noSoportadas} aprobada${estado.noSoportadas === 1 ? '' : 's'} con imagen, video u otro formato que el panel no envía.`}
                </p>
              )}
              {estado.plantillas.length > 0 && (
                <>
                  <label className="relative mb-3 block">
                    <span className="sr-only">Buscar plantilla</span>
                    <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-gris" />
                    <input
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Buscar plantilla"
                      className="min-h-11 w-full rounded-xl border border-borde bg-white pl-9 pr-3 text-sm outline-none focus:border-acento"
                    />
                  </label>
                  <ul className="flex flex-col gap-2">
                    {visibles.map((p) => (
                      <li key={`${p.nombre}/${p.idioma}`}>
                        <button
                          onClick={() => elegir(p)}
                          className="flex w-full flex-col gap-1 rounded-2xl border border-borde bg-white p-3.5 text-left hover:border-acento"
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-[15px] font-semibold">{p.nombre}</span>
                            <span className="shrink-0 text-xs text-gris">{CATEGORIAS[p.categoria] ?? p.categoria}</span>
                          </span>
                          <span className="line-clamp-2 text-sm text-gris">{textoDePlantilla(p)}</span>
                        </button>
                      </li>
                    ))}
                    {visibles.length === 0 && <p className="py-4 text-center text-sm text-gris">Ninguna plantilla coincide.</p>}
                  </ul>
                </>
              )}
            </>
          )}

          {elegida && (
            <>
              <p className="whitespace-pre-wrap rounded-2xl bg-ok-suave px-3.5 py-3 text-[15px] leading-snug" aria-label="Así lo recibirá el cliente">
                {textoDePlantilla(elegida, valores)}
              </p>
              {elegida.botones.length > 0 && (
                <p className="mt-2 text-xs text-gris">
                  Botones: {elegida.botones.map((b) => b.texto).filter(Boolean).join(' · ')}
                </p>
              )}
              {elegida.variables.length > 0 && (
                <div className="mt-4 flex flex-col gap-3">
                  {elegida.variables.map((v) => (
                    <label key={v.clave} className="flex flex-col gap-1">
                      <span className="text-sm font-semibold">
                        {v.seccion === 'boton' ? `Enlace del botón (${v.nombre})` : /^\d+$/.test(v.nombre) ? `Campo ${v.nombre}${v.seccion === 'encabezado' ? ' (título)' : ''}` : v.nombre.replace(/_/g, ' ')}
                      </span>
                      <input
                        value={valores[v.clave] ?? ''}
                        onChange={(e) => setValores((x) => ({ ...x, [v.clave]: e.target.value }))}
                        placeholder={v.ejemplo ? `Ej.: ${v.ejemplo}` : ''}
                        className="min-h-11 rounded-xl border border-borde bg-white px-3 text-[15px] outline-none focus:border-acento"
                      />
                    </label>
                  ))}
                </div>
              )}
              {errorAccion && (
                <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                  {mensajeDeErrorDeEnvio(errorAccion)}
                  {typeof errorAccion.detalle === 'string' && <span className="mt-1 block break-words text-xs opacity-80">{errorAccion.detalle}</span>}
                </p>
              )}
            </>
          )}
        </div>

        {elegida && (
          <div className="shrink-0 border-t border-borde p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              onClick={enviar}
              disabled={!completa || ocupado}
              className="min-h-12 w-full rounded-xl bg-tinta px-4 text-[15px] font-semibold text-white disabled:opacity-40"
            >
              {ocupado ? 'Enviando…' : 'Enviar plantilla'}
            </button>
            {!completa && elegida.variables.length > 0 && <p className="mt-1.5 text-center text-xs text-gris">Completa todos los campos para enviar.</p>}
          </div>
        )}
      </div>
    </div>
  )
}
