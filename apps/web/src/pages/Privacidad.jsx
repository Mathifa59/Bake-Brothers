import { useEffect } from 'react'
import { whatsappNumeroFormateado, whatsappUrl } from '../utils/whatsapp'

const ACTUALIZADO = '5 de noviembre de 2026'

function Seccion({ titulo, children }) {
  return (
    <section className="mt-9">
      <h2 className="font-display text-2xl font-semibold text-tinta">{titulo}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-gris">{children}</div>
    </section>
  )
}

/** Política de privacidad (bake-brothers.com/privacidad). Meta la exige para poner la app de WhatsApp en modo Live. */
export default function Privacidad() {
  useEffect(() => {
    document.title = 'Política de privacidad · Bake Brothers'
  }, [])

  return (
    <article className="page-container max-w-3xl py-16 sm:py-20">
      <h1 className="font-display text-4xl font-semibold text-tinta sm:text-5xl">Política de privacidad</h1>
      <p className="mt-3 text-sm text-gris">Última actualización: {ACTUALIZADO}</p>

      <p className="mt-6 leading-relaxed text-gris">
        En Bake Brothers cuidamos tus datos. Esta página explica qué información guardamos cuando nos escribes o haces un pedido, para qué
        la usamos, con quién la compartimos y cómo puedes pedir que la borremos.
      </p>

      <Seccion titulo="Quiénes somos">
        <p>
          Bake Brothers es una pastelería con locales en Chorrillos, Lima. Las ventas se hacen a través de dos razones sociales según el
          local: Corporación Hermanos Loarte S.A.C. (Cedros) y BAKER BROTHERS E.I.R.L. (Santa Marina). Ambas son responsables del tratamiento
          de tus datos, conforme a la Ley N.° 29733, Ley de Protección de Datos Personales del Perú.
        </p>
      </Seccion>

      <Seccion titulo="Qué datos guardamos">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Tu nombre y tu número de teléfono (el de WhatsApp desde el que nos escribes).</li>
          <li>Tus pedidos: qué compraste, el local o la dirección de entrega, la fecha, el monto y el medio de pago.</li>
          <li>Los mensajes de tus conversaciones con nosotros por WhatsApp, Instagram o Facebook, incluidas las imágenes que nos envíes.</li>
          <li>Si nos mandas la captura de un pago, los datos que se leen de ella: monto, fecha y número de operación. No guardamos la imagen.</li>
        </ul>
        <p>No te pedimos datos que no necesitemos para atender tu pedido, y nunca te pediremos claves ni datos de tu tarjeta por chat.</p>
      </Seccion>

      <Seccion titulo="Para qué los usamos">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Atender tus consultas y preparar, cobrar y entregar tus pedidos.</li>
          <li>Avisarte cómo va tu pedido.</li>
          <li>Responder reclamos y cumplir obligaciones legales y tributarias.</li>
          <li>Entender qué productos y campañas funcionan mejor (de forma agregada, sin publicar tus datos).</li>
        </ul>
        <p>No vendemos tus datos ni los usamos para nada distinto de lo anterior.</p>
      </Seccion>

      <Seccion titulo="Asistente con inteligencia artificial">
        <p>
          Parte de la atención por WhatsApp la hace un asistente que usa inteligencia artificial: responde preguntas sobre productos, precios y
          horarios, y puede tomar pedidos sencillos. El asistente no confirma por sí solo los pagos, y los casos delicados (reclamos, alergias,
          pedidos de catering o cualquier cosa que no pueda resolver) pasan a una persona del equipo. Siempre puedes pedir hablar con una persona.
        </p>
        <p>
          Para funcionar, el texto de tu conversación se procesa con el servicio de inteligencia artificial de Anthropic. Esos textos se usan
          únicamente para responderte.
        </p>
      </Seccion>

      <Seccion titulo="Con quién compartimos los datos">
        <p>Solo con los proveedores que hacen posible el servicio, cada uno para su función:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Meta (WhatsApp, Instagram y Facebook), por donde recibimos y enviamos los mensajes.</li>
          <li>Anthropic, que opera el asistente de inteligencia artificial.</li>
          <li>Supabase y nuestros servicios de alojamiento, donde se guardan los datos de forma protegida.</li>
          <li>Mifact, para emitir comprobantes electrónicos cuando corresponda.</li>
        </ul>
        <p>También podemos compartirlos con autoridades cuando la ley lo exija.</p>
      </Seccion>

      <Seccion titulo="Cuánto tiempo los guardamos">
        <p>
          Guardamos tus datos mientras sean necesarios para atenderte y para cumplir las obligaciones legales y tributarias que nos aplican.
          Pasado ese tiempo los eliminamos o los dejamos sin posibilidad de identificarte.
        </p>
      </Seccion>

      <Seccion titulo="Tus derechos y cómo pedir que borremos tus datos">
        <p>
          Puedes pedirnos acceder a tus datos, corregirlos, que dejemos de usarlos o que los borremos. Para borrar tus datos escríbenos por
          WhatsApp al{' '}
          <a href={whatsappUrl('Hola, quiero que borren mis datos personales.')} className="font-semibold text-acento-oscuro underline">
            {whatsappNumeroFormateado}
          </a>{' '}
          con el mensaje «Quiero que borren mis datos», desde el mismo número con el que nos escribes, o por mensaje directo en nuestro
          Instagram o Facebook (@bakebrothers.pe). Una persona del equipo confirmará tu identidad y atenderá tu solicitud dentro de los plazos
          que fija la ley. Algunos datos de pedidos y comprobantes pueden tener que conservarse por obligación legal; si es así, te lo
          explicaremos.
        </p>
        <p>
          Si crees que tus datos no se tratan correctamente, también puedes acudir a la Autoridad Nacional de Protección de Datos Personales del
          Ministerio de Justicia y Derechos Humanos.
        </p>
      </Seccion>

      <Seccion titulo="Cambios en esta política">
        <p>Si cambiamos algo importante, actualizaremos esta página y la fecha de arriba.</p>
      </Seccion>
    </article>
  )
}
