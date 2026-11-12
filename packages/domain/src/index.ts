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
  debeAutoRetornarAlBot,
  HORAS_AUTO_RETORNO_BOT_POR_DEFECTO,
  type EstadoConversacion,
  type ConversacionParaAutoRetorno,
} from './conversationStatus.js'

export { distritoTieneCobertura, parsearDistritosDelivery } from './coberturaDelivery.js'

export {
  evaluarPagoReportado,
  DIAS_MAXIMOS_ANTIGUEDAD_CAPTURA,
  type ExtraccionPago,
  type EvaluacionPago,
} from './pagoReportado.js'

export {
  resolverSedeDelPedido,
  encontrarSedePorNombre,
  type SedeDisponible,
  type ResultadoSedePedido,
} from './sedeDelPedido.js'

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

export { RUTAS_DE_EMPLEADO, puedeVerRuta, rutaInicial, nombreDeRol, type RolPanel } from "./permisosPanel.js"
export { HORAS_VENTANA_WHATSAPP, estadoVentana24h, ultimoMensajeDelCliente, type EstadoVentana, type MensajeConHora } from "./ventanaWhatsApp.js"
export {
  normalizarPlantillaMeta,
  completarPlantilla,
  textoDePlantilla,
  variablesDeTexto,
  limpiarValorVariable,
  type PlantillaWhatsApp,
  type VariablePlantilla,
  type BotonPlantilla,
  type ComponenteEnvio,
  type ParametroEnvio,
  type ResultadoCompletarPlantilla,
} from "./plantillasWhatsApp.js"
export { motivoEscaladaLegible, type CategoriaMotivo, type MotivoLegible } from "./motivoEscalada.js"
export { ultimos9, mismoTelefono, telefonoLegible } from "./telefono.js"
export {
  productoDisponibleEnSede,
  type FilaStockSede,
  type MotivoNoDisponible,
  type ConsultaDisponibilidad,
  type ResultadoDisponibilidad,
} from './disponibilidadSede.js'
export { ESTADOS_EQUIPO, estadoEquipo, type EstadoEquipo } from './estadosEquipo.js'
