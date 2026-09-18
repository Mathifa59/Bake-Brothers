import type pg from 'pg'

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings'
// Confirmado contra la API real de Voyage (no asumido): voyage-3.5 devuelve
// vectores de 1024 — ver 0015_embedding_dimension_voyage.sql.
const MODELO = 'voyage-3.5'

async function embedTexto(texto: string, inputType: 'query' | 'document'): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) throw new Error('VOYAGE_API_KEY no está configurada')
  const res = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: [texto], model: MODELO, input_type: inputType }),
  })
  if (!res.ok) {
    throw new Error(`Voyage respondió ${res.status}: ${await res.text()}`)
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] }
  return json.data[0].embedding
}

export interface ResultadoRag {
  tipo: string
  titulo: string | null
  contenido: string
  // 1 - distancia coseno (pgvector <=>): más cerca de 1 = más parecido.
  similitud: number
}

/**
 * Búsqueda semántica sobre contenido_rag. `input_type: 'query'` para la
 * pregunta (distinto de 'document', usado al generar los embeddings del
 * contenido) — Voyage optimiza el embedding distinto según el rol en la
 * búsqueda, mejora la calidad del ranking en tareas de retrieval.
 */
export async function buscarContenidoRelevante(
  client: pg.PoolClient,
  tenantId: string,
  pregunta: string,
  limite = 3
): Promise<ResultadoRag[]> {
  const vector = await embedTexto(pregunta, 'query')
  const vectorLiteral = `[${vector.join(',')}]`
  const { rows } = await client.query(
    `select tipo, titulo, contenido, 1 - (embedding <=> $1::vector) as similitud
     from contenido_rag
     where tenant_id = $2 and embedding is not null
     order by embedding <=> $1::vector
     limit $3`,
    [vectorLiteral, tenantId, limite]
  )
  return rows.map((r) => ({
    tipo: r.tipo as string,
    titulo: r.titulo as string | null,
    contenido: r.contenido as string,
    similitud: Number(r.similitud),
  }))
}
