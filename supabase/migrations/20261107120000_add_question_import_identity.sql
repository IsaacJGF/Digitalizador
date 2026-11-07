-- Identidade de importações em lote; as colunas são opcionais para questões existentes.
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS modalidade text,
  ADD COLUMN IF NOT EXISTS caderno text,
  ADD COLUMN IF NOT EXISTS import_key text;

CREATE UNIQUE INDEX IF NOT EXISTS questions_import_key_unique_idx
  ON public.questions (import_key)
  WHERE import_key IS NOT NULL;
