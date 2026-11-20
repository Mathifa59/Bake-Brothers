import { NOMBRE_DE_PERFIL, esPerfil } from './permisosPanel.js'

/**
 * Cómo se lee en pantalla el registro de auditoría de Equipo (quién creó, cambió o desactivó cada cuenta). La API
 * devuelve filas con `accion` y un `detalle` con el antes/después; acá se convierten en frases. Lógica pura.
 */
export type AccionAuditoria = 'crear' | 'editar' | 'desactivar' | 'reactivar' | 'cambiar_password' | 'invitar'

export interface RegistroAuditoriaVista {
  accion: string
  actorNombre: string | null
  objetivoNombre: string | null
  detalle: Record<string, unknown>
}

const ETIQUETA_CAMPO: Record<string, string> = {
  nombre: 'Nombre',
  usuario: 'Usuario',
  perfiles: 'Perfiles',
  sede_id: 'Local',
  avisa_ordenes: 'Avisos de órdenes',
  avisa_pagos: 'Avisos de pagos',
  es_encargado: 'Encargado',
}

const nombreDePerfil = (p: unknown): string => (typeof p === 'string' && esPerfil(p) ? NOMBRE_DE_PERFIL[p] : String(p))

export function valorLegible(campo: string, valor: unknown, nombreSede: (id: string) => string): string {
  if (valor === null || valor === undefined || valor === '') return 'ninguno'
  if (campo === 'perfiles' && Array.isArray(valor)) return valor.length ? valor.map(nombreDePerfil).join(', ') : 'ninguno'
  if (campo === 'sede_id') return nombreSede(String(valor))
  if (typeof valor === 'boolean') return valor ? 'sí' : 'no'
  return String(valor)
}

/** «Perfiles: Caja → Caja, Órdenes» por cada campo que cambió. */
export function cambiosAuditoria(detalle: Record<string, unknown>, nombreSede: (id: string) => string = (id) => id): string[] {
  const lineas: string[] = []
  for (const [campo, cambio] of Object.entries(detalle ?? {})) {
    const c = cambio as { antes?: unknown; despues?: unknown } | null
    if (!c || typeof c !== 'object' || !('despues' in c)) continue
    lineas.push(`${ETIQUETA_CAMPO[campo] ?? campo}: ${valorLegible(campo, c.antes, nombreSede)} → ${valorLegible(campo, c.despues, nombreSede)}`)
  }
  return lineas
}

/** La frase principal: «Javier desactivó la cuenta de Caja Cedros». Sin actor = hecho directamente en la base de datos. */
export function tituloAuditoria(r: Pick<RegistroAuditoriaVista, 'accion' | 'actorNombre' | 'objetivoNombre'>): string {
  const quien = r.actorNombre?.trim() || 'Alguien en la base de datos'
  const de = r.objetivoNombre?.trim() || 'una cuenta'
  switch (r.accion) {
    case 'crear':
      return `${quien} creó la cuenta de ${de}`
    case 'editar':
      return `${quien} cambió la cuenta de ${de}`
    case 'desactivar':
      return `${quien} desactivó la cuenta de ${de}`
    case 'reactivar':
      return `${quien} reactivó la cuenta de ${de}`
    case 'cambiar_password':
      return `${quien} cambió la contraseña de ${de}`
    case 'invitar':
      return `${quien} invitó por correo a ${de}`
    default:
      return `${quien} hizo un cambio en la cuenta de ${de}`
  }
}

/** Resumen de una cuenta recién creada: perfiles y local. */
export function resumenCreacion(detalle: Record<string, unknown>, nombreSede: (id: string) => string = (id) => id): string | null {
  const perfiles = Array.isArray(detalle?.perfiles) ? (detalle.perfiles as unknown[]).map(nombreDePerfil).join(', ') : null
  const sede = typeof detalle?.sede_id === 'string' ? nombreSede(detalle.sede_id) : null
  const partes = [perfiles && `Perfiles: ${perfiles}`, sede && `Local: ${sede}`].filter(Boolean)
  return partes.length ? partes.join(' · ') : null
}
