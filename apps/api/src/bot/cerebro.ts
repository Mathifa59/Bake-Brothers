import Anthropic from '@anthropic-ai/sdk'
import type pg from 'pg'
import { puedeTransicionarConversacion, type EstadoConversacion } from '@bakebrothers/domain'
import {
  consultarPrecio,
  consultarDisponibilidad,
  consultarCombo,
  consultarReglasCatering,
  evaluarSemaforoCateringPedido,
} from './tools.js'
import { crearPedido, type CrearPedidoInput, type ItemPedidoInput } from '../services/crearPedido.js'

type Canal = 'whatsapp' | 'facebook' | 'instagram' | 'web'

/**
 * El "cerebro" de conversación del bot: dado un mensaje de texto entrante,
 * decide qué responder (vía tool-use real contra el catálogo, nunca de
 * memoria) y si la conversación debe escalar a un operador humano.
 *
 * Todavía no conectado a nada real (ni webhook ni envío de mensajes) — ver
 * la instrucción original. `evaluarTurno` es la lógica aislada y testeable;
 * `procesarMensajeEntrante` es el único punto que toca `conversaciones`.
 */

const MODELO = 'claude-sonnet-5'

// Límite duro del loop de tool-use: sin esto, un caso raro donde el modelo
// no quede "satisfecho" con el resultado de una tool podría loopear
// indefinido (y quemar plata real en cada vuelta). Si se llega al límite sin
// una respuesta final, se fuerza un mensaje de espera y se escala — nunca se
// deja a un cliente real sin respuesta.
export const MAX_VUELTAS_TOOL_USE = 6

// Filtro determinístico, corre ANTES de llamar al modelo — nunca depende del
// LLM ni de lo que devuelva el RAG (ver la instrucción original: "siempre,
// sin importar lo que diga el RAG"). Cubre las formas reales en que un
// cliente escribe esto en español, no exhaustivo por regex "perfecto", pero
// sí las variantes documentadas en la fuente (alergias/intolerancias/"libre de").
const REGEX_ALERGIA = /alergi|al[eé]rgic|intoleran|cel[ií]ac|libre de/i

const RESPUESTA_ALERGIA_FIJA =
  '¡Gracias por contarnos! 🙏 Para temas de alergias, intolerancias o consultas "libre de" preferimos que te ayude directo alguien del equipo, así te confirmamos con total seguridad — en un toque te contactamos por acá.'

// Cuando el código fuerza la escalada (ver decidirEscaladaForzadaPorTool) sin
// que el modelo haya llamado a escalarAHumano por su cuenta, el texto final
// que el modelo generó en esa misma vuelta puede ser una confirmación
// indebida (lo escribió sin saber que se estaba forzando la escalada) — no
// se le puede mandar tal cual al cliente. Se reemplaza por este mensaje fijo,
// que nunca confirma nada, solo avisa que queda pendiente de revisión.
export const RESPUESTA_ESCALADA_FORZADA_FIJA =
  'Dame un toque — antes de confirmarte esto quiero que lo revise el equipo, así te aseguro bien los detalles 🙏 En un momento te escriben para cerrarlo.'

