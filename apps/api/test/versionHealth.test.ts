// GET /health dice qué commit corre (SOURCE_COMMIT de Coolify) y no expone nada más.
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { commitDesplegado } from '../src/version.js'

const original = { SOURCE_COMMIT: process.env.SOURCE_COMMIT, GIT_COMMIT_SHA: process.env.GIT_COMMIT_SHA }
afterEach(() => {
  for (const [k, v] of Object.entries(original)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('commitDesplegado', () => {
  it('devuelve el hash corto de 7 caracteres en minúscula', () => {
    expect(commitDesplegado({ SOURCE_COMMIT: '25A70444B0703E00952256DDD629BA83DA697D64' })).toBe('25a7044')
    expect(commitDesplegado({ SOURCE_COMMIT: '25a7044' })).toBe('25a7044')
  })

  it('acepta GIT_COMMIT_SHA si no hay SOURCE_COMMIT', () => {
    expect(commitDesplegado({ GIT_COMMIT_SHA: 'abcdef1234' })).toBe('abcdef1')
  })

  it('sin variable, vacía o con algo que no es un hash: «desconocido» (nunca devuelve el valor crudo)', () => {
    expect(commitDesplegado({})).toBe('desconocido')
    expect(commitDesplegado({ SOURCE_COMMIT: '' })).toBe('desconocido')
    expect(commitDesplegado({ SOURCE_COMMIT: 'HEAD' })).toBe('desconocido')
    expect(commitDesplegado({ SOURCE_COMMIT: 'abc123' })).toBe('desconocido') // muy corto
    expect(commitDesplegado({ SOURCE_COMMIT: 'DATABASE_URL=postgres://x' })).toBe('desconocido')
    expect(commitDesplegado({ SOURCE_COMMIT: '25a7044; rm -rf /' })).toBe('desconocido')
  })
})

describe('GET /health', () => {
  it('trae ok y el commit, y NADA más', async () => {
    process.env.SOURCE_COMMIT = '25a70444b0703e00952256ddd629ba83da697d64'
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, commit: '25a7044' })
  })

  it('sin SOURCE_COMMIT sigue respondiendo 200 (el healthcheck de Coolify no depende de esto)', async () => {
    delete process.env.SOURCE_COMMIT
    delete process.env.GIT_COMMIT_SHA
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, commit: 'desconocido' })
  })
})
