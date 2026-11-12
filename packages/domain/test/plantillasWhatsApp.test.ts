import { describe, expect, it } from 'vitest'
import { completarPlantilla, normalizarPlantillaMeta, textoDePlantilla, variablesDeTexto } from '../src/index.js'

// Formas reales de lo que devuelve GET /{waba_id}/message_templates.
const confirmacion = {
  name: 'confirmacion_pedido',
  language: 'es',
  status: 'APPROVED',
  category: 'UTILITY',
  parameter_format: 'POSITIONAL',
  components: [
    { type: 'HEADER', format: 'TEXT', text: 'Pedido {{1}}', example: { header_text: ['BB-2500'] } },
    { type: 'BODY', text: 'Hola {{1}}, recibimos tu pedido por S/ {{2}}.', example: { body_text: [['Ana', '45.90']] } },
    { type: 'FOOTER', text: 'Bake Brothers' },
    { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Gracias' }, { type: 'URL', text: 'Ver pedido', url: 'https://x.pe/p/{{1}}', example: ['BB-2500'] }] },
  ],
}

describe('plantillas de WhatsApp', () => {
  it('detecta variables posicionales y con nombre, sin repetir', () => {
    expect(variablesDeTexto('Hola {{1}}, {{ 2 }} y otra vez {{1}}')).toEqual(['1', '2'])
    expect(variablesDeTexto('Hola {{nombre_cliente}}')).toEqual(['nombre_cliente'])
    expect(variablesDeTexto('sin variables')).toEqual([])
  })

  it('normaliza una plantilla de Meta con encabezado, cuerpo, pie y botones', () => {
    const p = normalizarPlantillaMeta(confirmacion)!
    expect(p).toMatchObject({ nombre: 'confirmacion_pedido', idioma: 'es', categoria: 'UTILITY', soportada: true, pie: 'Bake Brothers' })
    expect(p.variables.map((v) => v.clave)).toEqual(['encabezado:1', 'cuerpo:1', 'cuerpo:2', 'boton:1'])
    expect(p.variables.find((v) => v.clave === 'cuerpo:2')?.ejemplo).toBe('45.90')
    expect(p.botones.map((b) => b.tipo)).toEqual(['QUICK_REPLY', 'URL'])
  })

  it('marca como NO soportadas las que llevan imagen, autenticación o carrusel', () => {
    const conImagen = normalizarPlantillaMeta({ ...confirmacion, components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Hola' }] })!
    expect(conImagen.soportada).toBe(false)
    expect(conImagen.motivoNoSoportada).toContain('imagen')
    const otp = normalizarPlantillaMeta({ name: 'otp', language: 'es', category: 'AUTHENTICATION', components: [{ type: 'BODY', text: 'Tu código es {{1}}' }] })!
    expect(otp.soportada).toBe(false)
    expect(normalizarPlantillaMeta({ nombre: 'sin formato' })).toBeNull()
    expect(normalizarPlantillaMeta(null)).toBeNull()
  })

  it('arma el texto para el historial y los components que pide la Cloud API', () => {
    const p = normalizarPlantillaMeta(confirmacion)!
    const r = completarPlantilla(p, { 'encabezado:1': 'BB-2500', 'cuerpo:1': 'Ana', 'cuerpo:2': '45.90', 'boton:1': 'BB-2500' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.texto).toBe('Pedido BB-2500\n\nHola Ana, recibimos tu pedido por S/ 45.90.\n\nBake Brothers')
    expect(r.componentes).toEqual([
      { type: 'header', parameters: [{ type: 'text', text: 'BB-2500' }] },
      { type: 'body', parameters: [{ type: 'text', text: 'Ana' }, { type: 'text', text: '45.90' }] },
      { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: 'BB-2500' }] },
    ])
  })

  it('exige todas las variables y limpia saltos de línea', () => {
    const p = normalizarPlantillaMeta(confirmacion)!
    const falta = completarPlantilla(p, { 'cuerpo:1': 'Ana', 'cuerpo:2': '  ' })
    expect(falta).toEqual({ ok: false, error: 'FALTAN_VARIABLES', faltan: ['encabezado:1', 'cuerpo:2', 'boton:1'] })
    const limpia = completarPlantilla(p, { 'encabezado:1': 'x', 'cuerpo:1': 'Ana\nPérez', 'cuerpo:2': '1', 'boton:1': 'y' })
    expect(limpia.ok && limpia.componentes[1].parameters[0].text).toBe('Ana Pérez')
  })

  it('las variables con nombre viajan con parameter_name', () => {
    const p = normalizarPlantillaMeta({
      name: 'recordatorio', language: 'es', category: 'UTILITY', parameter_format: 'NAMED',
      components: [{ type: 'BODY', text: 'Hola {{cliente}}, tu pedido sale {{hora}}.', example: { body_text_named_params: [{ param_name: 'cliente', example: 'Ana' }, { param_name: 'hora', example: '8 am' }] } }],
    })!
    expect(p.variables.map((v) => [v.nombre, v.ejemplo])).toEqual([['cliente', 'Ana'], ['hora', '8 am']])
    const r = completarPlantilla(p, { 'cuerpo:cliente': 'Luis', 'cuerpo:hora': '7:30 am' })
    expect(r.ok && r.componentes[0].parameters).toEqual([
      { type: 'text', text: 'Luis', parameter_name: 'cliente' },
      { type: 'text', text: '7:30 am', parameter_name: 'hora' },
    ])
  })

  it('no deja enviar una plantilla no soportada', () => {
    const p = normalizarPlantillaMeta({ name: 'foto', language: 'es', category: 'MARKETING', components: [{ type: 'HEADER', format: 'VIDEO' }, { type: 'BODY', text: 'Mira' }] })!
    expect(completarPlantilla(p, {})).toEqual({ ok: false, error: 'PLANTILLA_NO_SOPORTADA' })
  })

  it('la vista previa muestra {{n}} hasta que se llena', () => {
    const p = normalizarPlantillaMeta(confirmacion)!
    expect(textoDePlantilla(p)).toContain('Hola {{1}}')
    expect(textoDePlantilla(p, { 'cuerpo:1': 'Ana' })).toContain('Hola Ana, recibimos tu pedido por S/ {{2}}')
  })
})
