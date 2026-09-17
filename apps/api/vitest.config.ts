import { defineConfig } from 'vitest/config'
import { DATABASE_URL_PLACEHOLDER, META_VERIFY_TOKEN_DE_PRUEBA } from './test/testEnv.js'

// env.ts valida process.env al importarse (import estático — corre ANTES de
// cualquier código propio del archivo de test, incluida una asignación a
// process.env escrita arriba de un import). Por eso las variables se fijan
// acá, en la config de vitest, que se aplica antes de que cualquier módulo
// de test se evalúe — no adentro de los archivos de test.
export default defineConfig({
  test: {
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? DATABASE_URL_PLACEHOLDER,
      META_VERIFY_TOKEN: process.env.META_VERIFY_TOKEN ?? META_VERIFY_TOKEN_DE_PRUEBA,
    },
  },
})
