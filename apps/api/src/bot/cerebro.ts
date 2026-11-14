import Anthropic from '@anthropic-ai/sdk'
import type pg from 'pg'
import {
  puedeTransicionarConversacion,
  debeAutoRetornarAlBot,
  partesLima,
  diaSemanaLegible,
  sumarDiasISO,
  parsearDistritosDelivery,
  conAvisoPrimeraHora,
  textoContextoCortes,
  textoHorarioDeHoy,
  textoHorarioBot,
  PREGUNTA_PROMOCIONES,
  type EstadoConversacion,
} from '@bakebrothers/domain'
import { env } from '../env.js'
import { resolverModelo } from './modelos.js'
import { linkWhatsAppMayoristas } from '../mayoristas.js'
import {
  leerClienteDeConversacion,
  guardarConsentimientoPromociones,
  type ClienteDeConversacion,
} from '../repositories/consentimientoRepo.js'
import {
  consultarPrecio,
  listarCatalogo,
  consultarDisponibilidad,
  consultarCombo,
  consultarReglasCatering,
  evaluarSemaforoCateringPedido,
} from './tools.js'
import { horariosDeLocales } from '../repositories/horariosRepo.js'
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

const MODELO = resolverModelo(env.BOT_MODELO)

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

2. Catering: SIEMPRE lo atiende una persona del equipo — tú nunca lo confirmas ni lo cotizas, y crearPedido rechaza cualquier ítem de catering. Haz esto:
   - Recoge con calidez el ítem, la cantidad, la fecha de entrega, el nombre y el teléfono del cliente.
   - Llama a evaluarSemaforoCateringPedido para dejarle el contexto a la persona (si el pedido cumple o no las reglas); nunca lo calcules ni lo supongas tú.
   - Llama a escalarAHumano con un resumen breve (ítem, cantidad, fecha, nombre, teléfono y el resultado del semáforo) y avísale al cliente que el equipo le confirma y le cotiza en breve — nunca digas que "no se puede", solo que lo van a revisar.
   - No prometas disponibilidad, horario ni movilidad. Si el cliente quiere pagar al recoger, pide para un domingo, necesita la entrega muy temprano o pide una cantidad muy grande, anótalo en el resumen para la persona (son casos que se consultan, no se rechazan).
   - Puedes usar consultarReglasCatering si necesitas los datos crudos de un ítem para explicarle algo al cliente.

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
   - Junta nombre (mira el bloque CLIENTE del contexto: si ya tenemos su nombre confirmado no se lo pidas otra vez; si no lo tenemos, pídeselo SIEMPRE antes de crear el pedido, aunque el perfil de WhatsApp muestre uno), producto(s) y cantidad, fecha de entrega, y si es recojo en tienda o delivery (con dirección) — nunca cotices ni prometas el costo del delivery, eso lo cotiza el operador a mano.
   - Si el producto es un jugo o helado, pregunta con azúcar o sin azúcar; si son empanadas, pregunta calientes o sin calentar — anota la respuesta en el campo nota.
   - Catering: nunca lo registres tú con crearPedido (regla 2). Solo productos de tienda y combos.
   - PAGO: el delivery se paga SIEMPRE por adelantado (pagoPorAdelantado = true) y los datos de pago los envía una persona cuando se cotiza el envío. El RECOJO se paga en la tienda: usa pagoPorAdelantado = false y NO ofrezcas pagar por adelantado ni le pidas datos de pago; confírmaselo diciendo que paga al recoger. Solo si el cliente pide por su cuenta pagar por adelantado un recojo: usa pagoPorAdelantado = true y en metodoPago el que elija (yape, plin o transferencia); en Santa Marina el sistema te da datosPago y se los das tal cual (pídele que mande la captura del pago por aquí); en Cedros el sistema no tiene datos para dar y deriva a una persona que se los envía (díselo así). TARJETA: tú NUNCA generas ni ofreces un link de pago; si el cliente pide pagar con tarjeta o con link, usa metodoPago = tarjeta, registra el pedido y dile que una persona del equipo le envía el link de pago (el sistema no te da datos de pago en ese caso). Nunca inventes un link. NUNCA inventes un número de Yape, una cuenta ni un link.
   - CAPTURAS DE PAGO: cuando el cliente manda la captura de su pago, el sistema la lee solo y la deja para que el equipo la confirme con un toque. Tú nunca des un pago por confirmado ni verifiques ningún comprobante: solo dile con calidez que el equipo lo confirma y le avisa.
   - DELIVERY: solo se hace a los distritos de la lista de cobertura (ver el contexto de locales y delivery). Si el distrito no está, dile con amabilidad que ahí no llegan y ofrécele recojo en tienda. El envío se cotiza al momento y una persona del equipo confirma el costo: tú NUNCA das un monto (ni aproximado ni «desde») ni prometas que sea gratis; dile que el costo del envío se cotiza al momento y que una persona se lo confirma. La coordinación también la hace una persona. Cuando crearPedido registre un delivery, llama a escalarAHumano (motivo: cotizar y coordinar el delivery) y dile al cliente que una persona le confirma el costo de envío y le pasa los datos de pago.
   - Si crearPedido devuelve atencionHumana, el pedido SÍ quedó registrado: cuéntale el número de pedido y el total de los productos, y llama a escalarAHumano con ese motivo.
   - Si crearPedido devuelve SEDE_REQUERIDA o SEDE_NO_VALIDA, pregúntale al cliente en qué local recoge (con las opciones que trae el error) o si es delivery, y vuelve a llamar a crearPedido con su respuesta en sedeRecojo.
   - Si crearPedido devuelve un error, no inventes un número de pedido — cuéntale al cliente lo que pasó con honestidad (ej. producto no disponible o agotado, dirección faltante, distrito sin cobertura) y ofrece ayudarlo a resolverlo. Si el error es CATERING_REQUIERE_PERSONA, sigue la regla 2.

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
9. Agotados: lo que está agotado NO se vende, pero un agotado es de UN local, no del negocio: nunca digas "agotado" a secas ni "no hay"; di siempre en qué local se agotó, con el nombre concreto ("se nos agotó en Cedros").
   - consultarPrecio trae localDeLaConversacion (el local de este cliente), agotadoEn (en qué local y qué tamaño) y disponibleEn (los OTROS locales donde sí hay, cada uno con su dirección). disponibleEn es la verdad: si viene, ofrécele ese local con su dirección (cópiala tal cual de ahí) y dile también que puedes mostrarle otros productos. Nunca digas que está agotado "en todos los tamaños" o "en todos lados" si disponibleEn trae algún local.
   - Si NO viene disponibleEn, no hay otro local con stock: dile en qué local se agotó y ofrécele otros productos parecidos (listarCatalogo), sin inventar otro local.
   - Un tamaño con agotado = true no lo ofrezcas ni lo pidas: ofrécele los otros tamaños, y si ese tamaño trae disponibleEn (nombres de locales), dile que ahí sí lo hay.
   - Con el número del bot el local todavía no está elegido: usa agotadoEn para decir en cuál se agotó y disponibleEn para el que sí tiene, y deja que elija.
   - Los productos que listarCatalogo omite por agotados (agotadosOmitidos) se agotaron en el local de esta conversación: si pregunta por uno, dile que se agotó en ese local y llama a consultarPrecio para saber si otro local lo tiene.
   - Si crearPedido devuelve PRODUCTO_AGOTADO, no inventes un pedido: dile qué producto no se pudo y en qué local (detalle.sedeId y detalle.productos), y ofrécele disponibleEn (con su dirección, que ya tienes en LOCALES Y HORARIOS), otro producto o dejarlo para el día siguiente.
