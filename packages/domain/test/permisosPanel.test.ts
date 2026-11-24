import { describe, expect, it } from 'vitest'
import {
  PERFILES,
  RUTAS_POR_PERFIL,
  nombreDePerfiles,
  perfilesEfectivos,
  puedeVerRuta,
  rutaInicial,
  tienePerfil,
  veClientesCompleto,
  veTodosLosLocales,
  type Perfil,
} from '../src/index.js'

const TODAS = ['resumen', 'control-tower', 'pedidos', 'nuevo-pedido', 'ordenes', 'produccion', 'stock', 'catalogo', 'clientes', 'atencion', 'conversaciones', 'metricas', 'atribucion', 'plan-vitrina', 'equipo', 'unidades', 'ajustes', 'avisos']
const rutasDe = (perfiles: Perfil[]) => TODAS.filter((r) => puedeVerRuta(perfiles, r))

describe('perfiles del panel', () => {
  it('Administración abre todo', () => {
    expect(rutasDe(['administracion'])).toEqual(TODAS)
  })

  it('cada perfil abre solo lo suyo (más Ajustes y Avisos)', () => {
    expect(rutasDe(['caja'])).toEqual(['pedidos', 'stock', 'ajustes', 'avisos'])
    expect(rutasDe(['venta_digital'])).toEqual(['pedidos', 'nuevo-pedido', 'clientes', 'conversaciones', 'ajustes', 'avisos'])
    expect(rutasDe(['ordenes'])).toEqual(['ordenes', 'unidades', 'ajustes', 'avisos'])
    expect(rutasDe(['produccion'])).toEqual(['produccion', 'ajustes', 'avisos'])
  })

  it('Equipo (cuentas del panel) solo lo abre Administración', () => {
    expect(puedeVerRuta(['administracion'], 'equipo')).toBe(true)
    for (const p of PERFILES.filter((x) => x !== 'administracion')) expect(puedeVerRuta([p], 'equipo'), p).toBe(false)
    expect(puedeVerRuta(['caja', 'venta_digital', 'ordenes', 'produccion'], 'equipo')).toBe(false)
  })

  it('Resumen, Métricas y Clientes completo no los abre nadie más que Administración', () => {
    for (const p of PERFILES.filter((x) => x !== 'administracion')) {
      expect(puedeVerRuta([p], 'resumen')).toBe(false)
      expect(puedeVerRuta([p], 'metricas')).toBe(false)
      expect(puedeVerRuta([p], 'catalogo')).toBe(false)
      expect(veClientesCompleto([p])).toBe(false)
    }
    expect(veClientesCompleto(['administracion'])).toBe(true)
  })

  it('una cuenta con varios perfiles abre la unión', () => {
    expect(rutasDe(['venta_digital', 'ordenes'])).toEqual(['pedidos', 'nuevo-pedido', 'ordenes', 'clientes', 'conversaciones', 'unidades', 'ajustes', 'avisos'])
  })

  it('el empleado transitorio conserva exactamente el acceso de antes (sin Clientes)', () => {
    expect(rutasDe(['empleado_temporal'])).toEqual(['pedidos', 'nuevo-pedido', 'ordenes', 'produccion', 'stock', 'conversaciones', 'ajustes', 'avisos'].sort((a, b) => TODAS.indexOf(a) - TODAS.indexOf(b)))
    expect(puedeVerRuta(['empleado_temporal'], 'clientes')).toBe(false)
  })

  it('una ruta con «/», «#/» o parámetros se reconoce igual', () => {
    expect(puedeVerRuta(['caja'], '/pedidos?x=1')).toBe(true)
    expect(puedeVerRuta(['caja'], '#/stock')).toBe(true)
    expect(puedeVerRuta(['caja'], '/conversaciones')).toBe(false)
  })

  it('sin perfiles no abre nada', () => {
    expect(puedeVerRuta([], 'pedidos')).toBe(false)
    expect(puedeVerRuta(null, 'avisos')).toBe(false)
  })

  it('pantalla de inicio por perfil', () => {
    expect(rutaInicial(['administracion'])).toBe('/resumen')
    expect(rutaInicial(['caja'])).toBe('/pedidos')
    expect(rutaInicial(['venta_digital', 'ordenes'])).toBe('/conversaciones')
    expect(rutaInicial(['ordenes'])).toBe('/ordenes')
    expect(rutaInicial(['produccion'])).toBe('/produccion')
    expect(rutaInicial([])).toBe('/avisos')
  })

  it('sin perfiles guardados se derivan del rol', () => {
    expect(perfilesEfectivos('admin', [])).toEqual(['administracion'])
    expect(perfilesEfectivos('operador', null)).toEqual(['empleado_temporal'])
    expect(perfilesEfectivos('operador', ['caja', 'cualquiera'])).toEqual(['caja'])
    expect(perfilesEfectivos(null, [])).toEqual([])
  })

  it('alcance por local: Venta digital y Órdenes no se filtran; Caja y Producción sí', () => {
    expect(veTodosLosLocales(['venta_digital'], 'conversaciones')).toBe(true)
    expect(veTodosLosLocales(['venta_digital'], 'pedidos')).toBe(true)
    expect(veTodosLosLocales(['ordenes'], 'ordenes')).toBe(true)
    expect(veTodosLosLocales(['ordenes'], 'pedidos')).toBe(true)
    expect(veTodosLosLocales(['caja'], 'pedidos')).toBe(false)
    expect(veTodosLosLocales(['caja'], 'stock')).toBe(false)
    expect(veTodosLosLocales(['produccion'], 'produccion')).toBe(false)
    expect(veTodosLosLocales(['administracion'], 'stock')).toBe(true)
    // Una cuenta Caja + Órdenes: pedidos sin filtro (por Órdenes) pero Stock sigue en su local (Caja).
    expect(veTodosLosLocales(['caja', 'ordenes'], 'stock')).toBe(false)
    expect(veTodosLosLocales(['empleado_temporal'], 'pedidos')).toBe(false)
  })

  it('tienePerfil: Administración cuenta siempre', () => {
    expect(tienePerfil(['administracion'], 'caja')).toBe(true)
    expect(tienePerfil(['caja'], 'venta_digital')).toBe(false)
    expect(tienePerfil(['venta_digital', 'ordenes'], 'ordenes')).toBe(true)
  })

  it('nombre para el encabezado', () => {
    expect(nombreDePerfiles(['venta_digital', 'ordenes'])).toBe('Venta digital + Órdenes')
    expect(nombreDePerfiles(['administracion'])).toBe('Administración')
    expect(Object.keys(RUTAS_POR_PERFIL)).toHaveLength(PERFILES.length - 1)
  })
})