const SYSTEM_PROMPT = `Sos el asistente de WhatsApp/redes de Bake Brothers, una pastelería de Chorrillos, Lima. Hablás con clientes reales — tono cercano, podés usar emojis y tutear. Nunca uses "oki", "oka" ni "porfis".

REGLAS DURAS, sin excepción:

1. Nunca digas un precio, disponibilidad o condición de un combo de memoria. Siempre llamá a la tool correspondiente (consultarPrecio, consultarDisponibilidad, consultarCombo) y respondé solo con el dato real que te devuelve. Si la tool no encuentra el producto/combo (te devuelve null), decilo con honestidad — nunca inventes un precio, una disponibilidad ni una condición.

2. Catering: antes de confirmar o cotizar CUALQUIER pedido de catering (cantidad + fecha de entrega), llamá siempre a evaluarSemaforoCateringPedido — nunca lo calcules ni lo supongas vos.
   - Resultado verde: podés confirmar con naturalidad.
   - Resultado amarillo o rojo: NO prometas ni confirmes nada. Llamá a escalarAHumano con un motivo breve, y avisale al cliente con calidez que lo vas a conectar con el equipo para confirmar los detalles — nunca digas que "no se puede", solo que lo vas a consultar.
   - Podés usar consultarReglasCatering si necesitás los datos crudos de un ítem para explicarle algo al cliente, pero la decisión de verde/amarillo/rojo siempre pasa por evaluarSemaforoCateringPedido.

3. Escalá a una persona del equipo (llamando a escalarAHumano con un motivo breve) SIEMPRE ante:
   - Reclamos o quejas.
   - Pedidos de reembolso.
   - Problemas con el pago.
   - Un cliente molesto o disconforme.
   - Delivery perdido o retrasado.
   - Cuando el cliente menciona o manda una imagen de referencia para una torta personalizada (nunca prometas ese diseño vos).
   - Cualquier mención de alergia, intolerancia o consulta "libre de".
   - Cualquier caso de catering en amarillo o rojo (ver regla 2).
   No uses escalarAHumano para preguntas que simplemente no sabés responder — ahí admití con honestidad que no tenés esa info y ofrecele la opción de conectarlo con alguien del equipo, sin forzar la derivación vos.

4. Nunca inventes datos de precio, stock, ingredientes, alérgenos ni reglas de catering — si no tenés la tool para algo, decilo.

5. Podés registrar un pedido real con crearPedido cuando el cliente confirma que quiere comprar. Antes de llamarla:
   - Pedile SIEMPRE el teléfono de contacto, incluso en WhatsApp aunque ya tengas el número de quien te escribe — quien escribe no es necesariamente quien recibe el pedido, no asumas que es el mismo.
   - Juntá nombre, producto(s) y cantidad, fecha de entrega, y si es recojo en tienda o delivery (con dirección) — nunca cotices ni prometas el costo del delivery, eso lo cotiza el operador a mano.
   - Si el producto es un jugo o helado, preguntá con azúcar o sin azúcar; si son empanadas, preguntá calientes o sin calentar — anotá la respuesta en el campo nota.
   - Para CATERING: nunca llames a crearPedido si evaluarSemaforoCateringPedido no dio verde para ese ítem — en amarillo/rojo escalá (regla 2), no fuerces el pedido. crearPedido igual vuelve a verificar esto del lado del servidor.
   - Si el cliente te dice que va a pagar por adelantado, marcá pagoPorAdelantado en true. Nunca proceses ni verifiques ningún comprobante de pago (captura, voucher) — eso lo revisa el equipo a mano. Hoy todavía no podés ver imágenes: si el cliente manda una captura de pago, avisale con calidez que el pedido ya quedó registrado y que el equipo confirma el pago, sin intentar describir ni validar la imagen.
   - Si crearPedido devuelve un error, no inventes un número de pedido — contale al cliente lo que pasó con honestidad (ej. producto no disponible, dirección faltante) y ofrecé ayudarlo a resolverlo.

Respondé siempre en español, breve y natural, como un mensaje real de WhatsApp — no un párrafo largo.`

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'consultarPrecio',
    description:
      'Consulta el precio real, disponibilidad general y tamaños de un producto de tienda (tortas, kekes, alfajores, etc.) por nombre o texto aproximado. Nunca respondas un precio sin llamar antes a esta tool.',
    input_schema: {
      type: 'object',
      properties: {
        busqueda: {
          type: 'string',
          description: 'Nombre o texto aproximado del producto, tal como lo escribió el cliente (ej. "carrot cake").',
        },
      },
      required: ['busqueda'],
    },
  },
  {
    name: 'consultarDisponibilidad',
    description: 'Consulta si un producto de tienda está disponible ahora, en general y por sede.',
    input_schema: {
      type: 'object',
      properties: {
        busqueda: { type: 'string', description: 'Nombre o texto aproximado del producto.' },
      },
      required: ['busqueda'],
    },
  },
  {
    name: 'consultarCombo',
    description:
      'Consulta un combo/paquete de precio fijo: qué incluye, precio, canal permitido y si admite cambios de sabor/producto.',
    input_schema: {
      type: 'object',
      properties: {
        busqueda: { type: 'string', description: 'Nombre o texto aproximado del combo.' },
      },
      required: ['busqueda'],
    },
  },
  {
    name: 'consultarReglasCatering',
    description:
      'Consulta las reglas crudas de un ítem de catering (mínimo de unidades, si sale el mismo día, horas de anticipación). Para saber si un pedido específico está en verde/amarillo/rojo usá evaluarSemaforoCateringPedido, no calcules esto vos.',
    input_schema: {
      type: 'object',
      properties: {
        busqueda: { type: 'string', description: 'Nombre o texto aproximado del ítem de catering.' },
      },
      required: ['busqueda'],
    },
  },
  {
    name: 'evaluarSemaforoCateringPedido',
    description:
      'Evalúa el semáforo (verde/amarillo/rojo) de un pedido de catering real: cantidad y fecha de entrega contra las reglas del ítem. Llamala siempre antes de confirmar o cotizar un pedido de catering.',
    input_schema: {
      type: 'object',
      properties: {
        busquedaItem: { type: 'string', description: 'Nombre o texto aproximado del ítem de catering.' },
        cantidadSolicitada: { type: 'number', description: 'Cantidad de unidades que pide el cliente.' },
        fechaEntregaISO: { type: 'string', description: 'Fecha de entrega, formato YYYY-MM-DD.' },
      },
      required: ['busquedaItem', 'cantidadSolicitada', 'fechaEntregaISO'],
    },
  },
  {
    name: 'crearPedido',
    description:
      'Registra un pedido real (recalcula el precio en el servidor, nunca confía en un precio que vos calcules). Úsala solo para casos verdes: productos de tienda normales, o catering ya confirmado en verde por evaluarSemaforoCateringPedido. Siempre pedile el teléfono al cliente antes de llamarla, aunque ya conozcas el número de WhatsApp de quien escribe.',
    input_schema: {
      type: 'object',
      properties: {
        clienteNombre: { type: 'string', description: 'Nombre del cliente.' },
        clienteTelefono: {
          type: 'string',
          description: 'Teléfono de contacto — pedíselo siempre al cliente, no asumas que es el número de quien te escribe.',
        },
        tipoEntrega: { type: 'string', enum: ['tienda', 'delivery'], description: '"tienda" = recojo en local.' },
        direccion: { type: 'string', description: 'Requerida si tipoEntrega es delivery.' },
        distrito: { type: 'string', description: 'Requerido si tipoEntrega es delivery.' },
        referencia: { type: 'string' },
        fechaEntregaISO: { type: 'string', description: 'Fecha de entrega, formato YYYY-MM-DD.' },
        horario: { type: 'string', description: 'Horario acordado con el cliente, en texto libre.' },
        items: {
          type: 'array',
          description: 'Uno o más productos/ítems de catering del pedido.',
          items: {
            type: 'object',
            properties: {
              tipo: { type: 'string', enum: ['producto', 'catering'] },
              busqueda: { type: 'string', description: 'Nombre o texto aproximado del producto o ítem de catering.' },
              tamano: { type: 'string', description: 'Solo para tipo "producto", si el producto tiene tamaños.' },
              cantidad: { type: 'number' },
            },
            required: ['tipo', 'busqueda', 'cantidad'],
          },
        },
        metodoPago: { type: 'string', enum: ['yape', 'plin', 'transferencia', 'tarjeta', 'contraentrega'] },
        pagoPorAdelantado: {
          type: 'boolean',
          description: 'true si el cliente dijo que va a pagar antes de la entrega (no si ya pagó ni si vas a verificar un comprobante).',
        },
        nota: {
          type: 'string',
          description: 'Preferencias del cliente por producto (ej. "jugo sin azúcar", "empanadas calientes") y cualquier otro detalle libre.',
        },
      },
      required: [
        'clienteNombre', 'clienteTelefono', 'tipoEntrega', 'fechaEntregaISO', 'horario', 'items', 'metodoPago', 'pagoPorAdelantado',
      ],
    },
  },
  {
    name: 'escalarAHumano',
    description:
      'Deriva la conversación a una persona del equipo de Ventas en vez de resolverla vos. Usala ante reclamos, reembolsos, problemas de pago, cliente molesto, delivery perdido/retrasado, torta personalizada con imagen de referencia, alergias/intolerancias, o catering en amarillo/rojo. No la uses para preguntas que simplemente no sabés responder.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: {
          type: 'string',
          description: 'Motivo breve de la escalada, para que el operador humano tenga contexto.',
        },
      },
      required: ['motivo'],
    },
  },
]

