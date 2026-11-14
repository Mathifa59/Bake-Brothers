import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import {
  LIMITES_RESPUESTA_AUTOMATICA as LIM,
  RESPUESTAS_PUBLICAS_SUGERIDAS,
  referenciaDeCampana,
  textoDelDm,
} from '@bakebrothers/domain'

// Misma API que usa el resto del panel (lib/apiClient.js): de ahí sale el link corto que va en el DM.
const URL_API = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://api.bake-brothers.com' : 'http://localhost:3001')
export const enlaceCorto = (referencia) => `${URL_API.replace(/\/+$/, '')}/w/${referencia}`

const separarPalabras = (texto) =>
  [...new Set(texto.split(/[,\n]/).map((p) => p.trim()).filter(Boolean))].slice(0, LIM.palabras)

function vacia() {
  return {
    nombre: '',
    otras: '',
    respuestas: [...RESPUESTAS_PUBLICAS_SUGERIDAS],
    mensajeDm: '',
    mensajeWhatsapp: '',
  }
}

function desdeRegla(r) {
  return {
    nombre: r.nombre,
    otras: r.palabras.filter((p) => p.toLowerCase() !== r.nombre.toLowerCase()).join(', '),
    respuestas: r.respuestas_publicas.length ? r.respuestas_publicas : [],
    mensajeDm: r.mensaje_dm,
    mensajeWhatsapp: r.mensaje_whatsapp,
  }
}

const campo =
  'w-full rounded-xl border border-borde bg-hueso px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-acento focus:ring-2 focus:ring-acento/20'
const etiqueta = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-gris'

/**
 * Crear o editar una respuesta automática. La referencia (ig-alfajor) sale del nombre al crearla y no cambia después:
 * los links ya enviados y los pedidos ya registrados apuntan a ella.
 */
