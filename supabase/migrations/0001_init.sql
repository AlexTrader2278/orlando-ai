-- ============================================================
-- orlando-ai — initial schema
-- pgvector + Russian FTS + hybrid search via RRF
-- ============================================================

create extension if not exists vector;

-- ============================================================
-- threads
-- ============================================================
create table if not exists threads (
  id                  text primary key,
  root_id             bigint      not null,
  start_date          timestamptz not null,
  end_date            timestamptz not null,
  message_count       int         not null,
  participants_count  int         not null,
  reactions_total     int         not null,
  text                text        not null,
  embedding           vector(1024),
  fts                 tsvector generated always as (to_tsvector('russian', text)) stored
);

-- ============================================================
-- indexes
-- ============================================================
create index if not exists threads_embedding_idx
  on threads using hnsw (embedding vector_cosine_ops);

create index if not exists threads_fts_idx
  on threads using gin (fts);

create index if not exists threads_reactions_idx on threads (reactions_total desc);
create index if not exists threads_msgcount_idx  on threads (message_count desc);

-- ============================================================
-- hybrid search via Reciprocal Rank Fusion
-- vector cosine + Russian tsvector ranks merged into one score
-- ============================================================
create or replace function search_threads(
  query_embedding vector(1024),
  query_text      text,
  match_count     int default 30
)
returns table (
  id                 text,
  text               text,
  start_date         timestamptz,
  end_date           timestamptz,
  message_count      int,
  participants_count int,
  reactions_total    int,
  rrf_score          float
)
language plpgsql
as $$
declare
  k constant int := 60; -- стандартная константа RRF, сглаживает разрывы
begin
  return query
  with
  vec as (
    select t.id,
           row_number() over (order by t.embedding <=> query_embedding) as rnk
    from threads t
    where t.embedding is not null
    order by t.embedding <=> query_embedding
    limit match_count * 3
  ),
  fts as (
    select t.id,
           row_number() over (order by ts_rank(t.fts, plainto_tsquery('russian', query_text)) desc) as rnk
    from threads t
    where t.fts @@ plainto_tsquery('russian', query_text)
    limit match_count * 3
  ),
  fused as (
    select coalesce(v.id, f.id) as id,
           (case when v.rnk is null then 0.0 else 1.0 / (k + v.rnk) end)
         + (case when f.rnk is null then 0.0 else 1.0 / (k + f.rnk) end) as rrf
    from vec v
    full outer join fts f on f.id = v.id
  )
  select t.id, t.text, t.start_date, t.end_date,
         t.message_count, t.participants_count, t.reactions_total,
         fused.rrf
  from fused
  join threads t on t.id = fused.id
  order by fused.rrf desc
  limit match_count;
end;
$$;
