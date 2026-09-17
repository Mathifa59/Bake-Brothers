-- ============================================================================
-- 0010_contenido_rag — base del RAG del bot (Semana 2)
--
-- Solo estructura: habilita pgvector y crea la tabla que va a guardar el
-- contenido descriptivo (ingredientes, alérgenos, "cómo venderlo", FAQs) con
-- su columna de embedding. NO se generan embeddings en esta migración — eso
-- necesita elegir un proveedor (OpenAI/Voyage/etc.) y correr un job aparte,
-- fuera de alcance de Semana 2 sin credenciales de Meta/LLM todavía.
--
-- vector(1536): dimensión de los modelos de embedding más comunes hoy
-- (OpenAI text-embedding-3-small, Voyage-2). Es una decisión tomada ahora
-- para no dejar la columna sin tipo — si el proveedor elegido más adelante
-- usa otra dimensión, esta columna se vuelve a migrar entonces.
--
-- Sin índice ivfflat/hnsw todavía: no tiene sentido indexar una tabla vacía,
-- y el tipo de índice correcto depende de la métrica de distancia (coseno
-- vs L2) que se decida junto con el proveedor de embeddings.
-- ============================================================================

create extension if not exists vector;

create table contenido_rag (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  -- Qué representa este chunk de contenido — permite al bot filtrar por tipo
  -- antes de hacer la búsqueda semántica (ej. solo FAQs, o solo catering).
  tipo           text not null check (tipo in ('producto', 'combo', 'catering', 'faq', 'general')),
  -- Apunta a products/combos/catering_items según `tipo`; null para
  -- contenido sin un origen estructurado (FAQs, "cómo venderlo" genérico).
  -- Sin FK física a propósito: la tabla de origen varía según `tipo`.
  referencia_id  uuid,
  titulo         text,
  contenido      text not null,
  embedding      vector(1536),
  creado_en      timestamptz not null default now()
);

create index idx_contenido_rag_tipo on contenido_rag (tipo);

grant select, insert, update on contenido_rag to app_api;
