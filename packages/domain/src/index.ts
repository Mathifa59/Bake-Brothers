export { SIZE_FACTORS, EXTRA_PRICE, type TamanoId } from './constants.js'

export {
  OFFSET_LIMA,
  partesLima,
  fechaLimaISO,
  sumarDiasISO,
  inicioDiaLima,
  diaSemanaLegible,
  type PartesLima,
} from './zonaLima.js'

export {
  cuentaComoIngreso,
  sumarIngresos,
  ventasPorHora,
  ventanasComparacion,
  variacionPorcentual,
  type PedidoVenta,
  type VentaHora,
  type VentanaComparacion,
} from './resumenDia.js'

export {
  tiemposDeRespuesta,
  resumirAtencion,
  type TurnoAtencion,
  type TiemposRespuesta,
  type ResumenAtencion,
} from './atencion.js'

export {
  segmentarClientes,
  DIAS_SIN_COMPRAR,
  COMPRAS_FRECUENTE,
  type ClienteSegmentable,
  type PedidoDeCliente,
  type SegmentosClientes,
} from './segmentosClientes.js'

export {
  COLUMNAS_PRODUCCION,
  columnaDeProduccion,
  accionDeProduccion,
  armarTablero,
  type ColumnaProduccion,
  type AccionProduccion,
  type TableroProduccion,
} from './tableroProduccion.js'

export {
  construirAlertas,
  antiguedadLegible,
  type StockAgotado,
  type PedidoPreProduccion,
  type ConversacionEscalada,
  type EntradaAlertas,
  type AlertasControlTower,
} from './alertas.js'

export {
  precioPorTamano,
  calcularPrecioLinea,
  calcularSubtotal,
  type LineaPedido,
} from './pricing.js'

export {
  horasDeAnticipacion,
  cumpleAnticipacionMinima,
  esDomingo,
  hayCupoDisponible,
  cupoRestante,
} from './availability.js'

export {
  evaluarSemaforoCatering,
  type SemaforoCatering,
  type ReglaCateringInput,
  type PedidoCateringInput,
} from './cateringSemaforo.js'

export {
  ESTADOS_PEDIDO,
  TRANSICIONES_VALIDAS,
  ESTADOS_QUE_CUENTAN_COMO_INGRESO,
  esEstadoPedido,
  puedeTransicionar,
  estadoLegible,
  type EstadoPedido,
  type TipoEntrega,
} from './orderStatus.js'

export {
  ESTADOS_CONVERSACION,
  TRANSICIONES_VALIDAS_CONVERSACION,
  esEstadoConversacion,
  puedeTransicionarConversacion,
  estadoConversacionLegible,
  type EstadoConversacion,
} from './conversationStatus.js'

export {
  referenciaDeUtm,
  agregarReferenciaAlMensaje,
  extraerReferencia,
  limpiarReferencia,
} from './campana.js'

export {
  filasDesdeMatriz,
  parsearPrecio,
  agruparPorProducto,
  compararCatalogoMifact,
  type FilaMifact,
  type LecturaExcelMifact,
  type CodigoGuardado,
  type ItemCatalogo,
  type ProductoMifact,
  type VarianteCruzada,
  type Coincidencia,
  type AmbiguaMifact,
  type SoloMifact,
  type ComparacionMifact,
} from './mifact.js'
