import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cookie } from 'lucide-react'
import { alAbrirPreferencias, guardarConsentimiento, leerConsentimiento } from '../../utils/consentimiento'

// Aviso de cookies de estadísticas (Google Analytics vía GTM): una barra de TODO el ancho pegada abajo. Aparece solo si la
// persona todavía no eligió, un momento después de cargar la página (para no competir con el video del inicio), y se puede
// volver a abrir desde el pie («Preferencias de cookies»). Las dos opciones pesan lo mismo: aceptar no está más
// destacado que rechazar.
//
// Colores: el naranja de marca solo decora el ícono; los botones son tinta/blanco para que el texto cumpla el contraste.
// El contenido se alinea con el resto del sitio (`page-container`). Mientras la barra está en pantalla publica su alto en
// la variable CSS `--aviso-cookies-alto`, y el botón flotante de WhatsApp se sube esa altura para no quedar tapado.
const RETRASO_INICIAL_MS = 1400
const DURACION_MS = 300
const VARIABLE_ALTO = '--aviso-cookies-alto'

export default function AvisoCookies() {
  const [montado, setMontado] = useState(false) // está en el DOM
  const [visible, setVisible] = useState(false) // ya entró (para animar la entrada y la salida)
  const temporizador = useRef(null)
  const barra = useRef(null)

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

  // Publica el alto real de la barra (cambia con el ancho de la pantalla) para que el botón flotante se acomode.
  useLayoutEffect(() => {
    const raiz = document.documentElement
    const poner = () => raiz.style.setProperty(VARIABLE_ALTO, visible && barra.current ? `${barra.current.offsetHeight}px` : '0px')
    poner()
    if (!visible || !barra.current || typeof ResizeObserver === 'undefined') return () => raiz.style.setProperty(VARIABLE_ALTO, '0px')
    const observador = new ResizeObserver(poner)
    observador.observe(barra.current)
    return () => {
      observador.disconnect()
      raiz.style.setProperty(VARIABLE_ALTO, '0px')
    }
  }, [visible])

  const elegir = (estado) => {
    guardarConsentimiento(estado)
    cerrar()
  }

  if (!montado) return null

  return (
    <section
      ref={barra}
      role="region"
      aria-labelledby="titulo-aviso-cookies"
      className={`fixed inset-x-0 bottom-0 z-[60] transition-all duration-300 ease-out motion-reduce:transition-none ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}
    >
      <div className="rounded-t-3xl border-t border-borde bg-hueso pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-14px_40px_-14px_rgba(22,17,13,0.28)] sm:rounded-none">
        <div className="page-container flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
          <div className="flex items-start gap-3.5 sm:items-center">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-acento-suave text-acento-oscuro">
              <Cookie size={22} aria-hidden="true" />
            </span>
            <div className="min-w-0 max-w-3xl">
              {/* Un <p> y no un <h2>: es un aviso flotante, no una sección de la página (no debe entrar en el esquema de títulos ni en el SEO). */}
              <p id="titulo-aviso-cookies" className="font-display text-lg font-semibold leading-tight text-tinta">
                ¿Una cookie con tu café?
              </p>
              <p className="mt-1 text-sm leading-relaxed text-gris">
                Usamos cookies de estadísticas para saber qué se antoja más y mejorar la web. Solo las activamos si nos dices que sí.{' '}
                <Link to="/privacidad" className="font-semibold text-tinta underline underline-offset-2">
                  Más información
                </Link>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:flex sm:shrink-0">
            <button
              type="button"
              onClick={() => elegir('rechazadas')}
              className="min-h-11 rounded-full border border-borde bg-white px-3 text-sm font-bold text-tinta transition-colors hover:bg-crema sm:px-7"
            >
              Solo necesarias
            </button>
            <button
              type="button"
              onClick={() => elegir('aceptadas')}
              className="min-h-11 rounded-full bg-tinta px-3 text-sm font-bold text-white transition-opacity hover:opacity-85 sm:px-9"
            >
              Aceptar
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