export interface TurnoHistorial {
  rol: 'cliente' | 'bot' | 'operador'
  texto: string
  en: string
}

export interface ResultadoTurno {
  textoRespuesta: string
  nuevoEstado: EstadoConversacion
  herramientasUsadas: string[]
  motivoEscalacion?: string
}

function obtenerApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY no está configurada')
  return key
}

// Solo avanza el estado si la transición es válida según la máquina de
// conversationStatus.ts — nunca pisa un estado con uno que la máquina no
// permitiría (mismo criterio que ya usa apps/admin/useConversaciones.js).
function escalarSiCorresponde(actual: EstadoConversacion): EstadoConversacion {
  if (actual === 'escalada') return actual
  return puedeTransicionarConversacion(actual, 'escalada') ? 'escalada' : actual
}

type NombreToolDeDatos =
  | 'consultarPrecio'
  | 'consultarDisponibilidad'
  | 'consultarCombo'
  | 'consultarReglasCatering'
  | 'evaluarSemaforoCateringPedido'

async function ejecutarToolDeDatos(
  client: pg.PoolClient,
  tenantId: string,
  sedeId: string | undefined,
  nombre: NombreToolDeDatos,
  input: unknown
): Promise<unknown> {
  const i = (input ?? {}) as Record<string, unknown>
  switch (nombre) {
    case 'consultarPrecio':
      return consultarPrecio(client, tenantId, String(i.busqueda ?? ''))
    case 'consultarDisponibilidad':
      return consultarDisponibilidad(client, tenantId, String(i.busqueda ?? ''), sedeId)
    case 'consultarCombo':
      return consultarCombo(client, String(i.busqueda ?? ''))
    case 'consultarReglasCatering':
      return consultarReglasCatering(client, String(i.busqueda ?? ''))
    case 'evaluarSemaforoCateringPedido':
      return evaluarSemaforoCateringPedido(client, String(i.busquedaItem ?? ''), {
        cantidadSolicitada: Number(i.cantidadSolicitada),
        fechaEntregaISO: String(i.fechaEntregaISO ?? ''),
      })
  }
}

