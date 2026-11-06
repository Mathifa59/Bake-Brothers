import { describe, expect, it } from 'vitest'
import {
  estadoVentana24h,
  mismoTelefono,
  motivoEscaladaLegible,
  nombreDeRol,
  puedeVerRuta,
  rutaInicial,
  telefonoLegible,
} from '../src/index.js'

describe('permisos del panel: el empleado ve solo Pedidos, Órdenes, Producción, Conversaciones y Stock', () => {
  it('un empleado (rol operador) abre lo suyo, incluido Nuevo pedido', () => {
    for (const r of ['pedidos', 'nuevo-pedido', 'ordenes', 'produccion', 'conversaciones', 'stock', '/pedidos', '#/ordenes', '#/stock', 'pedidos?x=1'])
      expect(puedeVerRuta('operador', r)).toBe(true)
  })
  it('y NO abre lo de dirección', () => {
    for (const r of ['resumen', 'control-tower', 'clientes', 'atencion', 'metricas', 'atribucion', 'mifact', 'simulador', 'plan-vitrina', '/metricas', 'desconocida'])
      expect(puedeVerRuta('operador', r)).toBe(false)
  })
  it('el admin abre todo; sin rol, nada', () => {
    for (const r of ['resumen', 'metricas', 'mifact', 'simulador', 'pedidos']) expect(puedeVerRuta('admin', r)).toBe(true)
    expect(puedeVerRuta(null, 'pedidos')).toBe(false)
    expect(puedeVerRuta(undefined, 'pedidos')).toBe(false)
  })
  it('pantalla inicial y nombre del rol', () => {
    expect(rutaInicial('admin')).toBe('/resumen')
    expect(rutaInicial('operador')).toBe('/pedidos')
    expect(nombreDeRol('operador')).toBe('Empleado')
    expect(nombreDeRol('admin')).toBe('Dirección')
  })
})

describe('ventana de 24 horas de WhatsApp', () => {
  const ahora = new Date('2026-11-05T20:00:00Z')
  const hace = (h: number) => new Date(ahora.getTime() - h * 3_600_000).toISOString()
  it('abierta: cuenta desde el ÚLTIMO mensaje del cliente, no del bot ni del equipo', () => {
    const v = estadoVentana24h(
      [
        { rol: 'cliente', en: hace(30) },
        { rol: 'cliente', en: hace(20.5) },
        { rol: 'operador', en: hace(1) },
        { rol: 'bot', en: hace(0.5) },
      ],
      ahora
    )
    expect(v.abierta).toBe(true)
    expect(v.texto).toBe('Quedan 3 h 30 min')
  })
  it('menos de una hora y justo al vencer', () => {
    expect(estadoVentana24h([{ rol: 'cliente', en: hace(23.5) }], ahora).texto).toBe('Quedan 30 min')
    expect(estadoVentana24h([{ rol: 'cliente', en: hace(24) }], ahora).abierta).toBe(false)
  })
  it('cerrada: pasaron más de 24 h, o el cliente nunca escribió', () => {
    const v = estadoVentana24h([{ rol: 'cliente', en: hace(25) }], ahora)
    expect(v).toMatchObject({ abierta: false, restanteMs: 0, texto: 'Cerrada' })
    expect(estadoVentana24h([{ rol: 'bot', en: hace(1) }], ahora).abierta).toBe(false)
    expect(estadoVentana24h([], ahora).abierta).toBe(false)
  })
  it('ignora horas inválidas', () => {
    expect(estadoVentana24h([{ rol: 'cliente', en: 'no-es-fecha' }], ahora).abierta).toBe(false)
  })
})

describe('motivo de la derivación', () => {
  it('clasifica y acorta', () => {
    expect(motivoEscaladaLegible('Reclamo: pide reembolso.')).toEqual({ categoria: 'Reclamo', etiqueta: 'Reclamo · pide reembolso' })
    // Un detalle largo se recorta para que quepa en una etiqueta de celular.
    expect(motivoEscaladaLegible('Reclamo: pide reembolso por una torta que llegó en mal estado.')?.etiqueta).toBe('Reclamo · pide reembolso por una torta que ll…')
    expect(motivoEscaladaLegible('Pedido de catering — lo cotiza y confirma una persona del equipo.')?.etiqueta).toBe('Catering')
    expect(motivoEscaladaLegible('Mención de alergia/intolerancia/"libre de" — escalada automática, sin pasar por el modelo.')?.etiqueta).toBe('Alergia')
    expect(motivoEscaladaLegible('El cliente mandó una imagen que no es un comprobante de pago (¿referencia de diseño?).')?.categoria).toBe('Pago por revisar')
    expect(motivoEscaladaLegible('Se intentó vender un combo sin composición definida ("sujeto a stock") — requiere revisión del equipo.')?.categoria).toBe('Combo')
  })
  it('lo que no calza queda como Otro, y sin motivo es null', () => {
    expect(motivoEscaladaLegible('Quiere hablar con la dueña')).toEqual({ categoria: 'Otro', etiqueta: 'Quiere hablar con la dueña' })
    expect(motivoEscaladaLegible('')).toBeNull()
    expect(motivoEscaladaLegible(undefined)).toBeNull()
  })
})

describe('teléfonos de Perú', () => {
  it('formato legible', () => {
    expect(telefonoLegible('51912944096')).toBe('+51 912 944 096')
    expect(telefonoLegible('912944096')).toBe('+51 912 944 096')
    expect(telefonoLegible('+1 202 555 0100')).toBe('+12025550100')
  })
  it('compara por los últimos 9 dígitos', () => {
    expect(mismoTelefono('51912944096', '912 944 096')).toBe(true)
    expect(mismoTelefono('51912944096', '911944096')).toBe(false)
    expect(mismoTelefono('123', '123')).toBe(false)
  })
})
