/**
 * Datos de EJEMPLO que aparecen en la documentación pública de Mifact (github.com/mifact/apijson, carpeta
 * «Ejemplos Archivos JSON UBL 2_1», sus PDF y su Excel de campos). Ninguno es un cliente de Bake Brothers.
 *
 * Existe para que un comprobante NUNCA salga con la identidad de un ejemplo (pasó en la prueba contra el demo: un
 * correo llegó saludando a «OSYS COMPANY SAC», el cliente de ejemplo de Mifact, porque el recorrido de pruebas le
 * pasó ese receptor a mano). El receptor de un comprobante sale únicamente del cliente del pedido, y esta lista es la
 * red de seguridad:
 *   · `resolverReceptor` rechaza un documento, un correo o una razón social de empresa de esta lista;
 *   · un test (apps/api/test/comprobantesSinDatosDeEjemplo.test.ts) falla si CUALQUIER valor de aquí aparece en el JSON
 *     que se manda a Mifact.
 * Los nombres de persona comunes («MARIA GONZALES») no se bloquean en la emisión real (podría haber un cliente con ese
 * nombre), pero sí los vigila el test, que usa datos de cliente propios.
 */

export const DATOS_EJEMPLO_MIFACT = {
  /** RUC/DNI/otros documentos de los ejemplos (incluye el RUC de pruebas de Mifact, 20100100100). */
  documentos: ['20601847834', '40506089', '20510797524', '20511689687', '20553560765', '20200200200', '403939333', '20100100100'],
  /** Correos de los ejemplos y de su plantilla de PDF. */
  correos: [
    'mifact@outlook.com',
    'correodelcliente@outlook.com',
    'correodetucliente@outlook.com',
    'mifact@correodelcliente.com',
    'correo_del_cliente@tudominio.com',
    'convenios@rapisueldo.com.pe',
  ],
  /** Razones sociales de EMPRESAS de los ejemplos (receptores y emisores). */
  empresas: [
    'OSYS COMPANY SAC',
    'ALTI & TAAR INVERSIONES S.A.C.',
    'ARPE CONTRATISTAS GENERALES SOCIEDAD ANONIMA CERRADA',
    'JNETSYS CLOUD SOLUTIONS SAC',
    'TRAMONTINA MEXICO',
    'BATERIAS NUEVO AMANECER S.A.C',
    'EMPRESA DEMO',
    'EMPRESA DEMO SAC',
    'EMPRESA DEMOS SAC',
    'DEMO MIFACT',
  ],
  /** Nombres de persona de los ejemplos (solo los vigila el test). */
  personas: ['MARIA GONZALES', 'Jaime Jimenez', 'KAREN'],
  /** Direcciones de los ejemplos. */
  direcciones: [
    'direccion del cliente',
    'AV. MARISCAL CASTILLA 43343',
    'CALLE LOS JAZMINES',
    'CALLE MONTE ALAMO 1010',
    'MONTE ALAMO',
    'NICOLAS ARRIOLA NRO. 2095',
    'AV. LAS GAVIOTAS LT. 18B',
    'CAL. 15 LT. 6 MZ. R URB. CARABAYLLO',
    'Jr. Portada del Sol',
    'avenida abcd',
  ],
  /** Códigos de ítem, descripciones de ítem, usuarios y otros textos de los ejemplos. */
  otros: [
    'BCF-RR01',
    'BCF-RR02',
    'BCF-xxxx',
    'AUTO TOYOTA YARIS',
    'SUV TOYOTA 2019',
    'DETALLE DEL PRODUCTO 2',
    'CHANCHO AL PALO',
    'POLLO VIVO',
    'PARRIPOLLO 2',
    'HNT384',
    'jmifact',
    'usuarioABCD',
    'usuario_xyz',
    'USER_mifact',
    'ORDENCOMPRA123',
    'texto para alguna observacion',
    'alguna observacion',
    '0002883838383',
  ],
} as const

/** Minúsculas y sin tildes: para comparar sin que importe cómo se escribió. */
export const normalizarParaComparar = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const CONJUNTO = (lista: readonly string[]) => new Set(lista.map(normalizarParaComparar))
const DOCUMENTOS = CONJUNTO(DATOS_EJEMPLO_MIFACT.documentos)
const CORREOS = CONJUNTO(DATOS_EJEMPLO_MIFACT.correos)
const EMPRESAS = CONJUNTO(DATOS_EJEMPLO_MIFACT.empresas)

export const esDocumentoDeEjemploMifact = (doc: string): boolean => DOCUMENTOS.has(normalizarParaComparar(doc))
export const esCorreoDeEjemploMifact = (correo: string): boolean => CORREOS.has(normalizarParaComparar(correo))
export const esEmpresaDeEjemploMifact = (nombre: string): boolean => EMPRESAS.has(normalizarParaComparar(nombre))

/** Todos los valores de ejemplo (para el test que revisa un JSON completo). */
export const todosLosDatosDeEjemploMifact = (): string[] =>
  Object.values(DATOS_EJEMPLO_MIFACT).flatMap((lista) => [...lista])
