import Anthropic from '@anthropic-ai/sdk'
import type pg from 'pg'
import {
  puedeTransicionarConversacion,
  partesLima,
  diaSemanaLegible,
  sumarDiasISO,
  type EstadoConversacion,
} from '@bakebrothers/domain'
import {
  consultarPrecio,
  listarCatalogo,
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

const SYSTEM_PROMPT = `Eres el asistente de WhatsApp/redes de Bake Brothers, una pastelería de Chorrillos, Lima. Hablas con clientes reales — tono cercano, puedes usar emojis y tutear: SIEMPRE de "tú" (tuteo peruano neutro), nunca con voseo argentino. Nunca uses "oki", "oka" ni "porfis".

REGLAS DURAS, sin excepción:

1. Nunca digas un precio, disponibilidad o condición de un combo de memoria. Siempre llama a la tool correspondiente (consultarPrecio, consultarDisponibilidad, consultarCombo) y responde solo con el dato real que te devuelve. Si la tool no encuentra el producto/combo (te devuelve null), dilo con honestidad — nunca inventes un precio, una disponibilidad ni una condición.

2. Catering: antes de confirmar o cotizar CUALQUIER pedido de catering (cantidad + fecha de entrega), llama siempre a evaluarSemaforoCateringPedido — nunca lo calcules ni lo supongas tú.
   - Resultado verde: puedes confirmar con naturalidad.
   - Resultado amarillo o rojo: NO prometas ni confirmes nada. Llama a escalarAHumano con un motivo breve, y avísale al cliente con calidez que lo vas a conectar con el equipo para confirmar los detalles — nunca digas que "no se puede", solo que lo vas a consultar.
   - Puedes usar consultarReglasCatering si necesitas los datos crudos de un ítem para explicarle algo al cliente, pero la decisión de verde/amarillo/rojo siempre pasa por evaluarSemaforoCateringPedido.

3. Escala a una persona del equipo (llamando a escalarAHumano con un motivo breve) SIEMPRE ante:
   - Reclamos o quejas.
   - Pedidos de reembolso.
   - Problemas con el pago.
   - Un cliente molesto o disconforme.
   - Delivery perdido o retrasado.
   - Cuando el cliente menciona o manda una imagen de referencia para una torta personalizada (nunca prometas ese diseño tú).
   - Cualquier mención de alergia, intolerancia o consulta "libre de".
   - Cualquier caso de catering en amarillo o rojo (ver regla 2).
   No uses escalarAHumano para preguntas que simplemente no sabes responder — ahí admite con honestidad que no tienes esa info y ofrécele la opción de conectarlo con alguien del equipo, sin forzar la derivación tú.

4. Nunca inventes datos de precio, stock, ingredientes, alérgenos ni reglas de catering — si no tienes la tool para algo, dilo.

5. Puedes registrar un pedido real con crearPedido cuando el cliente confirma que quiere comprar. Antes de llamarla:
   - Pídele SIEMPRE el teléfono de contacto, incluso en WhatsApp aunque ya tengas el número de quien te escribe — quien escribe no es necesariamente quien recibe el pedido, no asumas que es el mismo.
   - Junta nombre, producto(s) y cantidad, fecha de entrega, y si es recojo en tienda o delivery (con dirección) — nunca cotices ni prometas el costo del delivery, eso lo cotiza el operador a mano.
   - Si el producto es un jugo o helado, pregunta con azúcar o sin azúcar; si son empanadas, pregunta calientes o sin calentar — anota la respuesta en el campo nota.
   - Para CATERING: nunca llames a crearPedido si evaluarSemaforoCateringPedido no dio verde para ese ítem — en amarillo/rojo escala (regla 2), no fuerces el pedido. crearPedido igual vuelve a verificar esto del lado del servidor.
   - Si el cliente te dice que va a pagar por adelantado, marca pagoPorAdelantado en true. Nunca proceses ni verifiques ningún comprobante de pago (captura, voucher) — eso lo revisa el equipo a mano. Hoy todavía no puedes ver imágenes: si el cliente manda una captura de pago, avísale con calidez que el pedido ya quedó registrado y que el equipo confirma el pago, sin intentar describir ni validar la imagen.
   - Si crearPedido devuelve un error, no inventes un número de pedido — cuéntale al cliente lo que pasó con honestidad (ej. producto no disponible, dirección faltante) y ofrece ayudarlo a resolverlo.

6. Combos: antes de vender un combo, llama siempre a consultarCombo para ver su composición real (items) y si admite cambios (permiteCambios) — nunca lo asumas.
   - Si "items" viene vacío (combo sin composición fija, "sujeto a stock del día"), NO puedes cerrar ese pedido tú — llama a escalarAHumano con un motivo breve, avisándole al cliente con calidez que el equipo lo va a confirmar.
   - Si el combo SÍ tiene composición (fija o con cambios), puedes cerrarlo con crearPedido con total naturalidad — nunca hagas esperar al cliente "por si acaso" ni le digas que "alguien lo va a revisar".
   - Si además admite cambios (permiteCambios=true) y el cliente pidió una sustitución (ej. cambiar un sabor, elegir entre opciones), identifica bien qué eligió y pásalo en el campo "seleccion" de ese ítem al llamar a crearPedido — nunca lo dejes solo en el mensaje de texto.

7. Pedidos genéricos y preguntas de "qué hay": si el cliente no nombra un producto concreto ("quiero alfajores", "un postre dulce", "¿qué tipo de empanadas hay?", "¿qué tortas tienen?", "¿qué venden?"), llama a listarCatalogo y muéstrale las opciones reales de forma breve (nombre y precio desde; si tiene varios tamaños, dile que hay varios) y pregúntale cuál prefiere. Nunca elijas un producto por él ni uses consultarPrecio para adivinar de entre varios. Si hay muchas opciones, muestra las más representativas y ofrécele acotar (por sabor, por tamaño, para cuántas personas). Si listarCatalogo no encuentra nada, cuéntale qué categorías sí hay. Una vez que elige uno concreto, sigue con consultarPrecio/crearPedido.

8. Tamaños: el cliente suele nombrar el producto y el tamaño en la misma frase ("carrot cake individual", "porción de cheesecake de fresa", "torta de chocolate familiar", "mini red velvet", "caja de alfajores de 18", "alfajores x10"). Pásale a consultarPrecio la frase TAL CUAL la dijo el cliente, con el tamaño incluido: la herramienta separa el producto del tamaño.
   - Si el resultado trae tamanoSolicitado.encontrado = true, ese es el tamaño y el precio que pidió.
   - Si trae tamanoSolicitado.encontrado = false, el producto SÍ existe pero no viene en ese tamaño: díselo con naturalidad y ofrécele los de tamanosDisponibles con su precio. NUNCA le digas que el producto no existe ni que no lo encuentras.
   - Si trae otrasCoincidencias, hay varios productos que calzan igual de bien (por ejemplo varios sabores): no elijas por él, pregúntale cuál quiere.
   - Si el producto tiene varios tamaños y el cliente no dijo cuál, pregúntaselo antes de crear el pedido.
   - Al llamar a crearPedido, deja el producto en "busqueda" y, si el cliente dijo el tamaño, ponlo en "tamano" (o déjalo dentro de la frase): el servidor lo resuelve contra los tamaños reales. Si crearPedido devuelve TAMANO_NO_DISPONIBLE o TAMANO_INVALIDO, trae tamanosDisponibles: ofrécelos al cliente.

Responde siempre en español (tuteo peruano: tú, puedes, tienes, quieres), breve y natural, como un mensaje real de WhatsApp — no un párrafo largo. Formato de WhatsApp: para resaltar algo usa un solo asterisco (*así*), nunca **doble asterisco** ni títulos con #.`

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
          description:
            'Nombre del producto tal como lo escribió el cliente, INCLUIDO el tamaño si lo dijo (ej. "carrot cake", "carrot cake individual", "mini red velvet", "alfajores x10"). La herramienta separa el tamaño.',
        },
      },
      required: ['busqueda'],
    },
  },
  {
    name: 'listarCatalogo',
    description:
      'Lista los productos disponibles de una categoría o tipo, con su precio "desde". Úsala cuando el cliente pide algo GENÉRICO o pregunta qué hay: "quiero alfajores", "¿qué empanadas tienen?", "un postre dulce", "¿qué tortas hay?", "¿qué venden?". Sin texto devuelve las categorías que existen. Para un producto concreto ya nombrado usa consultarPrecio.',
    input_schema: {
      type: 'object',
      properties: {
        busqueda: {
          type: 'string',
          description:
            'Categoría o tipo que pide el cliente (ej. "alfajores", "empanadas", "postre dulce", "tortas", "bebidas"). Vacío para ver todas las categorías.',
        },
      },
      required: [],
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
      'Consulta las reglas crudas de un ítem de catering (mínimo de unidades, si sale el mismo día, horas de anticipación). Para saber si un pedido específico está en verde/amarillo/rojo usa evaluarSemaforoCateringPedido, no calcules esto tú.',
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
      'Registra un pedido real (recalcula el precio en el servidor, nunca confía en un precio que tú calcules). Úsala solo para casos verdes: productos de tienda normales, catering ya confirmado en verde por evaluarSemaforoCateringPedido, o combos con composición real (ver regla 6). Siempre pídele el teléfono al cliente antes de llamarla, aunque ya conozcas el número de WhatsApp de quien escribe.',
    input_schema: {
      type: 'object',
      properties: {
        clienteNombre: { type: 'string', description: 'Nombre del cliente.' },
        clienteTelefono: {
          type: 'string',
          description: 'Teléfono de contacto — pídeselo siempre al cliente, no asumas que es el número de quien te escribe.',
        },
        tipoEntrega: { type: 'string', enum: ['tienda', 'delivery'], description: '"tienda" = recojo en local.' },
        direccion: { type: 'string', description: 'Requerida si tipoEntrega es delivery.' },
        distrito: { type: 'string', description: 'Requerido si tipoEntrega es delivery.' },
        referencia: { type: 'string' },
        fechaEntregaISO: { type: 'string', description: 'Fecha de entrega, formato YYYY-MM-DD.' },
        horario: { type: 'string', description: 'Horario acordado con el cliente, en texto libre.' },
        items: {
          type: 'array',
          description: 'Uno o más productos/ítems de catering/combos del pedido.',
          items: {
            type: 'object',
            properties: {
              tipo: { type: 'string', enum: ['producto', 'catering', 'combo'] },
              busqueda: { type: 'string', description: 'Nombre o texto aproximado del producto, ítem de catering o combo (puede incluir el tamaño si el cliente lo dijo en la misma frase).' },
              tamano: {
                type: 'string',
                description:
                  'Solo para tipo "producto", si el producto tiene tamaños: el que eligió el cliente ("Individual", "Mini", "Familiar", "Caja x18", "500g"). El servidor lo resuelve contra los tamaños reales del producto.',
              },
              cantidad: { type: 'number' },
              seleccion: {
                type: 'array',
                description:
                  'Solo para tipo "combo" que admite cambios (permiteCambios=true en consultarCombo) — la composición real que eligió el cliente. Obligatorio en ese caso, ignorado si no aplica.',
                items: {
                  type: 'object',
                  properties: {
                    productoBusqueda: { type: 'string', description: 'Nombre o texto aproximado del producto elegido.' },
                    tamano: { type: 'string', description: 'Si el producto tiene tamaños.' },
                    cantidad: { type: 'number' },
                  },
                  required: ['productoBusqueda', 'cantidad'],
                },
              },
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
      'Deriva la conversación a una persona del equipo de Ventas en vez de resolverla tú. Úsala ante reclamos, reembolsos, problemas de pago, cliente molesto, delivery perdido/retrasado, torta personalizada con imagen de referencia, alergias/intolerancias, o catering en amarillo/rojo. No la uses para preguntas que simplemente no sabes responder.',
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
  // Pedidos que crearPedido registró de verdad en este turno (vacío si ninguno)
  // — el simulador del dashboard los muestra; el webhook real no los necesita.
  pedidosCreados?: { numero: string; estado: string; total: number }[]
}

export interface OpcionesTurno {
  // Simulador del dashboard: los pedidos que cree el bot quedan marcados como
  // prueba (ver MARCA_PRUEBA en services/crearPedido.ts).
  esPrueba?: boolean
  // Referencia de campaña de la conversación (ver campana.ts del dominio): el
  // pedido que cree el bot la guarda en orders.campana.
  campana?: string | null
}

/**
 * El modelo no sabe qué día es: sin esto, "para hoy" / "mañana" / "el sábado"
 * lo obligan a adivinar la fecha de entrega (y crearPedido la valida contra
 * la anticipación real). Se le da la fecha y hora de Lima en cada turno — es
 * un dato, no una regla, así que va aparte del SYSTEM_PROMPT fijo.
 */
export function contextoFechaActual(ahora: Date = new Date()): string {
  const { fecha, hora, minuto } = partesLima(ahora)
  const hhmm = `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`
  return `FECHA Y HORA ACTUALES (hora de Lima, úsalas para "hoy", "mañana", "el sábado", etc. y para fechaEntregaISO): hoy es ${diaSemanaLegible(fecha)} ${fecha}, son las ${hhmm}. Mañana es ${sumarDiasISO(fecha, 1)}.`
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
  | 'listarCatalogo'
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
    case 'listarCatalogo':
      return listarCatalogo(client, tenantId, String(i.busqueda ?? ''))
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
    nombre === 'listarCatalogo' ||
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
  // Mismo criterio para combos sin composición definida (Grupo 3, ver
  // pedidosCombos.ts) — el bot no tiene con qué confirmarlo, ni aunque el
  // modelo no haya llamado a escalarAHumano por su cuenta.
  if (
    nombreTool === 'crearPedido' &&
    typeof resultadoTool === 'object' &&
    resultadoTool !== null &&
    'ok' in resultadoTool &&
    (resultadoTool as { ok: boolean }).ok === false &&
    (resultadoTool as { error?: string }).error === 'COMBO_SIN_COMPOSICION_DEFINIDA'
  ) {
    return { forzar: true, motivo: 'Se intentó vender un combo sin composición definida ("sujeto a stock") — requiere revisión del equipo.' }
  }
  return { forzar: false }
}

/** Traduce el input crudo (JSON del tool call) al tipo fuerte que espera crearPedido. */
function construirInputCrearPedido(
  inputCrudo: unknown,
  sedeId: string | undefined,
  esPrueba: boolean,
  campana: string | null
): CrearPedidoInput {
  const i = (inputCrudo ?? {}) as Record<string, unknown>
  const items = Array.isArray(i.items) ? (i.items as Record<string, unknown>[]) : []
  return {
    esPrueba,
    campana,
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
    items: items.map((item): ItemPedidoInput => {
      if (item.tipo === 'catering') {
        return { tipo: 'catering', busqueda: String(item.busqueda ?? ''), cantidad: Number(item.cantidad) }
      }
      if (item.tipo === 'combo') {
        const seleccionCruda = Array.isArray(item.seleccion) ? (item.seleccion as Record<string, unknown>[]) : undefined
        return {
          tipo: 'combo',
          busqueda: String(item.busqueda ?? ''),
          cantidad: Number(item.cantidad),
          seleccion: seleccionCruda?.map((s) => ({
            productoBusqueda: String(s.productoBusqueda ?? ''),
            tamano: s.tamano ? String(s.tamano) : null,
            cantidad: Number(s.cantidad),
          })),
        }
      }
      return {
        tipo: 'producto',
        busqueda: String(item.busqueda ?? ''),
        tamano: item.tamano ? String(item.tamano) : null,
        cantidad: Number(item.cantidad),
      }
    }),
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
  sedeId?: string,
  opciones: OpcionesTurno = {}
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
  const pedidosCreados: NonNullable<ResultadoTurno['pedidosCreados']> = []
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
      system: `${SYSTEM_PROMPT}\n\n${contextoFechaActual()}`,
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
        : texto || 'Perdona, no supe cómo responder eso — ¿quieres que te contacte alguien del equipo?'

      return {
        textoRespuesta,
        nuevoEstado: debeEscalar ? escalarSiCorresponde(estadoActual) : estadoActual,
        herramientasUsadas,
        motivoEscalacion,
        pedidosCreados,
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
          const resultado = await crearPedido(
            client,
            tenantId,
            canal,
            construirInputCrearPedido(bloque.input, sedeId, opciones.esPrueba === true, opciones.campana ?? null)
          )
          if (resultado.ok) {
            pedidosCreados.push({ numero: resultado.numero, estado: resultado.estado, total: resultado.total })
          }
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
    pedidosCreados,
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
    `select estado, historial, sede_id, canal, contexto from conversaciones where id = $1 and tenant_id = $2`,
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
    fila.sede_id ?? undefined,
    { campana: typeof fila.contexto?.campana === 'string' ? fila.contexto.campana : null }
  )

  const entradaBot: TurnoHistorial = { rol: 'bot', texto: resultado.textoRespuesta, en: new Date().toISOString() }

  await client.query(
    `update conversaciones set historial = historial || $1::jsonb, estado = $2, ultimo_mensaje_en = now() where id = $3`,
    [JSON.stringify([entradaCliente, entradaBot]), resultado.nuevoEstado, conversacionId]
  )

  return resultado
}
