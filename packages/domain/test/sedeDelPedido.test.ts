import { describe, expect, it } from 'vitest'
import { encontrarSedePorNombre, resolverSedeDelPedido } from '../src/sedeDelPedido.js'

const sedes = [
  { id: 'id-cedros', nombre: 'Cedros' },
  { id: 'id-sm', nombre: 'Santa Marina' },
]

describe('encontrarSedePorNombre', () => {
  it.each([
    ['Cedros', 'id-cedros'],
    ['cedros', 'id-cedros'],
    ['en Cedros', 'id-cedros'],
    ['sede Cedros', 'id-cedros'],
    ['el local de Santa Marina', 'id-sm'],
    ['santa marina', 'id-sm'],
    ['SANTA MARINA', 'id-sm'],
    ['Santa', 'id-sm'], // basta una parte que identifique una sola sede
  ])('"%s" → %s', (texto, id) => {
    expect(encontrarSedePorNombre(texto, sedes)?.id).toBe(id)
  })

  it.each([[''], ['   '], ['Miraflores'], ['la tienda']])('"%s" no calza con ninguna', (texto) => {
    expect(encontrarSedePorNombre(texto, sedes)).toBeNull()
  })

  it('si el texto podría ser de dos sedes no elige ninguna', () => {
    const dos = [{ id: 'a', nombre: 'Marina Norte' }, { id: 'b', nombre: 'Marina Sur' }]
    expect(encontrarSedePorNombre('marina', dos)).toBeNull()
  })
})

describe('resolverSedeDelPedido', () => {
  it('la sede de la conversación (número de un local) manda y no se pregunta nada', () => {
    expect(resolverSedeDelPedido({ tipoEntrega: 'tienda', sedeDeLaConversacion: 'id-sm', sedes })).toEqual({
      ok: true, sedeId: 'id-sm', motivo: 'sede_de_la_conversacion',
    })
    // ni siquiera aunque el modelo mande otra cosa
    expect(resolverSedeDelPedido({ tipoEntrega: 'tienda', sedeDeLaConversacion: 'id-sm', sedeElegida: 'Cedros', sedes })).toMatchObject({ sedeId: 'id-sm' })
  })

  it('recojo en tienda sin haber elegido local → SEDE_REQUERIDA, con las sedes para preguntar', () => {
    expect(resolverSedeDelPedido({ tipoEntrega: 'tienda', sedes })).toEqual({ ok: false, error: 'SEDE_REQUERIDA', sedesDisponibles: ['Cedros', 'Santa Marina'] })
    expect(resolverSedeDelPedido({ tipoEntrega: 'tienda', sedeElegida: '  ', sedes })).toMatchObject({ error: 'SEDE_REQUERIDA' })
  })

  it('recojo en tienda con un local que existe → ese local', () => {
    expect(resolverSedeDelPedido({ tipoEntrega: 'tienda', sedeElegida: 'recojo en santa marina', sedes })).toEqual({
      ok: true, sedeId: 'id-sm', motivo: 'recojo_en_tienda',
    })
  })

  it('recojo en tienda con un local inventado, o diciendo "delivery", → SEDE_NO_VALIDA (nunca asigna a ciegas)', () => {
    expect(resolverSedeDelPedido({ tipoEntrega: 'tienda', sedeElegida: 'Miraflores', sedes })).toMatchObject({ ok: false, error: 'SEDE_NO_VALIDA' })
    expect(resolverSedeDelPedido({ tipoEntrega: 'tienda', sedeElegida: 'delivery a domicilio', sedes })).toMatchObject({ ok: false, error: 'SEDE_NO_VALIDA' })
  })

  it('delivery: va a la sede que lo despacha según la configuración del negocio', () => {
    expect(resolverSedeDelPedido({ tipoEntrega: 'delivery', sedeDelivery: 'Cedros', sedes })).toEqual({
      ok: true, sedeId: 'id-cedros', motivo: 'delivery_sede_configurada',
    })
  })

  it('delivery sin sede configurada (o con una que no existe): se crea igual, sin sede, y queda dicho el motivo', () => {
    expect(resolverSedeDelPedido({ tipoEntrega: 'delivery', sedes })).toEqual({ ok: true, sedeId: null, motivo: 'delivery_sin_sede_configurada' })
    expect(resolverSedeDelPedido({ tipoEntrega: 'delivery', sedeDelivery: 'Miraflores', sedes })).toMatchObject({ sedeId: null, motivo: 'delivery_sin_sede_configurada' })
  })

  it('delivery no pregunta el local aunque el modelo mande uno', () => {
    expect(resolverSedeDelPedido({ tipoEntrega: 'delivery', sedeElegida: 'Santa Marina', sedeDelivery: 'Cedros', sedes })).toMatchObject({ sedeId: 'id-cedros' })
  })
})
