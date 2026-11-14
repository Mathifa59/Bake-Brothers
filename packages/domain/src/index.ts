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
  CAPACIDAD_ESTANDAR_BOCADITOS_POR_HORA,
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
  REDES_CAMPANA,
  NUMERO_WHATSAPP_ATENCION,
  URL_ENLACES_CORTOS,
  enlaceCortoCampana,
  referenciaDeCampana,
  enlaceWhatsAppCampana,
  describirCampana,
  type RedCampana,
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
export { ultimos9, mismoTelefono, telefonoLegible, normalizarTelefono, normalizarTelefonoWhatsApp } from "./telefono.js"
export { claveNombreCliente, tamanoHabitualDesdeCodigo, type TamanoHabitual } from "./clientes.js"
export {
  productoDisponibleEnSede,
  type FilaStockSede,
  type MotivoNoDisponible,
  type ConsultaDisponibilidad,
  type ResultadoDisponibilidad,
} from './disponibilidadSede.js'
export { ESTADOS_EQUIPO, estadoEquipo, type EstadoEquipo } from './estadosEquipo.js'
export {
  CORTE_MANANA_MINUTOS,
  ATENCION_PERSONAS_DESDE_LUN_SAB_MINUTOS,
  ATENCION_PERSONAS_DESDE_DOMINGO_MINUTOS,
  ATENCION_PERSONAS_HASTA_MINUTOS,
  atencionPersonasDesde,
  proximaAtencionLegible,
  textoPrimeraHora,
  pasoElCorteDeManana,
  fechaMinimaPorEncargo,
  validarFechaDePedido,
  hayPersonasAtendiendo,
  conAvisoPrimeraHora,
  textoContextoCortes,
  type ResultadoFechaPedido,
} from "./cortesAtencion.js"
export { agruparHorario, rangoDeDias, textoHorarioBot, renglonesHorarioWeb, horarioJsonLd, type GrupoHorario } from './horarioSemanal.js'
export {
  horaLegible,
  minutosDeTime,
  horarioDelDia,
  diaDeSemana,
  nombreDeDia,
  validarHoraDeRecojo,
  textoHorarioDeHoy,
  type HorarioDia,
  type MotivoHoraInvalida,
  type ResultadoHoraRecojo,
} from './horarioLocal.js'
export { CORTE_HORA, CORTE_MINUTO, CORTE_TEXTO, evaluarCorteOrden, type ResultadoCorte as ResultadoCorteOrden } from './corteOrdenes.js'
export {
  prioridadDeProduccion,
  produccionMadrugada,
  esMiniEmpanada,
  horaDeHoja,
  medioPagoDeHoja,
  abreviaturaDeSabor,
  armarFilasMayoristas,
  armarAgendados,
  armarHorasCriticas,
  SABORES_MAYORISTA,
  LIMITE_PRIORIDAD_ALTA_MIN,
  LIMITE_PRIORIDAD_MEDIA_MIN,
  type PrioridadProduccion,
  type FilaMayorista,
  type PedidoAgendado,
  type GrupoAgendado,
  type LineaAgendada,
  type LineaCritica,
} from './hojasImpresas.js'
export { entidadDeCobro, NOMBRE_ENTIDAD_COBRO, type EntidadCobro } from './cobros.js'
export { puedeRecibirEnvioMasivo, PREGUNTA_PROMOCIONES, type ClienteParaEnvioMasivo } from './consentimientoMarketing.js'
export { minutosDelDia, saleAntesDeLas8, horaCanonica, LIMITE_DESPACHO_TEMPRANO_MIN } from './horaPedido.js'
export {
  AREAS_PRODUCCION,
  nombreDeArea,
  ESTADOS_EN_PLAN,
  esDomingoISO,
  armarPlanDelDia,
  armarHojaProduccion,
  armarEmpaqueMayorista,
  saborDeEmpanada,
  posicionSabor,
  FILA_VARIADA,
  type AreaProduccion,
  type ModoProduccion,
  type LineaDemanda,
  type LineaVitrina,
  type ProducidoDia,
  type LineaPlan,
  type FilaEmpanada,
  type LineaAntesDe8,
  type HojaProduccion,
  type LineaOrdenMayorista,
  type OrdenMayorista,
  type BloqueMayorista,
} from './planProduccion.js'

export {
  normalizarPalabras,
  coincidePalabraClave,
  reglaParaComentario,
  elegirRespuestaPublica,
  textoDelDm,
  LIMITES_RESPUESTA_AUTOMATICA,
  RESPUESTAS_PUBLICAS_SUGERIDAS,
  HORAS_ENTRE_DMS_MISMA_CAMPANA,
  VENTANA_RESPUESTA_PRIVADA_DIAS,
  dentroDeVentanaRespuestaPrivada,
  type ReglaRespuestaAutomatica,
} from './respuestasAutomaticas.js'
