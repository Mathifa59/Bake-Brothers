import { whatsappUrl } from '../../utils/whatsapp'

// Link a WhatsApp reusado por cada CTA de la landing (botón flotante, cada
// video, cada empanada, el cierre). Deja listo el enganche de analítica que
// pide la tarea — un data-attribute y un CustomEvent 'whatsapp_click' con el
// nombre del producto — sin integrar ninguna herramienta todavía: quien
// conecte GTM/analítica después puede escuchar cualquiera de los dos.
export default function WhatsAppCTA({ mensaje, producto, className, children, onClick, ariaLabel }) {
  const dispararEvento = () => {
    window.dispatchEvent(new CustomEvent('whatsapp_click', { detail: { producto } }))
    onClick?.()
  }

  return (
    <a
      href={whatsappUrl(mensaje)}
      target="_blank"
      rel="noopener noreferrer"
      data-whatsapp-click={producto}
      onClick={dispararEvento}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </a>
  )
}
