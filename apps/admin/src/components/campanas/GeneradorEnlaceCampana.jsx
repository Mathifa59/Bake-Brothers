import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, ExternalLink, Link2, MessageCircle } from 'lucide-react'
import { NUMERO_WHATSAPP_ATENCION, REDES_CAMPANA, enlaceWhatsAppCampana, referenciaDeCampana } from '@bakebrothers/domain'
import { EncabezadoBloque, Pill, Tarjeta } from '../bakeos/ui'

// El número que atiende a los clientes (el del bot). Mismo valor por defecto que la web; se pisa con VITE_WHATSAPP_NUMBER.
const NUMERO = import.meta.env.VITE_WHATSAPP_NUMBER || NUMERO_WHATSAPP_ATENCION

const mensajePorDefecto = (palabra) =>
  palabra.trim() ? `Hola Bake Brothers 👋 Vengo por lo de ${palabra.trim().toLowerCase()}` : 'Hola Bake Brothers 👋'

/**
 * Arma el link de WhatsApp de una campaña de redes (ManyChat: «comenta ALFAJOR y te mando el link»). El link abre el
 * chat del bot con el mensaje escrito y «(ref: ig-alfajor)» al final; el bot guarda esa referencia en el pedido y el
 * resultado se ve en esta misma pantalla, «Por campaña». No guarda nada: el link sale siempre igual de la red y el nombre.
 */
export default function GeneradorEnlaceCampana() {
  const [red, setRed] = useState('ig')
  const [palabra, setPalabra] = useState('')
  const [mensaje, setMensaje] = useState(mensajePorDefecto(''))
  const [mensajeEditado, setMensajeEditado] = useState(false)
  const [copiado, setCopiado] = useState(false)

  // Mientras la persona no escriba su propio mensaje, el mensaje sigue a la palabra clave.
  useEffect(() => {
    if (!mensajeEditado) setMensaje(mensajePorDefecto(palabra))
  }, [palabra, mensajeEditado])

  const referencia = useMemo(() => referenciaDeCampana(red, palabra), [red, palabra])
  const enlace = useMemo(
    () => (referencia ? enlaceWhatsAppCampana({ numero: NUMERO, referencia, mensaje: mensaje || mensajePorDefecto(palabra) }) : null),
    [referencia, mensaje, palabra]
  )

  useEffect(() => setCopiado(false), [enlace])

  async function copiar() {
    if (!enlace) return
    try {
      await navigator.clipboard.writeText(enlace)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      // Sin permiso de portapapeles: se selecciona el texto para copiarlo a mano.
      document.getElementById('enlace-campana')?.select()
    }
  }

  return (
    <Tarjeta className="mt-5 overflow-hidden p-0">
      <div className="bg-gradient-to-br from-acento-suave via-hueso to-lila-suave/60 p-5">
        <EncabezadoBloque
          etiqueta="ManyChat · Instagram y Facebook"
          titulo="Crea el link de WhatsApp de una campaña"
          derecha={
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-tinta text-white shadow-md">
              <Link2 size={18} aria-hidden="true" />
            </span>
          }
        />
        <p className="max-w-2xl text-sm leading-relaxed text-gris">
          Para respuestas automáticas del tipo «comenta <strong className="text-tinta">ALFAJOR</strong> y te mandamos la promo».
          Pega este link en el botón «Pedir por WhatsApp» del mensaje de ManyChat: quien lo toque llega al chat de Bake
          Brothers y su pedido queda registrado con esta campaña.
        </p>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-4">
          <fieldset>
            <legend className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gris">Red</legend>
            <div className="flex gap-1 rounded-xl border border-borde bg-crema p-1" role="group">
              {REDES_CAMPANA.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRed(r.id)}
                  aria-pressed={red === r.id}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                    red === r.id ? 'bg-tinta text-white shadow-sm' : 'text-gris hover:bg-hueso hover:text-tinta'
                  }`}
                >
                  {r.nombre}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="palabra-campana" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gris">
              Palabra clave o nombre de la campaña
            </label>
            <input
              id="palabra-campana"
              value={palabra}
              onChange={(e) => setPalabra(e.target.value)}
              placeholder="Ej. ALFAJOR"
              maxLength={40}
              autoComplete="off"
              className="w-full rounded-xl border border-borde bg-hueso px-3.5 py-2.5 text-sm font-semibold uppercase tracking-wide outline-none transition-colors placeholder:normal-case placeholder:font-normal placeholder:tracking-normal focus:border-acento focus:ring-2 focus:ring-acento/20"
            />
            <p className="mt-1.5 text-xs text-gris">La misma palabra que la gente comenta en el reel. Úsala igual en todas las publicaciones de esa campaña.</p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor="mensaje-campana" className="block text-xs font-bold uppercase tracking-wide text-gris">
                Mensaje que se escribe solo
              </label>
              {mensajeEditado && (
                <button
                  type="button"
                  onClick={() => setMensajeEditado(false)}
                  className="text-xs font-bold text-acento-oscuro hover:underline"
                >
                  Volver al sugerido
                </button>
              )}
            </div>
            <textarea
              id="mensaje-campana"
              value={mensaje}
              onChange={(e) => {
                setMensaje(e.target.value)
                setMensajeEditado(true)
              }}
              rows={2}
              maxLength={200}
              className="w-full resize-none rounded-xl border border-borde bg-hueso px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-acento focus:ring-2 focus:ring-acento/20"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gris">Así le llega al chat</p>
          <div className="rounded-2xl bg-[#E7DDD3] p-4">
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#D9FDD3] px-3.5 py-2.5 text-sm leading-snug text-tinta shadow-sm">
              {mensaje || mensajePorDefecto(palabra)}
              {referencia && <span className="text-gris"> (ref: {referencia})</span>}
            </div>
          </div>

          {referencia ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gris">
                <span>Se verá en «Por campaña» como</span>
                <Pill tono="prioridad">{referencia}</Pill>
              </div>
              <label htmlFor="enlace-campana" className="sr-only">
                Link de la campaña
              </label>
              <input
                id="enlace-campana"
                readOnly
                value={enlace}
                onFocus={(e) => e.target.select()}
                className="w-full truncate rounded-xl border border-borde bg-crema px-3.5 py-2.5 font-mono text-xs text-tinta outline-none focus:border-acento"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copiar}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${
                    copiado ? 'bg-ok' : 'bg-tinta'
                  }`}
                >
                  {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                  {copiado ? 'Copiado' : 'Copiar link'}
                </button>
                <a
                  href={enlace}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-borde bg-hueso px-4 py-3 text-sm font-semibold text-tinta transition-colors hover:border-acento hover:text-acento-oscuro"
                >
                  <ExternalLink size={16} aria-hidden="true" />
                  Probar
                </a>
              </div>
            </>
          ) : (
            <p className="flex items-start gap-2 rounded-xl bg-crema p-3.5 text-sm text-gris">
              <MessageCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              Escribe la palabra clave para generar el link.
            </p>
          )}
        </div>
      </div>
    </Tarjeta>
  )
}
