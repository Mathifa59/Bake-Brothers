-- ============================================================================
-- 0015_embedding_dimension_voyage — corrige la dimensión real del embedding
--
-- 0010 dejó `embedding vector(1536)` como decisión provisional (dimensión de
-- OpenAI text-embedding-3-small, "la más común" en ese momento, sin
-- proveedor elegido todavía — ver el comentario de esa migración). Elegido
-- Voyage AI (voyage-3.5), confirmado con una llamada real a su API (no
-- asumido): devuelve vectores de 1024, no 1536. La tabla está vacía
-- (0 filas) — no hay datos que migrar, solo cambia el tipo de la columna.
-- ============================================================================

alter table contenido_rag alter column embedding type vector(1024);
