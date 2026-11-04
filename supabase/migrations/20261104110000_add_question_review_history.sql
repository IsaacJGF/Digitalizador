-- Internal question review checklist and audit trail.
CREATE TABLE IF NOT EXISTS public.question_review_checks (
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  criterio TEXT NOT NULL CHECK (criterio IN (
    'texto_base', 'enunciado', 'alternativas', 'gabarito',
    'imagens', 'formatacao', 'dados_prova', 'classificacao'
  )),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN (
    'pendente', 'precisa_ajuste', 'ajustado_pendente_conferencia',
    'conferido_ok', 'nao_se_aplica', 'duvida'
  )),
  observacao TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, criterio)
);

DROP TRIGGER IF EXISTS question_review_checks_touch_updated_at ON public.question_review_checks;
CREATE TRIGGER question_review_checks_touch_updated_at
BEFORE UPDATE ON public.question_review_checks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.question_review_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  criterio TEXT NOT NULL,
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  observacao TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT 'manual' CHECK (motivo IN ('manual', 'questao_editada')),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS question_review_checks_status_idx
  ON public.question_review_checks (status, question_id);
CREATE INDEX IF NOT EXISTS question_review_history_question_date_idx
  ON public.question_review_history (question_id, changed_at DESC);

ALTER TABLE public.question_review_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_review_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_review_checks TO anon, authenticated;
GRANT SELECT ON public.question_review_history TO anon, authenticated;
GRANT ALL ON public.question_review_checks, public.question_review_history TO service_role;

DROP POLICY IF EXISTS "Public read review checks" ON public.question_review_checks;
CREATE POLICY "Public read review checks" ON public.question_review_checks
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public insert review checks" ON public.question_review_checks;
CREATE POLICY "Public insert review checks" ON public.question_review_checks
  FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Public update review checks" ON public.question_review_checks;
CREATE POLICY "Public update review checks" ON public.question_review_checks
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public delete review checks" ON public.question_review_checks;
CREATE POLICY "Public delete review checks" ON public.question_review_checks
  FOR DELETE TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public read review history" ON public.question_review_history;