10. Fechas, pedidos para hoy y atención fuera de horario: el contexto de cada turno te dice la hora de Lima, el corte, el horario de HOY de cada local y si hay personas atendiendo.
   - Para MAÑANA se toma hasta las 11:00 p. m. de hoy; desde esa hora la fecha más cercana es pasado mañana. Si crearPedido devuelve CORTE_DEL_DIA, usa detalle.fechaMinima para ofrecer la fecha más cercana.
   - Para HOY SÍ puedes tomar el pedido: el servidor lo valida antes de crearlo (producto disponible en el Stock de ese local, hora de recojo dentro del horario del local y posterior a la hora actual, y que no sea solo por encargo). En recojo ofrece SOLO horas dentro del horario del local de ese día (desde que abre hasta antes de que cierre). Según lo que devuelva crearPedido: HORA_FUERA_DE_HORARIO, HORA_PASADA, HORA_NO_ENTENDIDA o LOCAL_CERRADO → ofrécele horas válidas (detalle trae abre, cierra y otrosLocales), el otro local u otro día; PRODUCTO_AGOTADO → regla 9 (otro local o el día siguiente); SOLO_POR_ENCARGO → explícale con amabilidad que eso es solo por encargo y no sale para hoy, y ofrécelo agendado desde detalle.fechaMinima; NO_SE_PUDO_VALIDAR → el pedido NO se creó y una persona lo confirma (no inventes nada).
   - Cuando crearPedido registre un pedido para hoy: dile que quedó registrado y que le avisan cuando esté listo, SIN prometer una hora exacta (regla 13). Nunca confirmes tú un pedido que el servidor no registró.
   - Si nadie atiende ahora y derivas a una persona (escalarAHumano, o un pedido que sigue una persona), dile «te escribimos a primera hora»; nunca prometas una hora exacta ni una respuesta inmediata.
