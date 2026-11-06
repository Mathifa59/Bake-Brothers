import { describe, it, expect } from 'vitest'
import { distritoTieneCobertura, parsearDistritosDelivery } from '../src/coberturaDelivery.js'

const ZONAS = parsearDistritosDelivery(
  'Chorrillos, Surco, Miraflores, San Isidro, Villa el Salvador, San Juan de Miraflores, La Victoria, Jesús María, Lince'
)

describe('parsearDistritosDelivery', () => {
  it('parte por comas, punto y coma o saltos de línea y descarta vacíos', () => {
    expect(parsearDistritosDelivery('Surco, Lince;Chorrillos\n Barranco ,, ')).toEqual(['Surco', 'Lince', 'Chorrillos', 'Barranco'])
    expect(parsearDistritosDelivery(undefined)).toEqual([])
    expect(parsearDistritosDelivery('')).toEqual([])
  })
})

describe('distritoTieneCobertura', () => {
  it('reconoce los distritos de la ficha sin importar tildes, mayúsculas ni "distrito de"', () => {
    for (const d of ['Chorrillos', 'surco', 'MIRAFLORES', 'San Isidro', 'jesus maria', 'Jesús María', 'distrito de Lince', 'en Chorrillos', 'La Victoria', 'villa el salvador']) {
      expect(distritoTieneCobertura(d, ZONAS), d).toBe(true)
    }
  })

  it('un distrito fuera de la lista no tiene cobertura', () => {
    for (const d of ['Barranco', 'San Borja', 'La Molina', 'Callao', 'Ate']) {
      expect(distritoTieneCobertura(d, ZONAS), d).toBe(false)
    }
  })

  it('no confunde distritos parecidos: "San Juan" o "Salvador" solos no son San Juan de Miraflores ni Villa el Salvador', () => {
    expect(distritoTieneCobertura('San Juan', ZONAS)).toBe(false)
    expect(distritoTieneCobertura('Salvador', ZONAS)).toBe(false)
    expect(distritoTieneCobertura('San Juan de Miraflores', ZONAS)).toBe(true)
    // y Miraflores solo calza con Miraflores, no por estar dentro de "San Juan de Miraflores"
    expect(distritoTieneCobertura('Miraflores', ['San Juan de Miraflores'])).toBe(false)
  })

  it('texto vacío no tiene cobertura; lista vacía significa sin restricción', () => {
    expect(distritoTieneCobertura('', ZONAS)).toBe(false)
    expect(distritoTieneCobertura('   ', ZONAS)).toBe(false)
    expect(distritoTieneCobertura('Cualquiera', [])).toBe(true)
  })
})