CREATE POLICY "Public read review history" ON public.question_review_history
  FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.log_question_review_check_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     OR OLD.observacao IS DISTINCT FROM NEW.observacao THEN
    v_reason := COALESCE(NULLIF(current_setting('app.question_review_reason', true), ''), 'manual');
    INSERT INTO public.question_review_history (
      question_id, criterio, status_anterior, status_novo, observacao, motivo
    ) VALUES (
      NEW.question_id, NEW.criterio, OLD.status, NEW.status, NEW.observacao, v_reason
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS question_review_check_history_trigger ON public.question_review_checks;
CREATE TRIGGER question_review_check_history_trigger
AFTER UPDATE ON public.question_review_checks
FOR EACH ROW EXECUTE FUNCTION public.log_question_review_check_change();

CREATE OR REPLACE FUNCTION public.initialize_question_review_checks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.question_review_checks (question_id, criterio)
  VALUES
    (NEW.id, 'texto_base'),
    (NEW.id, 'enunciado'),
    (NEW.id, 'alternativas'),
    (NEW.id, 'gabarito'),
    (NEW.id, 'imagens'),
    (NEW.id, 'formatacao'),
    (NEW.id, 'dados_prova'),
    (NEW.id, 'classificacao')
  ON CONFLICT (question_id, criterio) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS questions_initialize_review_checks ON public.questions;
CREATE TRIGGER questions_initialize_review_checks
AFTER INSERT ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.initialize_question_review_checks();

INSERT INTO public.question_review_checks (question_id, criterio)
SELECT q.id, criteria.criterio
FROM public.questions q
CROSS JOIN (VALUES
  ('texto_base'), ('enunciado'), ('alternativas'), ('gabarito'),
  ('imagens'), ('formatacao'), ('dados_prova'), ('classificacao')
) AS criteria(criterio)
ON CONFLICT (question_id, criterio) DO NOTHING;

CREATE OR REPLACE FUNCTION public.reset_affected_question_review_checks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_criteria TEXT[] := ARRAY[]::TEXT[];
  v_old_alternatives JSONB;
  v_new_alternatives JSONB;
BEGIN
  IF OLD.referencia_texto IS DISTINCT FROM NEW.referencia_texto
     OR OLD.referencia_texto_apos IS DISTINCT FROM NEW.referencia_texto_apos
     OR OLD.referencia_fonte IS DISTINCT FROM NEW.referencia_fonte THEN
    v_criteria := array_append(v_criteria, 'texto_base');
    v_criteria := array_append(v_criteria, 'formatacao');
  END IF;

  IF OLD.enunciado IS DISTINCT FROM NEW.enunciado THEN
    v_criteria := array_append(v_criteria, 'enunciado');
    v_criteria := array_append(v_criteria, 'formatacao');
  END IF;

  IF OLD.alternativas IS DISTINCT FROM NEW.alternativas THEN
    v_criteria := array_append(v_criteria, 'alternativas');
    v_criteria := array_append(v_criteria, 'formatacao');
    v_old_alternatives := CASE WHEN jsonb_typeof(OLD.alternativas) = 'array' THEN OLD.alternativas ELSE '[]'::jsonb END;
    v_new_alternatives := CASE WHEN jsonb_typeof(NEW.alternativas) = 'array' THEN NEW.alternativas ELSE '[]'::jsonb END;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_old_alternatives) item
      WHERE NULLIF(item->>'imagem', '') IS NOT NULL
    ) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_new_alternatives) item
      WHERE NULLIF(item->>'imagem', '') IS NOT NULL
    ) THEN
      v_criteria := array_append(v_criteria, 'imagens');
    END IF;
  END IF;

  IF OLD.resposta IS DISTINCT FROM NEW.resposta THEN
    v_criteria := array_append(v_criteria, 'gabarito');
  END IF;

  IF OLD.referencia_imagem IS DISTINCT FROM NEW.referencia_imagem
     OR OLD.referencia_imagem_pos IS DISTINCT FROM NEW.referencia_imagem_pos
     OR OLD.referencia_imagem_layout IS DISTINCT FROM NEW.referencia_imagem_layout
     OR OLD.referencia_imagens_extra IS DISTINCT FROM NEW.referencia_imagens_extra
     OR OLD.enunciado_imagem IS DISTINCT FROM NEW.enunciado_imagem
     OR OLD.enunciado_imagem_pos IS DISTINCT FROM NEW.enunciado_imagem_pos
     OR OLD.enunciado_imagem_layout IS DISTINCT FROM NEW.enunciado_imagem_layout
     OR OLD.enunciado_imagens_extra IS DISTINCT FROM NEW.enunciado_imagens_extra
     OR OLD.imagem_original_url IS DISTINCT FROM NEW.imagem_original_url
     OR OLD.tem_imagem IS DISTINCT FROM NEW.tem_imagem THEN
    v_criteria := array_append(v_criteria, 'imagens');
  END IF;

  IF OLD.referencia_imagem_pos IS DISTINCT FROM NEW.referencia_imagem_pos
     OR OLD.referencia_imagem_layout IS DISTINCT FROM NEW.referencia_imagem_layout
     OR OLD.enunciado_imagem_pos IS DISTINCT FROM NEW.enunciado_imagem_pos
     OR OLD.enunciado_imagem_layout IS DISTINCT FROM NEW.enunciado_imagem_layout
     OR OLD.referencia_imagens_extra IS DISTINCT FROM NEW.referencia_imagens_extra
     OR OLD.enunciado_imagens_extra IS DISTINCT FROM NEW.enunciado_imagens_extra THEN
    v_criteria := array_append(v_criteria, 'formatacao');
  END IF;

  IF OLD.prova IS DISTINCT FROM NEW.prova
     OR OLD.instituicao IS DISTINCT FROM NEW.instituicao
     OR OLD.ano IS DISTINCT FROM NEW.ano
     OR OLD.numero IS DISTINCT FROM NEW.numero
     OR OLD.fonte IS DISTINCT FROM NEW.fonte THEN
    v_criteria := array_append(v_criteria, 'dados_prova');
  END IF;

  IF OLD.area_geral IS DISTINCT FROM NEW.area_geral
     OR OLD.conteudo_principal IS DISTINCT FROM NEW.conteudo_principal
     OR OLD.subconteudo_principal IS DISTINCT FROM NEW.subconteudo_principal
     OR OLD.conteudos_relacionados IS DISTINCT FROM NEW.conteudos_relacionados
     OR OLD.tags_livres IS DISTINCT FROM NEW.tags_livres
     OR OLD.tags IS DISTINCT FROM NEW.tags
     OR OLD.disciplina IS DISTINCT FROM NEW.disciplina
     OR OLD.conteudo IS DISTINCT FROM NEW.conteudo
     OR OLD.dificuldade IS DISTINCT FROM NEW.dificuldade THEN
    v_criteria := array_append(v_criteria, 'classificacao');
  END IF;

  IF cardinality(v_criteria) > 0 THEN
    PERFORM set_config('app.question_review_reason', 'questao_editada', true);
    UPDATE public.question_review_checks
    SET status = CASE
          WHEN status = 'precisa_ajuste' THEN 'ajustado_pendente_conferencia'
          ELSE 'pendente'
        END,
        observacao = CASE
          WHEN status = 'precisa_ajuste' THEN observacao
          ELSE 'Campo alterado após a conferência; revisar novamente.'
        END,
        updated_at = now()
    WHERE question_id = NEW.id
      AND criterio = ANY(v_criteria)
      AND status <> 'pendente';
    PERFORM set_config('app.question_review_reason', '', true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS questions_reset_affected_review_checks ON public.questions;
CREATE TRIGGER questions_reset_affected_review_checks
AFTER UPDATE ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.reset_affected_question_review_checks();

CREATE OR REPLACE VIEW public.question_review_summary AS
WITH check_summary AS (
  SELECT
    question_id,
    count(*)::INTEGER AS total_criteria,
    count(*) FILTER (WHERE status IN ('conferido_ok', 'nao_se_aplica'))::INTEGER AS completed_criteria,
    count(*) FILTER (WHERE status NOT IN ('conferido_ok', 'nao_se_aplica'))::INTEGER AS pending_criteria,
    count(*) FILTER (WHERE status IN ('precisa_ajuste', 'ajustado_pendente_conferencia', 'duvida'))::INTEGER AS attention_criteria
  FROM public.question_review_checks
  GROUP BY question_id
),
history_summary AS (
  SELECT
    question_id,
    count(*) FILTER (WHERE motivo = 'questao_editada')::INTEGER AS adjustment_count,
    max(changed_at) FILTER (WHERE motivo = 'questao_editada') AS last_adjustment_at
  FROM public.question_review_history
  GROUP BY question_id
)
SELECT
  q.id AS question_id,
  COALESCE(c.total_criteria, 0) AS total_criteria,
  COALESCE(c.completed_criteria, 0) AS completed_criteria,
  COALESCE(c.pending_criteria, 8) AS pending_criteria,
  COALESCE(c.attention_criteria, 0) AS attention_criteria,
  (COALESCE(c.total_criteria, 0) = 8 AND COALESCE(c.pending_criteria, 8) = 0) AS is_complete,
  COALESCE(h.adjustment_count, 0) AS adjustment_count,
  h.last_adjustment_at
FROM public.questions q
LEFT JOIN check_summary c ON c.question_id = q.id
LEFT JOIN history_summary h ON h.question_id = q.id;

CREATE OR REPLACE VIEW public.question_review_queue AS
SELECT
  q.id, q.numero, q.ano, q.prova, q.instituicao, q.enunciado,
  q.area_geral, q.conteudo_principal, q.subconteudo_principal, q.grupo_id,
  s.total_criteria, s.completed_criteria, s.pending_criteria,
  s.attention_criteria, s.is_complete, s.adjustment_count, s.last_adjustment_at
FROM public.questions q
JOIN public.question_review_summary s ON s.question_id = q.id;

GRANT SELECT ON public.question_review_summary, public.question_review_queue TO anon, authenticated;