11. Promociones (consentimiento): SOLO si el contexto trae el bloque «CONSENTIMIENTO DE PROMOCIONES: pendiente», esta persona nunca ha respondido a esto. Cuando crearPedido registre su pedido (ok = true), al final de tu confirmación hazle UNA sola vez esta pregunta, tal cual: «${PREGUNTA_PROMOCIONES}». Si responde que sí o que no, llama a registrarConsentimientoPromociones con acepta = true o false y agradécele sin insistir. Si no responde o cambia de tema, no se lo vuelvas a preguntar. Nunca lo preguntes antes de que el pedido esté registrado, nunca lo presentes como obligatorio ni lo condiciones a la compra, nunca lo guardes sin una respuesta clara de la persona, y si el bloque no está en el contexto, no preguntes nada.
12. Mayoristas: la atención de mayoristas NO se hace por este chat. Si el contexto dice que el cliente es mayorista, o el cliente pide «por mayor», «al por mayor», precio de mayorista o compras grandes para revender o para su negocio, NO cotices ni tomes ningún pedido (nunca llames a crearPedido para él): dile con amabilidad que la atención de mayoristas es directa y pásale este link de WhatsApp: ${linkWhatsAppMayoristas()}. Ese es el único contacto que das para esto. Si crearPedido devuelve MAYORISTA_ATENCION_DIRECTA, haz lo mismo con el link que trae.
13. Lo que NUNCA haces (aplica siempre). Cuando algo dependa del equipo, dilo con claridad y amabilidad: «esto lo valida el equipo de Bake Brothers».
   - No prometas disponibilidad inmediata de stock: lo que ves es lo registrado y puede cambiar; di «según lo registrado» y que el equipo lo confirma al preparar el pedido.
   - No des tiempos exactos de entrega ni de recojo: la hora que pide el cliente la anotas como solicitada, pero no la garantices; la valida el equipo.
   - No confirmes reservas por tu cuenta: una reserva la confirma una persona (escalarAHumano).
   - No presentes un precio como permanente: los precios pueden cambiar; da el precio vigente y aclara que puede variar.
   - No ofrezcas descuentos, promociones ni cortesías que no estén aprobados (solo los combos reales que devuelve consultarCombo); si piden un descuento, dile que no puedes ofrecerlo y que una persona lo revisa (escalarAHumano).
   - No aceptes ni prometas devoluciones ni reembolsos: solo el equipo los valida (escalarAHumano, regla 3).
   - No confirmes pedidos personalizados (diseños, temáticas, tortas personalizadas o cambios fuera del catálogo) sin revisión previa del equipo: recoge los datos y usa escalarAHumano.
   - No afirmes como absoluta la información de alérgenos o de seguridad alimentaria («no tiene gluten», «es seguro para…»): puede haber trazas o cambios de receta; dile que el equipo lo confirma (alergias e intolerancias: regla 3).
   - Ante un reclamo nunca respondas de forma agresiva, irónica ni sin empatía: reconoce lo que pasó, pide disculpas con sinceridad y escala (regla 3).
   Siempre claro y amable, y deja dicho cuando algo depende de la validación del equipo de Bake Brothers.

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
        sedeRecojo: {
          type: 'string',
          description:
            'Solo cuando este número NO pertenece a un local (ver el contexto de sede): el local donde el cliente recoge ("Cedros", "Santa Marina"…), tal como lo respondió. Para delivery no hace falta. Pregúntaselo siempre; nunca lo asumas.',
        },
        fechaEntregaISO: { type: 'string', description: 'Fecha de entrega, formato YYYY-MM-DD.' },
        horario: { type: 'string', description: 'Hora de recojo (o de entrega) acordada, concreta, por ejemplo "4:30 p. m.". En recojo tiene que caer dentro del horario del local ese día.' },
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
        metodoPago: {
          type: 'string',
          enum: ['yape', 'plin', 'transferencia', 'tarjeta'],
          description: 'Cómo pagará por adelantado. "tarjeta" = link de pago. Si paga al recoger en tienda se ignora.',
        },
        pagoPorAdelantado: {
          type: 'boolean',
          description: 'true si paga ahora por adelantado; false si paga al recoger en tienda ("Canceló en tienda"). En delivery siempre true: el servidor lo exige.',
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
  {
    name: 'registrarConsentimientoPromociones',
    description:
      'Guarda la respuesta del cliente a la pregunta de promociones (regla 11). Llámala SOLO cuando la persona respondió con claridad que sí (acepta = true) o que no (acepta = false) a recibir promociones y novedades por este WhatsApp. Nunca la llames sin una respuesta clara ni por tu cuenta.',
    input_schema: {
      type: 'object',
      properties: {
        acepta: { type: 'boolean', description: 'true = quiere recibir promociones; false = no quiere.' },
      },
      required: ['acepta'],
    },
  },
]