function esNombreToolDeDatos(nombre: string): nombre is NombreToolDeDatos {
  return (
    nombre === 'consultarPrecio' ||
    nombre === 'consultarDisponibilidad' ||
    nombre === 'consultarCombo' ||
    nombre === 'consultarReglasCatering' ||
    nombre === 'evaluarSemaforoCateringPedido'
  )
}

/**
 * La garantía que NO depende del modelo: si el resultado real de
 * evaluarSemaforoCateringPedido es amarillo/rojo, la conversación escala
 * aunque el modelo no llame a escalarAHumano por su cuenta. Extraída aparte
 * (sin I/O) para poder probarla de forma aislada, sin depender de que el LLM
 * real se comporte de cierta manera — ver apps/api/test/cerebroForzado.test.ts.
 */
export function decidirEscaladaForzadaPorTool(
  nombreTool: string,
  resultadoTool: unknown
): { forzar: boolean; motivo?: string } {
  if (nombreTool === 'evaluarSemaforoCateringPedido' && (resultadoTool === 'amarillo' || resultadoTool === 'rojo')) {
    return { forzar: true, motivo: `Semáforo de catering en ${resultadoTool} — no se confirma sin operador.` }
  }
  // Misma garantía que arriba, pero para cuando el modelo saltó directo a
  // crearPedido con un ítem de catering que no está verde — crearPedido ya
  // lo rechaza y no crea nada, pero además fuerza la escalada acá, igual
  // que si hubiera llamado a evaluarSemaforoCateringPedido primero.
  if (
    nombreTool === 'crearPedido' &&
    typeof resultadoTool === 'object' &&
    resultadoTool !== null &&
    'ok' in resultadoTool &&
    (resultadoTool as { ok: boolean }).ok === false &&
    (resultadoTool as { error?: string }).error === 'CATERING_NO_VERDE'
  ) {
    return { forzar: true, motivo: 'Se intentó crear un pedido de catering que no está en verde — requiere revisión del equipo.' }
  }
  return { forzar: false }
}

