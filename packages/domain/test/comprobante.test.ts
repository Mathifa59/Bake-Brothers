import { describe, expect, it } from 'vitest'
import {
  CODIGO_TIPO_CPE,
  DATOS_EJEMPLO_MIFACT,
  esDocumentoDeEjemploMifact,
  todosLosDatosDeEjemploMifact,
  ESTADOS_ANULABLES,
  ESTADOS_VIGENTES,
  desglosarLineas,
  estadoComprobanteLegible,
  estadoDeCodigoMifact,
  pedidoEsFacturable,
  resolverReceptor,
  totalesCoinciden,
  validarDni,
  validarRuc,
} from '../src/index.js'

const cent = (n: number) => Math.round(n * 100)

describe('desglose del IGV (precios con IGV incluido, en céntimos enteros)', () => {
  it('una línea de S/ 22.90 → base 19.41 + IGV 3.49 = 22.90 (el caso real que aceptó el demo de Mifact)', () => {
    const d = desglosarLineas([{ descripcion: 'Caja de Alfajores Mix', cantidad: 1, precioUnitarioConIgv: 22.9 }])
    expect(d.gravado).toBe(19.41)
    expect(d.igv).toBe(3.49)
    expect(d.total).toBe(22.9)
    expect(d.lineas[0]).toMatchObject({ valorUnitario: 19.41, valorVenta: 19.41, igv: 3.49, totalConIgv: 22.9 })
  })

  it('varias unidades: el valor unitario puede tener más de 2 decimales y la línea sigue cuadrando', () => {
    const d = desglosarLineas([{ descripcion: 'Caja', cantidad: 2, precioUnitarioConIgv: 22.9 }])
    expect(d.lineas[0].totalConIgv).toBe(45.8)
    expect(d.lineas[0].valorVenta).toBe(38.81)
    expect(d.lineas[0].igv).toBe(6.99)
    expect(d.lineas[0].valorUnitario).toBe(19.405)
    expect(d.total).toBe(45.8)
  })

  it('en TODAS las combinaciones de precio y cantidad: base + IGV = total de la línea, al céntimo, y el IGV es ≈18 % de la base', () => {
    for (let precioC = 50; precioC <= 40000; precioC += 37) {
      for (const cantidad of [1, 2, 3, 6, 12, 24]) {
        const d = desglosarLineas([{ descripcion: 'x', cantidad, precioUnitarioConIgv: precioC / 100 }])
        const l = d.lineas[0]
        expect(cent(l.valorVenta) + cent(l.igv)).toBe(precioC * cantidad)
        expect(cent(l.totalConIgv)).toBe(precioC * cantidad)
        // El IGV difiere del 18 % exacto de la base en menos de 1 céntimo de redondeo (SUNAT tolera hasta 1 sol).
        expect(Math.abs(cent(l.igv) - l.valorVenta * 18)).toBeLessThanOrEqual(1)
        expect(d.gravado + d.igv).toBeCloseTo(d.total, 10)
      }
    }
  })

  it('los totales son la suma de las líneas y no se desvían del pedido', () => {
    const d = desglosarLineas([
      { descripcion: 'A', cantidad: 3, precioUnitarioConIgv: 8.9 },
      { descripcion: 'B', cantidad: 1, precioUnitarioConIgv: 15.9 },
      { descripcion: 'Delivery', cantidad: 1, precioUnitarioConIgv: 7 },
    ])
    expect(d.total).toBe(49.6)
    expect(totalesCoinciden(d.total, 49.6)).toBe(true)
    expect(totalesCoinciden(d.total, 49.61)).toBe(false)
    expect(d.lineas.reduce((s, l) => s + cent(l.valorVenta), 0)).toBe(cent(d.gravado))
    expect(d.lineas.reduce((s, l) => s + cent(l.igv), 0)).toBe(cent(d.igv))
  })

  it('rechaza lo que no se puede facturar: sin líneas, cantidad no entera, precio cero', () => {
    expect(() => desglosarLineas([])).toThrow()
    expect(() => desglosarLineas([{ descripcion: 'x', cantidad: 1.5, precioUnitarioConIgv: 10 }])).toThrow()
    expect(() => desglosarLineas([{ descripcion: 'x', cantidad: 0, precioUnitarioConIgv: 10 }])).toThrow()
    expect(() => desglosarLineas([{ descripcion: 'x', cantidad: 1, precioUnitarioConIgv: 0 }])).toThrow()
  })
})

