// El service worker del panel (apps/admin/public/sw.js) corre en el celular, donde no se puede probar desde acá. Se
// ejecuta aquí dentro de un sandbox con un `self` falso y se le simulan los eventos reales (push, notificationclick)
// para comprobar lo que hace con el payload que manda la API (services/avisos.ts → payloadDeAviso):
//   - push: muestra SIEMPRE una notificación (Chrome lo exige) con el título/cuerpo, un tag por conversación,
//     vibración y destino; el aviso «esperando persona» no se descarta solo.
//   - un push sin datos o con texto que no es JSON no rompe nada.
//   - tocar la notificación: con el panel ya abierto lo trae al frente y le dice a qué pantalla ir; sin panel abierto, lo abre.
import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { payloadDeAviso } from '../src/services/avisos.js'

const SW = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../admin/public/sw.js'), 'utf8')
const ORIGEN = 'https://dashboard.bakebrothers.pe'

function cargarSw() {
  const oyentes: Record<string, (e: unknown) => void> = {}
  const mostradas: { titulo: string; opciones: Record<string, unknown> }[] = []
  const ventanas: { url: string; focus: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn> }[] = []
  const abiertas: string[] = []
  const self = {
    location: { origin: ORIGEN },
    addEventListener: (tipo: string, fn: (e: unknown) => void) => (oyentes[tipo] = fn),
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn(),
      matchAll: async () => ventanas,
      openWindow: async (url: string) => abiertas.push(url),
    },
    registration: {
      showNotification: async (titulo: string, opciones: Record<string, unknown>) => {
        mostradas.push({ titulo, opciones })
      },
    },
  }
  vm.runInNewContext(SW, { self, URL })
  const esperar = async (e: { _p?: Promise<unknown> }) => e._p
  const evento = (extra: Record<string, unknown> = {}) => {
    const e: Record<string, unknown> & { _p?: Promise<unknown> } = { ...extra, waitUntil: (p: Promise<unknown>) => (e._p = p) }
    return e
  }
  return { oyentes, mostradas, ventanas, abiertas, esperar, evento }
}

describe('service worker del panel', () => {
  it('push: muestra la notificación del aviso, con tag por conversación y destino', async () => {
    const sw = cargarSw()
    const payload = payloadDeAviso({ tipo: 'esperando_persona', titulo: 'Lucía espera que la atiendan', cuerpo: 'Quiero una torta', conversacionId: 'abc-123', sedeId: null })
    const e = sw.evento({ data: { json: () => payload, text: () => JSON.stringify(payload) } })
    sw.oyentes.push(e)
    await sw.esperar(e)
    expect(sw.mostradas).toHaveLength(1)
    expect(sw.mostradas[0].titulo).toBe('Lucía espera que la atiendan')
    expect(sw.mostradas[0].opciones).toMatchObject({
      body: 'Quiero una torta',
      tag: 'conv-abc-123',
      renotify: true,
      requireInteraction: true, // «esperando persona» no se descarta sola
      data: { url: '/#/conversaciones?c=abc-123' },
    })
    expect(sw.mostradas[0].opciones.vibrate).toBeTruthy()
  })

  it('push de «mensaje nuevo»: se descarta sola (no exige interacción)', async () => {
    const sw = cargarSw()
    const payload = payloadDeAviso({ tipo: 'mensaje_nuevo', titulo: 'Mensaje nuevo de Ana', cuerpo: 'Hola', conversacionId: 'c9', sedeId: null })
    const e = sw.evento({ data: { json: () => payload } })
    sw.oyentes.push(e)
    await sw.esperar(e)
    expect(sw.mostradas[0].opciones.requireInteraction).toBe(false)
  })

  it('push sin datos o con un texto que no es JSON: igual muestra una notificación (el navegador lo exige) y no revienta', async () => {
    for (const data of [null, { json: () => { throw new Error('no es JSON') }, text: () => 'texto suelto' }]) {
      const sw = cargarSw()
      const e = sw.evento({ data })
      sw.oyentes.push(e)
      await sw.esperar(e)
      expect(sw.mostradas).toHaveLength(1)
      expect(sw.mostradas[0].titulo).toBe('Bake OS')
    }
  })

  it('tocar la notificación con el panel abierto: lo trae al frente y le dice a qué conversación ir', async () => {
    const sw = cargarSw()
    const ventana = { url: `${ORIGEN}/#/pedidos`, focus: vi.fn(async () => {}), postMessage: vi.fn() }
    sw.ventanas.push(ventana, { url: 'https://otro-sitio.test/', focus: vi.fn(), postMessage: vi.fn() })
    const cerrar = vi.fn()
    const e = sw.evento({ notification: { close: cerrar, data: { url: '/#/conversaciones?c=abc-123' } } })
    sw.oyentes.notificationclick(e)
    await sw.esperar(e)
    expect(cerrar).toHaveBeenCalled()
    expect(ventana.focus).toHaveBeenCalled()
    expect(ventana.postMessage).toHaveBeenCalledWith({ tipo: 'abrir', url: '/#/conversaciones?c=abc-123' })
    expect(sw.abiertas).toHaveLength(0)
  })

  it('tocar la notificación sin el panel abierto: lo abre en esa conversación', async () => {
    const sw = cargarSw()
    const e = sw.evento({ notification: { close: vi.fn(), data: { url: '/#/conversaciones?c=zzz' } } })
    sw.oyentes.notificationclick(e)
    await sw.esperar(e)
    expect(sw.abiertas).toEqual(['/#/conversaciones?c=zzz'])
  })
})
