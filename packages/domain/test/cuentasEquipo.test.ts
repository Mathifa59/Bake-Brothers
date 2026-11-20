import { describe, expect, it } from 'vitest'
import {
  correoDeAcceso,
  correoInterno,
  esCorreoInterno,
  esCorreoValido,
  validarContrasena,
  validarUsuario,
} from '../src/index.js'

describe('cuentas del equipo', () => {
  it('usuario: normaliza y valida el formato', () => {
    expect(validarUsuario('  Caja.Cedros ')).toEqual({ ok: true, usuario: 'caja.cedros' })
    expect(validarUsuario('empaque_1')).toEqual({ ok: true, usuario: 'empaque_1' })
    for (const malo of ['ab', 'caja cedros', 'cája', '.caja', 'a'.repeat(31), 'sara@bakebrothers.pe', '']) {
      expect(validarUsuario(malo).ok, malo).toBe(false)
    }
  })

  it('contraseña: mínimo 10 y tope de bcrypt', () => {
    expect(validarContrasena('corta').ok).toBe(false)
    expect(validarContrasena('1234567890').ok).toBe(true)
    expect(validarContrasena('x'.repeat(73)).ok).toBe(false)
    expect(validarContrasena('ñ'.repeat(40)).ok).toBe(false) // 80 bytes
  })

  it('el correo interno se arma con el dominio del equipo', () => {
    expect(correoInterno('Caja.Cedros')).toBe('caja.cedros@equipo.bakebrothers.pe')
    expect(correoInterno('x1', 'otro.pe')).toBe('x1@otro.pe')
    expect(esCorreoInterno('caja.cedros@equipo.bakebrothers.pe')).toBe(true)
    expect(esCorreoInterno('sara.leon@bakebrothers.pe')).toBe(false)
  })

  it('al entrar: sin «@» se completa el dominio; con «@» se respeta el correo', () => {
    expect(correoDeAcceso('  Caja.Cedros ')).toBe('caja.cedros@equipo.bakebrothers.pe')
    expect(correoDeAcceso('Sara.Leon@BakeBrothers.pe')).toBe('sara.leon@bakebrothers.pe')
    expect(correoDeAcceso('adminbake@bake-brothers.com')).toBe('adminbake@bake-brothers.com')
  })

  it('correo real', () => {
    expect(esCorreoValido('sara.leon@bakebrothers.pe')).toBe(true)
    expect(esCorreoValido('sara leon@x.pe')).toBe(false)
    expect(esCorreoValido('sara@')).toBe(false)
  })
})