export default function FormRespuestaAutomatica({ regla, onGuardar, onCancelar, guardando, error }) {
  const [f, setF] = useState(() => (regla ? desdeRegla(regla) : vacia()))
  const poner = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  const palabraPrincipal = f.nombre.trim().toLowerCase()
  const referencia = regla ? regla.referencia : referenciaDeCampana('ig', f.nombre)
  const mensajeDm = f.mensajeDm || (palabraPrincipal ? `¡Hola! 🍪 Gracias por escribirnos. Te dejamos el link para pedir ${palabraPrincipal} por WhatsApp: ahí te confirmamos disponibilidad y te ayudamos con tu pedido.` : '')
  const mensajeWhatsapp = f.mensajeWhatsapp || (palabraPrincipal ? `Hola Bake Brothers 👋 Vengo por lo de ${palabraPrincipal}` : '')
  const palabras = useMemo(() => separarPalabras([f.nombre, f.otras].join(',')), [f.nombre, f.otras])
  const respuestas = f.respuestas.map((r) => r.trim()).filter(Boolean)

  const problemas = []
  if (!referencia) problemas.push('Escribe la palabra clave.')
  if (mensajeDm.trim().length > LIM.largoMensajeDm) problemas.push(`El DM pasa de ${LIM.largoMensajeDm} caracteres.`)
  if (respuestas.some((r) => r.length > LIM.largoRespuestaPublica)) problemas.push('Alguna respuesta pública es muy larga.')

  function enviar(e) {
    e.preventDefault()
    if (problemas.length) return
    onGuardar({
      nombre: f.nombre.trim(),
      palabras,
      respuestas_publicas: respuestas.slice(0, LIM.respuestasPublicas),
      mensaje_dm: mensajeDm.trim(),
      mensaje_whatsapp: mensajeWhatsapp.trim().slice(0, LIM.largoMensajeWhatsApp),
      referencia,
    })
  }

  return (
    <form onSubmit={enviar} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="ra-nombre" className={etiqueta}>Palabra clave</label>
          <input
            id="ra-nombre"
            value={f.nombre}
            onChange={poner('nombre')}
            disabled={Boolean(regla)}
            maxLength={LIM.largoPalabra}
            placeholder="Ej. ALFAJOR"
            autoComplete="off"
            className={`${campo} font-semibold uppercase tracking-wide placeholder:normal-case placeholder:font-normal placeholder:tracking-normal disabled:opacity-70`}
          />
          <p className="mt-1.5 text-xs text-gris">
            {regla
              ? 'La palabra principal no se cambia: los links enviados y los pedidos ya están ligados a ella. Puedes sumar otras abajo.'
              : 'La que la gente comenta en el reel. No importan mayúsculas, tildes ni el plural (alfajor = Alfajores).'}
          </p>
        </div>

        <div>
          <label htmlFor="ra-otras" className={etiqueta}>Otras palabras que también valen (opcional)</label>
          <input id="ra-otras" value={f.otras} onChange={poner('otras')} placeholder="Ej. alfa, alfajorcito" className={campo} />
          <p className="mt-1.5 text-xs text-gris">Separadas por comas. Hasta {LIM.palabras} en total.</p>
        </div>

        <fieldset>
          <legend className={etiqueta}>Respuestas públicas al comentario</legend>
          <p className="-mt-0.5 mb-2 text-xs text-gris">Se alternan para que no se vea automático. Sin ninguna, solo se manda el DM.</p>
          <div className="flex flex-col gap-2">
            {f.respuestas.map((r, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={r}
                  aria-label={`Respuesta pública ${i + 1}`}
                  maxLength={LIM.largoRespuestaPublica}
                  onChange={(e) => setF((x) => ({ ...x, respuestas: x.respuestas.map((y, j) => (j === i ? e.target.value : y)) }))}
                  className={campo}
                />
                <button
                  type="button"
                  aria-label="Quitar respuesta"
                  onClick={() => setF((x) => ({ ...x, respuestas: x.respuestas.filter((_, j) => j !== i) }))}
                  className="grid w-11 shrink-0 place-items-center rounded-xl border border-borde text-gris transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
            {f.respuestas.length < LIM.respuestasPublicas && (
              <button
                type="button"
                onClick={() => setF((x) => ({ ...x, respuestas: [...x.respuestas, ''] }))}
                className="flex items-center gap-1.5 self-start rounded-lg px-2 py-1 text-xs font-bold text-acento-oscuro hover:bg-acento-suave"
              >
                <Plus size={14} aria-hidden="true" /> Agregar otra
              </button>
            )}
          </div>
        </fieldset>

        <div>
          <label htmlFor="ra-dm" className={etiqueta}>Mensaje del DM</label>
          <textarea
            id="ra-dm"
            rows={4}
            value={mensajeDm}
            onChange={poner('mensajeDm')}
            maxLength={LIM.largoMensajeDm}
            className={`${campo} resize-y`}
          />
          <p className="mt-1.5 text-xs text-gris">El link a WhatsApp se agrega solo al final. Mejor sin precios ni horas exactas.</p>
        </div>

        <div>
          <label htmlFor="ra-wa" className={etiqueta}>Lo que queda escrito en WhatsApp</label>
          <input id="ra-wa" value={mensajeWhatsapp} onChange={poner('mensajeWhatsapp')} maxLength={LIM.largoMensajeWhatsApp} className={campo} />
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
        <p className={etiqueta}>Vista previa</p>
        <div className="rounded-3xl bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5] p-[2px] shadow-lg">
          <div className="rounded-[22px] bg-hueso p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gris">Comentario</p>
            <p className="mt-1 text-sm">
              <strong>cliente</strong> {f.nombre ? f.nombre.toUpperCase() : 'ALFAJOR'} 😍
            </p>
            {respuestas[0] && (
              <p className="mt-1.5 border-l-2 border-borde pl-3 text-sm">
                <strong>bakebrothers.pe</strong> {respuestas[0]}
              </p>
            )}
            <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-gris">DM</p>
            <div className="mt-1.5 max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-crema px-3.5 py-2.5 text-sm leading-snug">
              {referencia ? textoDelDm(mensajeDm || '…', enlaceCorto(referencia)) : 'Escribe la palabra clave para ver el DM.'}
            </div>
            {referencia && (
              <>
                <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-gris">Al tocar el link, en WhatsApp</p>
                <div className="ml-auto mt-1.5 max-w-[88%] rounded-2xl rounded-tr-sm bg-[#D9FDD3] px-3.5 py-2.5 text-sm leading-snug">
                  {mensajeWhatsapp} <span className="text-gris">(ref: {referencia})</span>
                </div>
              </>
            )}
          </div>
        </div>

        {(error || (problemas.length > 0 && f.nombre.trim())) && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error || problemas[0]}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={guardando || problemas.length > 0}
            className="flex-1 rounded-xl bg-tinta px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:translate-y-0 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : regla ? 'Guardar cambios' : 'Crear y activar'}
          </button>
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-xl border border-borde bg-hueso px-4 py-3 text-sm font-semibold text-tinta transition-colors hover:border-acento"
          >
            Cancelar
          </button>
        </div>
      </div>
    </form>
  )
}