export interface TurnoHistorial {
  rol: 'cliente' | 'bot' | 'operador'
  texto: string
  en: string
  /** Quién del equipo escribió (solo en mensajes del operador enviados desde el panel). */
  autor?: string
  /** Mensaje fijo sin IA (la bienvenida automática del bot apagado): no lo escribió el modelo ni una persona. */
  automatico?: boolean
  /**
   * Mensaje traído de la sincronización de historial de Coexistence (lo que
   * el negocio y el cliente se escribieron ANTES de conectar el número).
   * Sirve solo para que un humano lo lea en el dashboard: NUNCA se manda al
   * modelo (ver construirMensajesParaModelo) — son hasta 20 mensajes por
   * conversación que solo inflarían el costo de cada turno.
   */
  importado?: boolean
}

/**
 * Arma los `messages` que se le mandan a Claude a partir del historial real.
 * Pura y sin I/O (se prueba sin llamar al modelo).
 *
 *  - Los mensajes `importado` se EXCLUYEN por completo: son contexto
 *    histórico para el humano, no para el bot, y cada uno se pagaría en cada
 *    turno de la conversación.
 *  - Los mensajes del `operador` (el equipo respondiendo, desde el dashboard o
 *    desde el celular) SÍ entran, como turnos del asistente: cuando el bot
 *    retoma una conversación necesita saber qué le dijo el equipo al cliente.
 *  - La API de Claude exige que la conversación empiece con un turno de
 *    usuario. Si lo primero que queda es del asistente (típico: el equipo le
 *    escribió primero al cliente desde el celular), se antepone un turno de
 *    usuario neutro en vez de descartar ese contexto.
 */
export function construirMensajesParaModelo(
  historialPrevio: TurnoHistorial[],
  mensajeEntrante: string
): Anthropic.MessageParam[] {
  const mensajes: Anthropic.MessageParam[] = historialPrevio
    .filter((h) => !h.importado)
    .map(
      (h): Anthropic.MessageParam => ({
        role: h.rol === 'cliente' ? 'user' : 'assistant',
        content: h.texto,
      })
    )
  if (mensajes.length > 0 && mensajes[0].role !== 'user') {
    mensajes.unshift({ role: 'user', content: '[Inicio de la conversación]' })
  }
  mensajes.push({ role: 'user', content: mensajeEntrante })
  return mensajes
}

export interface ResultadoTurno {
  textoRespuesta: string
  nuevoEstado: EstadoConversacion
  herramientasUsadas: string[]
  motivoEscalacion?: string
  // Pedidos que crearPedido registró de verdad en este turno (vacío si ninguno)
  // — el simulador del dashboard los muestra; el webhook real no los necesita.
  pedidosCreados?: { numero: string; estado: string; total: number; sedeId?: string | null; paraHoy?: boolean; resumen?: string }[]
}

