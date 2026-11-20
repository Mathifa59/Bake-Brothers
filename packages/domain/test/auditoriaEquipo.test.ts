import { describe, expect, it } from 'vitest'
import { cambiosAuditoria, resumenCreacion, tituloAuditoria } from '../src/index.js'

const sedes: Record<string, string> = { a: 'Cedros', b: 'Santa Marina' }
const sede = (id: string) => sedes[id] ?? id

describe('auditoría de Equipo: cómo se lee', () => {
  it('frase principal por acción, con quién y sobre quién', () => {
    const base = { actorNombre: 'Javier', objetivoNombre: 'Caja Cedros' }
    expect(tituloAuditoria({ ...base, accion: 'crear' })).toBe('Javier creó la cuenta de Caja Cedros')
    expect(tituloAuditoria({ ...base, accion: 'editar' })).toBe('Javier cambió la cuenta de Caja Cedros')
    expect(tituloAuditoria({ ...base, accion: 'desactivar' })).toBe('Javier desactivó la cuenta de Caja Cedros')
    expect(tituloAuditoria({ ...base, accion: 'reactivar' })).toBe('Javier reactivó la cuenta de Caja Cedros')
    expect(tituloAuditoria({ ...base, accion: 'cambiar_password' })).toBe('Javier cambió la contraseña de Caja Cedros')
    expect(tituloAuditoria({ ...base, accion: 'invitar' })).toBe('Javier invitó por correo a Caja Cedros')
  })

  it('sin actor se dice que fue directo en la base; sin nombre, «una cuenta»', () => {
    expect(tituloAuditoria({ accion: 'editar', actorNombre: null, objetivoNombre: null })).toBe('Alguien en la base de datos cambió la cuenta de una cuenta')
  })

  it('cada cambio, con antes → después y nombres legibles', () => {
    const lineas = cambiosAuditoria(
      {
        perfiles: { antes: ['caja'], despues: ['caja', 'venta_digital'] },
        sede_id: { antes: 'a', despues: 'b' },
        avisa_ordenes: { antes: false, despues: true },
        nombre: { antes: null, despues: 'Caja' },
      },
      sede
    )
    expect(lineas).toEqual([
      'Perfiles: Caja → Caja, Venta digital',
      'Local: Cedros → Santa Marina',
      'Avisos de órdenes: no → sí',
      'Nombre: ninguno → Caja',
    ])
  })

  it('un detalle vacío o raro no rompe', () => {
    expect(cambiosAuditoria({})).toEqual([])
    expect(cambiosAuditoria({ perfiles: 'x' } as never)).toEqual([])
  })

  it('resumen de una cuenta recién creada', () => {
    expect(resumenCreacion({ perfiles: ['produccion'], sede_id: 'a' }, sede)).toBe('Perfiles: Producción y empaque · Local: Cedros')
    expect(resumenCreacion({ perfiles: ['administracion'], sede_id: null })).toBe('Perfiles: Administración')
    expect(resumenCreacion({})).toBeNull()
  })
})
