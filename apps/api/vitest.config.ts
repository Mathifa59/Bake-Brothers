import { defineConfig } from 'vitest/config'
import { DATABASE_URL_PLACEHOLDER, META_VERIFY_TOKEN_DE_PRUEBA, CLAVE_CIFRADO_DE_PRUEBA } from './test/testEnv.js'

// env.ts valida process.env al importarse (import estático — corre ANTES de
// cualquier código propio del archivo de test, incluida una asignación a
// process.env escrita arriba de un import). Por eso las variables se fijan
// acá, en la config de vitest, que se aplica antes de que cualquier módulo
// de test se evalúe — no adentro de los archivos de test.
export default defineConfig({
  test: {
    // Los archivos de test comparten UNA base real (sedes temporales, conversaciones, pedidos de prueba y el
    // interruptor del bot): corriendo en paralelo se pisaban entre sí y daban fallos intermitentes que no eran del
    // código. En secuencia el resultado es determinista (~90 s). Dentro de cada archivo los tests ya van en orden.
    fileParallelism: false,
    setupFiles: ['./test/setupBotEncendido.ts'],
    // Borra los clientes que el webhook crea solos durante las pruebas (ver test/globalSetupClientes.ts).
    globalSetup: ['./test/globalSetupClientes.ts'],
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? DATABASE_URL_PLACEHOLDER,
      META_VERIFY_TOKEN: process.env.META_VERIFY_TOKEN ?? META_VERIFY_TOKEN_DE_PRUEBA,
      WHATSAPP_TOKEN_ENCRYPTION_KEY: process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY ?? CLAVE_CIFRADO_DE_PRUEBA,
    },
  },
})