/** Traduce el input crudo (JSON del tool call) al tipo fuerte que espera crearPedido. */
function construirInputCrearPedido(inputCrudo: unknown, sedeId: string | undefined): CrearPedidoInput {
  const i = (inputCrudo ?? {}) as Record<string, unknown>
  const items = Array.isArray(i.items) ? (i.items as Record<string, unknown>[]) : []
  return {
    cliente: {
      nombre: String(i.clienteNombre ?? ''),
      telefono: String(i.clienteTelefono ?? ''),
    },
    sedeId,
    tipoEntrega: i.tipoEntrega === 'delivery' ? 'delivery' : 'tienda',
    direccion: i.direccion ? String(i.direccion) : null,
    distrito: i.distrito ? String(i.distrito) : null,
    referencia: i.referencia ? String(i.referencia) : null,
    fechaEntregaISO: String(i.fechaEntregaISO ?? ''),
    horario: String(i.horario ?? ''),
    items: items.map(
      (item): ItemPedidoInput =>
        item.tipo === 'catering'
          ? { tipo: 'catering', busqueda: String(item.busqueda ?? ''), cantidad: Number(item.cantidad) }
          : {
              tipo: 'producto',
              busqueda: String(item.busqueda ?? ''),
              tamano: item.tamano ? String(item.tamano) : null,
              cantidad: Number(item.cantidad),
            }
    ),
    metodoPago: (['yape', 'plin', 'transferencia', 'tarjeta', 'contraentrega'] as const).includes(
      i.metodoPago as 'yape' | 'plin' | 'transferencia' | 'tarjeta' | 'contraentrega'
    )
      ? (i.metodoPago as 'yape' | 'plin' | 'transferencia' | 'tarjeta' | 'contraentrega')
      : 'yape',
    pagoPorAdelantado: i.pagoPorAdelantado === true,
    nota: i.nota ? String(i.nota) : null,
  }
}

/**
 * Decide qué responder a un mensaje entrante y si la conversación debe
 * escalar — sin tocar `conversaciones` (eso lo hace `procesarMensajeEntrante`).
 * `estadoActual` se asume ya normalizado a un estado donde el bot puede
 * responder (`activa` lo típico) — la reapertura `cerrada -> activa` la
 * resuelve el caller.
 */