export interface OpcionesTurno {
  // Simulador del dashboard: los pedidos que cree el bot quedan marcados como
  // prueba (ver MARCA_PRUEBA en services/crearPedido.ts).
  esPrueba?: boolean
  // Referencia de campaña de la conversación (ver campana.ts del dominio): el
  // pedido que cree el bot la guarda en orders.campana.
  campana?: string | null
  // Conversación en la que se crea el pedido (0036): enlaza la captura de pago que llegue después.
  conversacionId?: string | null
  // Instante «actual» (hora de Lima para los cortes): solo lo fijan los tests y las pruebas guionadas.
  ahora?: Date
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

/**
 * Contexto de sede para el número del bot. Los números de cada local traen la sede en la conversación; el
 * del bot es uno solo para todo el negocio. El servidor igual lo exige al crear el pedido
 * (resolverSedeDelPedido): esto solo le dice al modelo qué preguntar y con qué opciones.
 */
/**
 * Contexto de negocio que el modelo necesita en TODA conversación: qué locales hay, su dirección y
 * horario, y a qué distritos se hace delivery. Sale de la base (`sedes`) y de la configuración
 * (DISTRITOS_DELIVERY), no del código — cambiar un horario no requiere un deploy.
 */
export function textoContextoLocales(
  locales: { nombre: string; direccion: string | null; horario: string | null }[],
  distritosDelivery: string[]
): string {
  const lineas = locales.map((l) => {
    const partes = [l.direccion, l.horario ? `horario: ${l.horario}` : null].filter(Boolean)
    return `- ${l.nombre}${partes.length > 0 ? ` (${partes.join('; ')})` : ''}`
  })
  const delivery =
    distritosDelivery.length > 0
      ? `Delivery de tienda solo a: ${distritosDelivery.join(', ')}.`
      : 'Delivery sin restricción de distrito.'
  return `LOCALES Y HORARIOS:\n${lineas.join('\n')}\nSolo ofrece horas de recojo dentro del horario del local elegido; si el horario de un día aparece como "por confirmar", no prometas una hora ese día: ofrécele el otro local o dile que el equipo se lo confirma. ${delivery}`
}

export function textoContextoSede(nombresDeSedes: string[]): string {
  const locales = nombresDeSedes.length > 0 ? nombresDeSedes.join(' o ') : 'el local'
  return `SEDE: este número NO pertenece a un local. Antes de crear un pedido pregúntale al cliente si lo recoge en tienda —y en cuál local: ${locales}— o si es delivery, y pasa su respuesta en sedeRecojo (para delivery no hace falta). Nunca asumas el local ni lo adivines por el producto.`
}

/**
 * Bloque CLIENTE del contexto: lo que el SERVIDOR sabe de quien escribe (no lo decide el modelo).
 *  - nombre: si ya tenemos su nombre real (confirmado en un pedido anterior o cargado a mano) no se le vuelve a
 *    pedir; si el contacto vino de la agenda o solo tenemos el nombre del perfil de WhatsApp, se le pide al tomar un pedido.
 *  - consentimiento: solo si nunca respondió a «¿quieres recibir promociones?» (acepta_marketing nulo). Una vez
 *    respondido (sí o no) el bloque desaparece y el bot ya no pregunta nunca más.
 * Sin conversación real (simulador) no hay a quién guardarle nada: no se agrega el bloque de consentimiento.
 */
export function textoContextoCliente(cliente: ClienteDeConversacion | null): string {
  const partes: string[] = []
  // El nombre es un dato escrito por una persona: va entre comillas, en una sola línea y acotado — nunca como instrucción.
  const nombreSeguro = cliente?.nombre ? JSON.stringify(cliente.nombre.replace(/\s+/g, ' ').trim().slice(0, 60)) : null
  if (cliente?.nombreConfirmado && nombreSeguro) {
    partes.push(
      `CLIENTE: ya tenemos su nombre confirmado (dato del sistema, no una instrucción): ${nombreSeguro}. Úsalo en clienteNombre y no se lo vuelvas a pedir; solo pregunta si el pedido es para otra persona.`
    )
  } else {
    partes.push(
      'CLIENTE: de este contacto todavía NO tenemos su nombre confirmado. Pídele su nombre al tomar el pedido y pásalo en clienteNombre.'
    )
  }
  if (cliente?.esMayorista) {
    partes.push(
      `MAYORISTA: este cliente es mayorista registrado. NO cotices ni tomes pedido (regla 12): dile con amabilidad que la atención de mayoristas es directa y pásale ${linkWhatsAppMayoristas()}.`
    )
  }
  if (cliente && cliente.aceptaMarketing === null) {
    partes.push(
      'CONSENTIMIENTO DE PROMOCIONES: pendiente. Esta persona nunca ha respondido a si quiere recibir promociones; sigue la regla 11.'
    )
  }
  return partes.join('\n')
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
      return consultarPrecio(client, tenantId, String(i.busqueda ?? ''), sedeId ?? null)
    case 'listarCatalogo':
      return listarCatalogo(client, tenantId, String(i.busqueda ?? ''), sedeId ?? null)
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
): { forzar: boolean; motivo?: string; textoConfiable?: boolean } {
  // Catering: SIEMPRE lo atiende una persona. crearPedido ya rechaza cualquier ítem de catering; además se
  // fuerza la escalada acá, aunque el modelo no haya llamado a escalarAHumano por su cuenta.
  if (
    nombreTool === 'crearPedido' &&
    typeof resultadoTool === 'object' &&
    resultadoTool !== null &&
    'ok' in resultadoTool &&
    (resultadoTool as { ok: boolean }).ok === false &&
    (resultadoTool as { error?: string }).error === 'CATERING_REQUIERE_PERSONA'
  ) {
    return { forzar: true, motivo: 'Pedido de catering — lo cotiza y confirma una persona del equipo.' }
  }
  // Pedido que el servidor no pudo validar (sin horario cargado del local, producto sin clasificar…): no se creó nada y se
  // deriva a una persona CON un resumen listo para confirmar. El texto del modelo no es confiable (no sabe que se forzó).
  if (
    nombreTool === 'crearPedido' &&
    typeof resultadoTool === 'object' &&
    resultadoTool !== null &&
    'ok' in resultadoTool &&
    (resultadoTool as { ok: boolean }).ok === false &&
    (resultadoTool as { error?: string }).error === 'NO_SE_PUDO_VALIDAR'
  ) {
    const d = ((resultadoTool as { detalle?: { motivo?: string; resumen?: string } }).detalle ?? {}) as { motivo?: string; resumen?: string }
    return {
      forzar: true,
      motivo: `Pedido que no se pudo validar solo (${d.motivo ?? 'sin detalle'}). Resumen para confirmar: ${d.resumen ?? 'sin resumen'}`,
    }
  }
  // Pedido registrado que una persona debe seguir (delivery por cotizar y coordinar, o datos de pago por
  // enviar). El pedido SÍ existe, así que el texto que escribió el modelo (número, total, qué sigue) es
  // confiable y NO se reemplaza por el mensaje fijo.
  if (
    nombreTool === 'crearPedido' &&
    typeof resultadoTool === 'object' &&
    resultadoTool !== null &&
    'ok' in resultadoTool &&
    (resultadoTool as { ok: boolean }).ok === true &&
    typeof (resultadoTool as { atencionHumana?: unknown }).atencionHumana === 'string'
  ) {
    return { forzar: true, motivo: String((resultadoTool as { atencionHumana?: unknown }).atencionHumana), textoConfiable: true }
  }
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
  campana: string | null,
  conversacionId: string | null,
  ahora?: Date
): CrearPedidoInput {
  const i = (inputCrudo ?? {}) as Record<string, unknown>
  const items = Array.isArray(i.items) ? (i.items as Record<string, unknown>[]) : []
  return {
    esPrueba,
    campana,
    conversacionId,
    ahora,
    cliente: {
      nombre: String(i.clienteNombre ?? ''),
      telefono: String(i.clienteTelefono ?? ''),
    },
    sedeId,
    sedeElegida: i.sedeRecojo ? String(i.sedeRecojo) : null,
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
      textoRespuesta: conAvisoPrimeraHora(RESPUESTA_ALERGIA_FIJA, opciones.ahora ?? new Date()),
      nuevoEstado: escalarSiCorresponde(estadoActual),
      herramientasUsadas: [],
      motivoEscalacion: 'Mención de alergia/intolerancia/"libre de" — escalada automática, sin pasar por el modelo.',
    }
  }