describe('documentos', () => {
  it('RUC: prefijo y dígito verificador (el de ejemplo de Mifact 20601847834 es válido; 20100100100 de prueba no lo es)', () => {
    expect(validarRuc('20601847834')).toBe(true)
    expect(validarRuc('20612010880')).toBe(true) // Baker Brothers E.I.R.L., el real
    expect(validarRuc('20601847835')).toBe(false)
    expect(validarRuc('20100100100')).toBe(false)
    expect(validarRuc('30601847834')).toBe(false)
    expect(validarRuc('2060184783')).toBe(false)
    expect(validarRuc('20601847x34')).toBe(false)
  })

  it('DNI: exactamente 8 dígitos', () => {
    expect(validarDni('40506089')).toBe(true)
    expect(validarDni('4050608')).toBe(false)
    expect(validarDni('4050608a')).toBe(false)
  })
})

describe('receptor del comprobante', () => {
  it('factura: exige RUC válido y razón social', () => {
    expect(resolverReceptor('factura', { numeroDoc: '12345678', nombre: 'Maria' }, 50)).toMatchObject({ ok: false, error: 'FACTURA_REQUIERE_RUC' })
    expect(resolverReceptor('factura', { numeroDoc: '', nombre: 'Maria' }, 50)).toMatchObject({ ok: false, error: 'FACTURA_REQUIERE_RUC' })
    expect(resolverReceptor('factura', { numeroDoc: '20601847835', nombre: 'X SAC' }, 50)).toMatchObject({ ok: false, error: 'RUC_INVALIDO' })
    expect(resolverReceptor('factura', { numeroDoc: '20123456786', nombre: '  ' }, 50)).toMatchObject({ ok: false, error: 'NOMBRE_REQUERIDO' })
    const r = resolverReceptor('factura', { numeroDoc: '20123456786', nombre: '  PASTELERIA   EJEMPLO SAC ' }, 50)
    expect(r).toMatchObject({ ok: true, receptor: { tipoDoc: '6', numeroDoc: '20123456786', nombre: 'PASTELERIA EJEMPLO SAC', direccion: '-' } })
  })

  it('boleta con DNI: se deduce por el largo y se valida', () => {
    const r = resolverReceptor('boleta', { numeroDoc: '12345678', nombre: 'ANA TORRES', correo: 'ana@ejemplo.pe' }, 80)
    expect(r).toMatchObject({ ok: true, receptor: { tipoDoc: '1', numeroDoc: '12345678', correo: 'ana@ejemplo.pe', direccion: 'SIN DIRECCION' } })
    expect(resolverReceptor('boleta', { tipoDoc: '1', numeroDoc: '4050608', nombre: 'M' }, 80)).toMatchObject({ ok: false, error: 'DNI_INVALIDO' })
    expect(resolverReceptor('boleta', { numeroDoc: '4050608', nombre: 'M' }, 80)).toMatchObject({ ok: false, error: 'DOCUMENTO_NO_RECONOCIDO' })
  })

  it('boleta sin documento: «CLIENTE SIN NOMBRE» hasta S/ 700; por encima SUNAT exige el documento', () => {
    expect(resolverReceptor('boleta', {}, 22.9)).toMatchObject({ ok: true, receptor: { tipoDoc: '0', numeroDoc: '00000000', nombre: 'CLIENTE SIN NOMBRE' } })
    expect(resolverReceptor('boleta', {}, 700)).toMatchObject({ ok: true })
    expect(resolverReceptor('boleta', {}, 700.01)).toMatchObject({ ok: false, error: 'BOLETA_SOBRE_LIMITE_REQUIERE_DOCUMENTO' })
  })

  it('boleta a un RUC también es válida (hay que escribir el RUC bien)', () => {
    expect(resolverReceptor('boleta', { numeroDoc: '20123456786', nombre: 'PASTELERIA EJEMPLO SAC' }, 40)).toMatchObject({ ok: true, receptor: { tipoDoc: '6' } })
    expect(resolverReceptor('boleta', { numeroDoc: '20601847835', nombre: 'OSYS' }, 40)).toMatchObject({ ok: false, error: 'RUC_INVALIDO' })
  })

  it('NUNCA un dato de ejemplo de la documentación de Mifact: RUC, DNI, correo o empresa de sus ejemplos se rechazan', () => {
    expect(resolverReceptor('factura', { numeroDoc: '20601847834', nombre: 'PASTELERIA EJEMPLO SAC' }, 50)).toMatchObject({ ok: false, error: 'DATOS_DE_EJEMPLO' })
    expect(resolverReceptor('boleta', { numeroDoc: '40506089', nombre: 'ANA TORRES' }, 50)).toMatchObject({ ok: false, error: 'DATOS_DE_EJEMPLO' })
    expect(resolverReceptor('boleta', { numeroDoc: '12345678', nombre: 'ANA TORRES', correo: 'mifact@outlook.com' }, 50)).toMatchObject({ ok: false, error: 'DATOS_DE_EJEMPLO' })
    expect(resolverReceptor('factura', { numeroDoc: '20123456786', nombre: 'osys   company sac' }, 50)).toMatchObject({ ok: false, error: 'DATOS_DE_EJEMPLO' })
    // Un nombre de persona común no se bloquea (podría ser un cliente real): lo vigila el test del JSON enviado.
    expect(resolverReceptor('boleta', { numeroDoc: '12345678', nombre: 'MARIA GONZALES' }, 50).ok).toBe(true)
  })

  it('un correo mal escrito se rechaza antes de gastar un correlativo; los textos se limpian y se acotan', () => {
    expect(resolverReceptor('boleta', { numeroDoc: '12345678', nombre: 'M', correo: 'no-es-correo' }, 10)).toMatchObject({ ok: false, error: 'CORREO_INVALIDO' })
    const r = resolverReceptor('boleta', { numeroDoc: '12345678', nombre: `A\nB\u0000${'x'.repeat(200)}` }, 10)
    expect(r.ok && r.receptor.nombre.length).toBe(100)
    expect(r.ok && /[\u0000-\u001f]/.test(r.receptor.nombre)).toBe(false)
  })
})

