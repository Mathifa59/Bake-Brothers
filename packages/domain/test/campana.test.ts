import { describe, expect, it } from 'vitest'
import { agregarReferenciaAlMensaje, extraerReferencia, limpiarReferencia, referenciaDeUtm } from '../src/campana.js'

describe('referenciaDeUtm', () => {
  it('fuente conocida abreviada + campaña: tiktok / halloween → tt-halloween', () => {
    expect(referenciaDeUtm({ utm_source: 'tiktok', utm_campaign: 'halloween' })).toBe('tt-halloween')
    expect(referenciaDeUtm({ utm_source: 'Instagram', utm_campaign: 'Día de la Madre 2026' })).toBe('ig-dia-de-la-madre-2026')
  })

  it('funciona con URLSearchParams (lo que hay en window.location.search)', () => {
    const p = new URLSearchParams('?utm_source=facebook&utm_medium=cpc&utm_campaign=navidad&utm_content=reel1')
    expect(referenciaDeUtm(p)).toBe('fb-navidad')
  })

  it('fuente desconocida se usa recortada; solo fuente o solo campaña también valen', () => {
    expect(referenciaDeUtm({ utm_source: 'newsletterdeverano', utm_campaign: 'promo' })).toBe('newslett-promo')
    expect(referenciaDeUtm({ utm_source: 'tiktok' })).toBe('tt')
    expect(referenciaDeUtm({ utm_campaign: 'halloween' })).toBe('halloween')
  })

  it('si no hay fuente ni campaña usa el medio; sin nada, null', () => {
    expect(referenciaDeUtm({ utm_medium: 'qr' })).toBe('qr')
    expect(referenciaDeUtm({})).toBeNull()
    expect(referenciaDeUtm({ utm_source: '', utm_campaign: '   ' })).toBeNull()
    expect(referenciaDeUtm(new URLSearchParams('?foo=bar'))).toBeNull()
  })

  it('?ref= a mano se respeta (limpiado) y gana sobre los utm', () => {
    expect(referenciaDeUtm({ ref: 'TT-Halloween', utm_source: 'google', utm_campaign: 'otra' })).toBe('tt-halloween')
  })

  it('nunca produce caracteres raros ni más de 32', () => {
    const r = referenciaDeUtm({ utm_source: 'tiktok', utm_campaign: "Oferta!!! <script>alert(1)</script> ñandú & café con leche muy larga" })!
    expect(r).toMatch(/^[a-z0-9-]+$/)
    expect(r.length).toBeLessThanOrEqual(32)
    expect(r.endsWith('-')).toBe(false)
  })
})

describe('agregarReferenciaAlMensaje / extraerReferencia (ida y vuelta)', () => {
  it('agrega "(ref: …)" al final y el bot la saca sin tocar el resto del mensaje', () => {
    const msg = agregarReferenciaAlMensaje('Hola Bake Brothers 👋 Quiero hacer un pedido', 'tt-halloween')
    expect(msg).toBe('Hola Bake Brothers 👋 Quiero hacer un pedido (ref: tt-halloween)')
    expect(extraerReferencia(msg)).toEqual({ texto: 'Hola Bake Brothers 👋 Quiero hacer un pedido', referencia: 'tt-halloween' })
  })

  it('sin referencia el mensaje no cambia', () => {
    expect(agregarReferenciaAlMensaje('Hola', null)).toBe('Hola')
    expect(agregarReferenciaAlMensaje('Hola', undefined)).toBe('Hola')
  })

  it('tolera sin paréntesis, en mayúsculas y con texto que el cliente agregó después', () => {
    expect(extraerReferencia('Quiero una torta REF: IG-Navidad por favor')).toEqual({ texto: 'Quiero una torta por favor', referencia: 'ig-navidad' })
    expect(extraerReferencia('Hola (ref: tt-halloween) quiero 2 alfajores')).toEqual({ texto: 'Hola quiero 2 alfajores', referencia: 'tt-halloween' })
  })

  it('un mensaje sin referencia se devuelve intacto', () => {
    const t = 'Hola, ¿tienen tortas de chocolate?'
    expect(extraerReferencia(t)).toEqual({ texto: t, referencia: null })
  })

  it('no confunde palabras que solo contienen "ref" (preferencia: …, referencia 5)', () => {
    expect(extraerReferencia('Mi preferencia: sin azúcar').referencia).toBeNull()
    expect(extraerReferencia('la referencia 5 está en la puerta').referencia).toBeNull()
  })

  it('solo toma la primera referencia', () => {
    expect(extraerReferencia('(ref: a1) y (ref: b2)').referencia).toBe('a1')
  })
})

describe('limpiarReferencia', () => {
  it('minúsculas, sin tildes, guiones normalizados', () => {
    expect(limpiarReferencia('  Día   de la MADRE!! ')).toBe('dia-de-la-madre')
    expect(limpiarReferencia('***')).toBe('')
  })
})
