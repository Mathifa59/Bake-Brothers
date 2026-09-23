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

5. No armes ni confirmes un pedido completo (eso lo arma el operador humano) — tu rol es responder consultas e informar, no cerrar la venta.

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
  return { forzar: false }
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
      return {
        textoRespuesta:
          texto || 'Perdona, no supe cómo responder eso — ¿querés que te contacte alguien del equipo?',
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
        motivoEscalacion = String((bloque.input as { motivo?: string } | undefined)?.motivo ?? 'Escalada solicitada por el bot.')
        resultadosTool.push({ type: 'tool_result', tool_use_id: bloque.id, content: 'Escalada registrada.' })
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
    `select estado, historial, sede_id from conversaciones where id = $1 and tenant_id = $2`,
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
    fila.sede_id ?? undefined
  )

  const entradaBot: TurnoHistorial = { rol: 'bot', texto: resultado.textoRespuesta, en: new Date().toISOString() }

  await client.query(
    `update conversaciones set historial = historial || $1::jsonb, estado = $2, ultimo_mensaje_en = now() where id = $3`,
    [JSON.stringify([entradaCliente, entradaBot]), resultado.nuevoEstado, conversacionId]
  )

  return resultado
}