  // Número del bot (la conversación no trae sede): el modelo tiene que preguntar en qué local recoge el cliente.
  // Locales, horarios y cobertura de delivery: van en TODA conversación (con o sin sede en el número).
  // El horario de cada local sale SOLO de la tabla por día (`sedes_horarios`): el texto se genera de ahí, no se escribe a mano.
  const locales = await horariosDeLocales(client)
  const contextoLocales = `\n\n${textoContextoLocales(
    locales.map((l) => ({ nombre: l.nombre, direccion: l.direccion, horario: textoHorarioBot(l.horarios) || null })),
    parsearDistritosDelivery(env.DISTRITOS_DELIVERY)
  )}`
  let contextoSede = ''
  if (!sedeId) contextoSede = `\n\n${textoContextoSede(locales.map((l) => l.nombre))}`

  // Quién escribe: nombre confirmado y consentimiento de promociones (lo decide el servidor, ver textoContextoCliente).
  const clienteDeLaConversacion = opciones.conversacionId
    ? await leerClienteDeConversacion(client, tenantId, opciones.conversacionId)
    : null
  const contextoCliente = `\n\n${textoContextoCliente(clienteDeLaConversacion)}`

  const anthropic = new Anthropic({ apiKey: obtenerApiKey() })

  const mensajes = construirMensajesParaModelo(historialPrevio, mensajeEntrante)
  const ahoraDelTurno = opciones.ahora ?? new Date()
  // Corte, pedidos para hoy y horario de HOY de cada local (estructurado: sedes_horarios).
  const contextoCortes = textoContextoCortes(ahoraDelTurno, textoHorarioDeHoy(ahoraDelTurno, locales))

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
      system: `${SYSTEM_PROMPT}\n\n${contextoFechaActual(ahoraDelTurno)}\n${contextoCortes}${contextoLocales}${contextoSede}${contextoCliente}`,
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
      const textoBase = escaladaForzadaSinAvisoDelModelo
        ? RESPUESTA_ESCALADA_FORZADA_FIJA
        : texto || 'Perdona, no supe cómo responder eso — ¿quieres que te contacte alguien del equipo?'
      // Fuera del horario de las personas, todo lo que pasa a una persona dice «te escribimos a primera hora»
      // (lo garantiza el servidor aunque el modelo no lo haya dicho).
      const textoRespuesta = debeEscalar ? conAvisoPrimeraHora(textoBase, ahoraDelTurno) : textoBase

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

