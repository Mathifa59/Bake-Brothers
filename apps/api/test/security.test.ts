// Verifica los dos plugins de seguridad globales agregados en el barrido de
// seguridad previo a conectar el bot a tráfico real: helmet (headers) y
// rate-limit (límite por IP). /health no necesita DB/tenant, así que sirve
// para probar ambos sin depender de nada más.
import { describe, it, expect } from 'vitest'
import { buildApp } from '../src/app.js'

describe('helmet — headers de seguridad básicos', () => {
  it('GET /health trae HSTS y X-Content-Type-Options', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['strict-transport-security']).toBeTruthy()
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('Cross-Origin-Resource-Policy queda en cross-origin (apps/web consume esta API desde otro origen)', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin')
  })
})

describe('rate-limit — límite por IP en endpoints públicos', () => {
  it('permite tráfico normal (bien por debajo del límite) y trae los headers de X-RateLimit-*', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-ratelimit-limit']).toBeTruthy()
    expect(res.headers['x-ratelimit-remaining']).toBeTruthy()
  })

  it('corta con 429 al superar el límite configurado (100/min) — probado de verdad, no simulado', async () => {
    const app = await buildApp()
    const limite = 100
    let ultimaRespuesta
    for (let i = 0; i < limite + 1; i++) {
      ultimaRespuesta = await app.inject({ method: 'GET', url: '/health' })
    }
    expect(ultimaRespuesta!.statusCode).toBe(429)
    expect(ultimaRespuesta!.headers['retry-after']).toBeTruthy()
  }, 20_000)
})