describe('estados de Mifact', () => {
  it('traduce los 6 códigos documentados y no inventa ninguno más', () => {
    expect(estadoDeCodigoMifact('101')?.estado).toBe('en_proceso')
    expect(estadoDeCodigoMifact('102')?.estado).toBe('aceptado')
    expect(estadoDeCodigoMifact(103)?.estado).toBe('aceptado_con_observaciones')
    expect(estadoDeCodigoMifact('104')?.estado).toBe('rechazado')
    expect(estadoDeCodigoMifact('105')?.estado).toBe('anulado')
    expect(estadoDeCodigoMifact('108')?.estado).toBe('anulacion_solicitada')
    for (const raro of ['', null, undefined, '106', '999', 'abc', 102.5]) expect(estadoDeCodigoMifact(raro as never)).toBeNull()
  })

  it('textos legibles, tipos de comprobante y reglas de qué se puede anular / facturar', () => {
    expect(estadoComprobanteLegible('aceptado')).toBe('Aceptado por SUNAT')
    expect(CODIGO_TIPO_CPE).toEqual({ boleta: '03', factura: '01' })
    expect(ESTADOS_ANULABLES).toEqual(['en_proceso', 'aceptado', 'aceptado_con_observaciones'])
    expect(ESTADOS_VIGENTES).toContain('pendiente_envio')
    expect(ESTADOS_VIGENTES).not.toContain('anulacion_solicitada')
    for (const ok of ['confirmed', 'paid', 'in_production', 'out_for_delivery', 'delivered']) expect(pedidoEsFacturable(ok)).toBe(true)
    for (const no of ['draft', 'payment_pending', 'cancelled', 'otro']) expect(pedidoEsFacturable(no)).toBe(false)
  })
})

describe('lista de datos de ejemplo de Mifact', () => {
  it('se compara sin importar mayúsculas, tildes ni espacios, y no marca datos reales', () => {
    expect(esDocumentoDeEjemploMifact('20601847834')).toBe(true)
    expect(esDocumentoDeEjemploMifact(' 40506089 ')).toBe(true)
    expect(esDocumentoDeEjemploMifact('20123456786')).toBe(false)
    expect(esDocumentoDeEjemploMifact('20612010880')).toBe(false) // Baker Brothers E.I.R.L., real
    expect(esDocumentoDeEjemploMifact('20605451005')).toBe(false) // Hermanos Loarte, real
    expect(todosLosDatosDeEjemploMifact().length).toBe(Object.values(DATOS_EJEMPLO_MIFACT).flat().length)
  })
})