      if (bloque.name === 'registrarConsentimientoPromociones') {
        const acepta = (bloque.input as { acepta?: unknown } | undefined)?.acepta
        if (typeof acepta !== 'boolean') {
          resultadosTool.push({
            type: 'tool_result',
            tool_use_id: bloque.id,
            content: 'acepta debe ser true o false: solo guárdalo cuando la persona respondió con claridad.',
            is_error: true,
          })
        } else if (!opciones.conversacionId) {
          // Simulador / prueba sin conversación real: no hay cliente al que guardarle nada.
          resultadosTool.push({
            type: 'tool_result',
            tool_use_id: bloque.id,
            content: JSON.stringify({ ok: true, guardado: false, motivo: 'conversación de prueba: no se guarda' }),
          })
        } else {
          try {
            const resultado = await guardarConsentimientoPromociones(client, tenantId, opciones.conversacionId, acepta)
            resultadosTool.push({ type: 'tool_result', tool_use_id: bloque.id, content: JSON.stringify(resultado) })
          } catch (err) {
            resultadosTool.push({
              type: 'tool_result',
              tool_use_id: bloque.id,
              content: `Error guardando la respuesta: ${err instanceof Error ? err.message : String(err)}`,
              is_error: true,
            })
          }
        }
        continue
      }

