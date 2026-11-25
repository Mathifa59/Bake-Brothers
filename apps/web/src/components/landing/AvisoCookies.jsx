import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cookie } from 'lucide-react'
import { alAbrirPreferencias, guardarConsentimiento, leerConsentimiento } from '../../utils/consentimiento'

// Aviso de cookies de estadísticas (Google Analytics vía GTM). Aparece solo si la persona todavía no eligió, un
// momento después de cargar la página (para no competir con el video del inicio) y se puede volver a abrir desde el pie
// («Preferencias de cookies»). Las dos opciones pesan lo mismo: aceptar no está más destacado que rechazar.
//
// Colores: el naranja de marca solo decora el ícono; los botones son tinta/blanco para que el texto cumpla el contraste.
// En celular es una tarjeta pegada abajo (ancho completo menos el margen); desde `sm` queda abajo a la izquierda, lejos
// del botón flotante de WhatsApp, que vive abajo a la derecha.
const RETRASO_INICIAL_MS = 1400
const DURACION_MS = 300

export default function AvisoCookies() {
  const [montado, setMontado] = useState(false) // está en el DOM
  const [visible, setVisible] = useState(false) // ya entró (para animar la entrada y la salida)
  const temporizador = useRef(null)

  const abrir = () => {
    clearTimeout(temporizador.current)
    setMontado(true)
    // Un instante después de montarlo, para que la transición de entrada tenga un estado inicial desde dónde partir.
    temporizador.current = setTimeout(() => setVisible(true), 30)
  }

  const cerrar = () => {
    setVisible(false)
    temporizador.current = setTimeout(() => setMontado(false), DURACION_MS)
  }

  useEffect(() => {
    if (leerConsentimiento() === null) temporizador.current = setTimeout(abrir, RETRASO_INICIAL_MS)
    const quitar = alAbrirPreferencias(abrir)
    return () => {
      clearTimeout(temporizador.current)
      quitar()
    }
  }, [])

  const elegir = (estado) => {
    guardarConsentimiento(estado)
    cerrar()
  }

  if (!montado) return null

  return (
    <section
      role="region"
      aria-labelledby="titulo-aviso-cookies"
      className={`fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[60] transition-all duration-300 ease-out motion-reduce:transition-none sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-[24rem] ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      }`}
    >
      <div className="rounded-3xl border border-borde bg-hueso p-5 shadow-2xl shadow-tinta/20">
        <div className="flex items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-acento-suave text-acento-oscuro">
            <Cookie size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            {/* Un <p> y no un <h2>: es un aviso flotante, no una sección de la página (no debe entrar en el esquema de títulos ni en el SEO). */}
            <p id="titulo-aviso-cookies" className="font-display text-lg font-semibold leading-tight text-tinta">
              ¿Una cookie con tu café?
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-gris">
              Usamos cookies de estadísticas para saber qué se antoja más y mejorar la web. Solo las activamos si nos dices que sí.{' '}
              <Link to="/privacidad" className="font-semibold text-tinta underline underline-offset-2">
                Más información
              </Link>
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => elegir('rechazadas')}
            className="min-h-11 rounded-full border border-borde bg-white px-3 text-sm font-bold text-tinta transition-colors hover:bg-crema"
          >
            Solo necesarias
          </button>
          <button
            type="button"
            onClick={() => elegir('aceptadas')}
            className="min-h-11 rounded-full bg-tinta px-3 text-sm font-bold text-white transition-opacity hover:opacity-85"
          >
            Aceptar
          </button>
        </div>
      </div>
    </section>
  )
}
