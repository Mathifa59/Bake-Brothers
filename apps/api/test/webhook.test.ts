// DATABASE_URL/META_VERIFY_TOKEN se fijan en vitest.config.ts, no acá: env.ts
// valida process.env al importarse (import estático, corre antes que
// cualquier código propio de este archivo) — asignarlas aquí arriba no
// llegaría a tiempo. GET/POST /webhook no tocan la base de datos de todos
// modos (no empiezan con /api/, el preHandler de tenant las ignora).
import { describe, it, expect } from 'vitest'
import { buildApp } from '../src/app.js'
import { META_VERIFY_TOKEN_DE_PRUEBA } from './testEnv.js'

describe('GET /webhook (verificación de Meta)', () => {
  it('responde el challenge cuando el modo y el token coinciden', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/webhook',
      query: { 'hub.mode': 'subscribe', 'hub.verify_token': META_VERIFY_TOKEN_DE_PRUEBA, 'hub.challenge': 'abc123' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('abc123')
  })

  it('rechaza un verify_token incorrecto', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/webhook',
      query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'lo-que-sea', 'hub.challenge': 'abc123' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('rechaza un hub.mode distinto de subscribe', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/webhook',
      query: { 'hub.mode': 'unsubscribe', 'hub.verify_token': META_VERIFY_TOKEN_DE_PRUEBA, 'hub.challenge': 'abc123' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('rechaza una verificación sin los parámetros de Meta', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/webhook' })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /webhook', () => {
  it('acepta cualquier payload y responde 200 sin procesarlo', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/webhook',
      payload: { entry: [{ id: '123', changes: [] }] },
    })
    expect(res.statusCode).toBe(200)
  })
})