export async function evaluarTurno(
  client: pg.PoolClient,
  tenantId: string,
  historialPrevio: TurnoHistorial[],
  mensajeEntrante: string,
  estadoActual: EstadoConversacion,
  canal: Canal,
  sedeId?: string
): Promise<ResultadoTurno> {
  if (REGEX_ALERGIA.test(mensajeEntrante)) {
    return {
      textoRespuesta: RESPUESTA_ALERGIA_FIJA,
      nuevoEstado: escalarSiCorresponde(estadoActual),
      herramientasUsadas: [],
      motivoEscalacion: 'Mención de alergia/intolerancia/"libre de" — escalada automática, sin pasar por el modelo.',
    }
  }

  const anthropic = new Anthropic({ apiKey: obtenerApiKey() })

  const mensajes: Anthropic.MessageParam[] = [
    ...historialPrevio.map(
      (h): Anthropic.MessageParam => ({
        role: h.rol === 'cliente' ? 'user' : 'assistant',
        content: h.texto,
      })
    ),
    { role: 'user', content: mensajeEntrante },
  ]

  const herramientasUsadas: string[] = []
  let debeEscalar = false
  let motivoEscalacion: string | undefined
  // Distingue "el modelo mismo decidió escalar" de "el código forzó la
  // escalada sin que el modelo se enterara" — solo en el segundo caso el
  // texto final del modelo no es confiable (lo escribió sin saber que se
  // estaba forzando la escalada) y hay que reemplazarlo.
  let elModeloLlamoEscalarAHumano = false

  for (let vuelta = 0; vuelta < MAX_VUELTAS_TOOL_USE; vuelta++) {
    const respuesta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: mensajes,
    })

    const bloquesTool = respuesta.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    )

    if (bloquesTool.length === 0) {
      const texto = respuesta.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()

      const escaladaForzadaSinAvisoDelModelo = debeEscalar && !elModeloLlamoEscalarAHumano
      const textoRespuesta = escaladaForzadaSinAvisoDelModelo
        ? RESPUESTA_ESCALADA_FORZADA_FIJA
        : texto || 'Perdona, no supe cómo responder eso — ¿querés que te contacte alguien del equipo?'

      return {
        textoRespuesta,
        nuevoEstado: debeEscalar ? escalarSiCorresponde(estadoActual) : estadoActual,
        herramientasUsadas,
        motivoEscalacion,
      }
    }

    mensajes.push({ role: 'assistant', content: respuesta.content })

    const resultadosTool: Anthropic.ToolResultBlockParam[] = []
    for (const bloque of bloquesTool) {
      herramientasUsadas.push(bloque.name)

      if (bloque.name === 'escalarAHumano') {
        debeEscalar = true
        elModeloLlamoEscalarAHumano = true
        motivoEscalacion = String((bloque.input as { motivo?: string } | undefined)?.motivo ?? 'Escalada solicitada por el bot.')
        resultadosTool.push({ type: 'tool_result', tool_use_id: bloque.id, content: 'Escalada registrada.' })
        continue
      }

      if (bloque.name === 'crearPedido') {
        try {
          const resultado = await crearPedido(client, tenantId, canal, construirInputCrearPedido(bloque.input, sedeId))
          const decision = decidirEscaladaForzadaPorTool(bloque.name, resultado)
          if (decision.forzar) {
            debeEscalar = true
            motivoEscalacion = decision.motivo
          }
          resultadosTool.push({ type: 'tool_result', tool_use_id: bloque.id, content: JSON.stringify(resultado) })
        } catch (err) {
          resultadosTool.push({
            type: 'tool_result',
            tool_use_id: bloque.id,
            content: `Error creando el pedido: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true,
          })
        }
        continue
      }

      if (!esNombreToolDeDatos(bloque.name)) {
        resultadosTool.push({
          type: 'tool_result',
          tool_use_id: bloque.id,
          content: 'Esa tool no existe.',
          is_error: true,
        })
        continue
      }

      try {
        const resultado = await ejecutarToolDeDatos(client, tenantId, sedeId, bloque.name, bloque.input)
        const decision = decidirEscaladaForzadaPorTool(bloque.name, resultado)
        if (decision.forzar) {
          debeEscalar = true
          motivoEscalacion = decision.motivo
        }
        resultadosTool.push({ type: 'tool_result', tool_use_id: bloque.id, content: JSON.stringify(resultado) })
      } catch (err) {
        resultadosTool.push({
          type: 'tool_result',
          tool_use_id: bloque.id,
          content: `Error consultando el dato: ${err instanceof Error ? err.message : String(err)}`,
          is_error: true,
        })
      }
    }
    mensajes.push({ role: 'user', content: resultadosTool })
  }

  // Se agotaron las vueltas del loop sin una respuesta final — nunca se deja
  // a un cliente real sin respuesta ni se loopea indefinido quemando plata.
  return {
    textoRespuesta: 'Dame un toque, quiero confirmar bien esto con el equipo antes de decirte algo 🙏',
    nuevoEstado: escalarSiCorresponde(estadoActual),
    herramientasUsadas,
    motivoEscalacion: motivoEscalacion ?? 'Se alcanzó el límite de iteraciones del loop de tool-use sin una respuesta final.',
  }
}

/**
 * Único punto que toca `conversaciones`: lee la fila real, delega en
 * `evaluarTurno` y persiste los dos turnos nuevos (cliente + bot) más el
 * estado. Si la conversación ya está escalada o con un operador, no hace
 * pasar el mensaje por el bot — solo lo deja en el historial, porque ya hay
 * una persona atendiendo esa conversación.
 */
export async function procesarMensajeEntrante(
  client: pg.PoolClient,
  tenantId: string,
  conversacionId: string,
  mensajeTexto: string
): Promise<ResultadoTurno | null> {
  const { rows } = await client.query(
    `select estado, historial, sede_id, canal from conversaciones where id = $1 and tenant_id = $2`,
    [conversacionId, tenantId]
  )
  const fila = rows[0]
  if (!fila) return null

  const historialPrevio = (fila.historial ?? []) as TurnoHistorial[]
  const estadoNormalizado: EstadoConversacion = fila.estado === 'cerrada' ? 'activa' : fila.estado

  const ahora = new Date().toISOString()
  const entradaCliente: TurnoHistorial = { rol: 'cliente', texto: mensajeTexto, en: ahora }

  if (estadoNormalizado === 'escalada' || estadoNormalizado === 'atendida_por_operador') {
    await client.query(
      `update conversaciones set historial = historial || $1::jsonb, ultimo_mensaje_en = now() where id = $2`,
      [JSON.stringify([entradaCliente]), conversacionId]
    )
    return null
  }

  const resultado = await evaluarTurno(
    client,
    tenantId,
    historialPrevio,
    mensajeTexto,
    estadoNormalizado,
    fila.canal as Canal,
    fila.sede_id ?? undefined
  )

  const entradaBot: TurnoHistorial = { rol: 'bot', texto: resultado.textoRespuesta, en: new Date().toISOString() }

  await client.query(
    `update conversaciones set historial = historial || $1::jsonb, estado = $2, ultimo_mensaje_en = now() where id = $3`,
    [JSON.stringify([entradaCliente, entradaBot]), resultado.nuevoEstado, conversacionId]
  )

  return resultado
}
