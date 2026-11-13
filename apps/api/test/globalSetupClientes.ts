// Limpieza global de la base de PRUEBAS: los clientes que se crean solos al escribir por WhatsApp
// (customers.nombre_confirmado = false, ver encontrarOCrearClienteDeWhatsApp) los generan los tests del webhook y
// ningún test los borra uno por uno. Se limpian al empezar y al terminar toda la corrida.
// Solo corre con una DATABASE_URL real (la de pruebas); nunca contra la base de producción, porque los tests
// jamás reciben esa URL.
import pg from 'pg'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

async function limpiar() {
  const url = process.env.DATABASE_URL
  if (!url || url === DATABASE_URL_PLACEHOLDER) return
  const pool = new pg.Pool({ connectionString: url })
  try {
    // Un cliente auto-creado sin pedidos (si tuviera pedidos, el FK lo protege y se deja).
    await pool.query(
      `delete from customers c where c.nombre_confirmado = false
         and not exists (select 1 from orders o where o.customer_id = c.id)`
    )
  } catch {
    // La base de pruebas puede no tener todavía la columna (migración 0045): no es motivo para fallar la corrida.
  } finally {
    await pool.end()
  }
}

export default async function setup() {
  await limpiar()
  return limpiar
}