      if (bloque.name === 'crearPedido') {
        try {
          const resultado = await crearPedido(
            client,
            tenantId,
            canal,
            construirInputCrearPedido(
              bloque.input,
              sedeId,
              opciones.esPrueba === true,
              opciones.campana ?? null,
              opciones.conversacionId ?? null,
              opciones.ahora
            )
          )
          if (resultado.ok) {
            pedidosCreados.push({ numero: resultado.numero, estado: resultado.estado, total: resultado.total, sedeId: resultado.sedeId, paraHoy: resultado.paraHoy, resumen: resultado.resumen })
          }
          const decision = decidirEscaladaForzadaPorTool(bloque.name, resultado)
          if (decision.forzar) {
            debeEscalar = true
            motivoEscalacion = decision.motivo
            // Pedido real que sigue una persona: el texto del modelo (número, total, qué sigue) es el
            // correcto, no se reemplaza por el mensaje fijo de "lo revisa el equipo".
            if (decision.textoConfiable) elModeloLlamoEscalarAHumano = true
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
    textoRespuesta: conAvisoPrimeraHora('Dame un toque, quiero confirmar bien esto con el equipo antes de decirte algo 🙏', ahoraDelTurno),
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
    `select estado, historial, sede_id, canal, contexto, pausada_por_echo, ultimo_mensaje_humano_en, whatsapp_phone_number_id
     from conversaciones where id = $1 and tenant_id = $2`,
    [conversacionId, tenantId]
  )
  const fila = rows[0]
  if (!fila) return null

  const historialPrevio = (fila.historial ?? []) as TurnoHistorial[]

  // Auto-retorno del bot (Coexistence) — evaluación perezosa, sin cron: solo
  // ahora, al llegar un mensaje nuevo del cliente. Aplica ÚNICAMENTE a las
  // conversaciones que quedaron `atendida_por_operador` por un echo (el equipo
  // respondió desde el celular) y cuyo último mensaje humano ya tiene más de
  // AUTO_RETORNO_BOT_HORAS. Una escalada del bot que tomó un humano nunca
  // entra acá (pausada_por_echo = false, ver debeAutoRetornarAlBot). El UPDATE
  // repite las condiciones: si otro proceso movió la conversación entre el
  // select y este update (otro echo, un operador), no pisa nada.
  let estadoActual: EstadoConversacion = fila.estado
  if (
    debeAutoRetornarAlBot(
      {
        estado: fila.estado,
        pausadaPorEcho: fila.pausada_por_echo === true,
        ultimoMensajeHumanoEn: fila.ultimo_mensaje_humano_en ?? null,
      },
      new Date(),
      env.AUTO_RETORNO_BOT_HORAS
    )
  ) {
    const retorno = await client.query(
      `update conversaciones
       set estado = 'activa',
           contexto = contexto || jsonb_build_object('autoRetorno', jsonb_build_object('en', now(), 'horas', $3::numeric))
       where id = $1 and tenant_id = $2 and estado = 'atendida_por_operador' and pausada_por_echo`,
      [conversacionId, tenantId, env.AUTO_RETORNO_BOT_HORAS]
    )
    if (retorno.rowCount) estadoActual = 'activa'
  }
  const estadoNormalizado: EstadoConversacion = estadoActual === 'cerrada' ? 'activa' : estadoActual

  const ahora = new Date().toISOString()
  const entradaCliente: TurnoHistorial = { rol: 'cliente', texto: mensajeTexto, en: ahora }

  if (estadoNormalizado === 'escalada' || estadoNormalizado === 'atendida_por_operador') {
    await client.query(
      `update conversaciones set historial = historial || $1::jsonb, ultimo_mensaje_en = now() where id = $2`,
      [JSON.stringify([entradaCliente]), conversacionId]
    )
    return null
  }

  // Un solo número para los dos locales (el «número del bot»): la sede de la conversación NO sale del número, así
  // que aunque ya tenga una asignada (el local que el cliente eligió en su pedido anterior) el bot vuelve a
  // preguntar en qué local recoge. Con el número de un local, la sede de la conversación sí manda.
  let sedeParaElBot: string | undefined = fila.sede_id ?? undefined
  if (fila.whatsapp_phone_number_id) {
    const { rows: conexion } = await client.query(`select uso from whatsapp_conexiones where phone_number_id = $1`, [
      fila.whatsapp_phone_number_id,
    ])
    if (conexion[0]?.uso === 'bot') sedeParaElBot = undefined
  }

  const resultado = await evaluarTurno(
    client,
    tenantId,
    historialPrevio,
    mensajeTexto,
    estadoNormalizado,
    fila.canal as Canal,
    sedeParaElBot,
    { campana: typeof fila.contexto?.campana === 'string' ? fila.contexto.campana : null, conversacionId }
  )

  const entradaBot: TurnoHistorial = { rol: 'bot', texto: resultado.textoRespuesta, en: new Date().toISOString() }

  // El local que el cliente eligió al pedir (recojo en tienda) pasa a ser el local de la conversación; así esa
  // sede la ve en su bandeja. Un delivery nace sin sede y no cambia nada acá. Y si el bot derivó a una persona,
  // queda el motivo para mostrarlo en la bandeja («Reclamo · pide reembolso»).
  const sedeElegida = [...(resultado.pedidosCreados ?? [])].reverse().find((p) => p.sedeId)?.sedeId ?? null
  const escaloAhora = resultado.nuevoEstado === 'escalada' // (llegar aquí implica que la conversación estaba activa)
  await client.query(
    `update conversaciones
        set historial = historial || $1::jsonb,
            estado = $2,
            ultimo_mensaje_en = now(),
            sede_id = coalesce($4::uuid, sede_id),
            contexto = case when $5::text is not null
                            then contexto || jsonb_build_object('ultimaEscalacion', jsonb_build_object('motivo', $5::text, 'en', now()))
                            else contexto end
      where id = $3`,
    [
      JSON.stringify([entradaCliente, entradaBot]),
      resultado.nuevoEstado,
      conversacionId,
      sedeElegida,
      escaloAhora ? (resultado.motivoEscalacion ?? 'Escalada solicitada por el bot.') : null,
    ]
  )

  return resultado
}
