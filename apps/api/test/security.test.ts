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

describe('CORS — orígenes de las apps propias', () => {
  const preflight = (origin: string) =>
    buildApp().then((app) =>
      app.inject({
        method: 'OPTIONS',
        url: '/api/dashboard/orders',
        headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' },
      })
    )

  it.each(['https://dashboard.bake-brothers.com', 'https://bake-brothers-admin.vercel.app', 'https://www.bake-brothers.com'])(
    'permite %s',
    async (origen) => {
      const res = await preflight(origen)
      expect(res.headers['access-control-allow-origin']).toBe(origen)
    }
  )

  // Vistas previas de Vercel de apps/admin (p. ej. la de feature/bake-os).
  it.each([
    'https://bake-brothers-admin-a0dv9qekm-mathias-projects-eaced134.vercel.app',
    'https://bake-brothers-admin-git-feature-bake-os-mathias-projects-eaced134.vercel.app',
  ])('permite la vista previa de Vercel %s', async (origen) => {
    const res = await preflight(origen)
    expect(res.headers['access-control-allow-origin']).toBe(origen)
  })

  it.each([
    'https://bake-brothers-admin-evil.vercel.app', // otro equipo: no termina en el slug del equipo
    'https://bake-brothers-admin-x-mathias-projects-eaced134.vercel.app.evil.example', // sufijo falso
    'http://bake-brothers-admin-x-mathias-projects-eaced134.vercel.app', // sin https
  ])('rechaza el origen parecido %s', async (origen) => {
    const res = await preflight(origen)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('no refleja un origen cualquiera', async () => {
    const res = await preflight('https://sitio-malicioso.example')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})
