-- Fix: явное приведение к double precision во внутреннем CASE,
-- иначе Postgres возвращает numeric и не сходится с float в сигнатуре функции.

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
  k constant int := 60;
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
           (case when v.rnk is null then 0.0::float8 else (1.0::float8 / (k + v.rnk)) end)
         + (case when f.rnk is null then 0.0::float8 else (1.0::float8 / (k + f.rnk)) end) as rrf
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
