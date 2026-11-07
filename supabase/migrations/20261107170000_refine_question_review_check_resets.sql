-- Reopen only the review criteria affected by a question edit.
-- Other criteria and their notes remain untouched.
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

    IF (
      coalesce(OLD.referencia_texto, '') LIKE '%<%'
      OR coalesce(NEW.referencia_texto, '') LIKE '%<%'
      OR coalesce(OLD.referencia_texto_apos, '') LIKE '%<%'
      OR coalesce(NEW.referencia_texto_apos, '') LIKE '%<%'
      OR coalesce(OLD.referencia_fonte, '') LIKE '%<%'
      OR coalesce(NEW.referencia_fonte, '') LIKE '%<%'
    ) AND (
      regexp_replace(coalesce(OLD.referencia_texto, ''), '>([^<]*)<', '><', 'g')
        IS DISTINCT FROM regexp_replace(coalesce(NEW.referencia_texto, ''), '>([^<]*)<', '><', 'g')
      OR regexp_replace(coalesce(OLD.referencia_texto_apos, ''), '>([^<]*)<', '><', 'g')
        IS DISTINCT FROM regexp_replace(coalesce(NEW.referencia_texto_apos, ''), '>([^<]*)<', '><', 'g')
      OR regexp_replace(coalesce(OLD.referencia_fonte, ''), '>([^<]*)<', '><', 'g')
        IS DISTINCT FROM regexp_replace(coalesce(NEW.referencia_fonte, ''), '>([^<]*)<', '><', 'g')
    ) THEN
      v_criteria := array_append(v_criteria, 'formatacao');
    END IF;
  END IF;

  IF OLD.enunciado IS DISTINCT FROM NEW.enunciado THEN
    v_criteria := array_append(v_criteria, 'enunciado');

    IF (
      coalesce(OLD.enunciado, '') LIKE '%<%'
      OR coalesce(NEW.enunciado, '') LIKE '%<%'
    ) AND regexp_replace(coalesce(OLD.enunciado, ''), '>([^<]*)<', '><', 'g')
      IS DISTINCT FROM regexp_replace(coalesce(NEW.enunciado, ''), '>([^<]*)<', '><', 'g') THEN
      v_criteria := array_append(v_criteria, 'formatacao');
    END IF;
  END IF;

  IF OLD.alternativas IS DISTINCT FROM NEW.alternativas THEN
    v_criteria := array_append(v_criteria, 'alternativas');
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

    IF (
      coalesce(OLD.alternativas::TEXT, '') LIKE '%<%'
      OR coalesce(NEW.alternativas::TEXT, '') LIKE '%<%'
    ) AND regexp_replace(coalesce(OLD.alternativas::TEXT, ''), '>([^<]*)<', '><', 'g')
      IS DISTINCT FROM regexp_replace(coalesce(NEW.alternativas::TEXT, ''), '>([^<]*)<', '><', 'g') THEN
      v_criteria := array_append(v_criteria, 'formatacao');
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
    SET status = 'pendente',
        observacao = CASE
          WHEN NULLIF(BTRIM(observacao), '') IS NULL THEN 'Campo alterado após a conferência; revisar novamente.'
          ELSE observacao
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
