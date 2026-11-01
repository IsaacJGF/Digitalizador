-- Importa imagens recortadas para várias questões em uma única transação.
-- O endpoint de servidor valida os PNGs e chama esta função com service_role.

CREATE OR REPLACE FUNCTION public._apply_question_image_attachments(
  _question_id uuid,
  _text text,
  _images jsonb,
  _attachments jsonb,
  _legacy_main_image text,
  _legacy_text_after text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_text text := _text;
  v_images jsonb := coalesce(_images, '[]'::jsonb);
  v_attachment jsonb;
  v_current jsonb;
  v_updated jsonb;
  v_url text;
  v_import_id text;
  v_anchor text;
  v_before boolean;
  v_marker text;
  v_layout jsonb;
  v_slot integer;
  v_index integer;
  v_found_slot integer;
  v_occurrences integer;
  v_replace boolean;
BEGIN
  IF jsonb_typeof(v_images) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: a lista de imagens existente não é válida.';
  END IF;
  IF jsonb_typeof(_attachments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: a lista de imagens do lote não é válida.';
  END IF;

  FOR v_attachment IN SELECT value FROM jsonb_array_elements(_attachments) LOOP
    IF jsonb_typeof(v_attachment) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: item de imagem inválido.';
    END IF;

    v_url := v_attachment->>'url';
    IF v_url IS NULL
      OR octet_length(v_url) > 8388608
      OR v_url NOT LIKE 'data:image/png;base64,iVBORw0KGgo%'
    THEN
      RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: imagem PNG inválida ou maior que 8 MiB.';
    END IF;

    v_import_id := v_attachment->>'import_id';
    IF v_import_id IS NULL OR v_import_id !~ '^[a-z0-9][a-z0-9._:-]{1,179}$' THEN
      RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: identificador da imagem inválido.';
    END IF;

    v_replace := coalesce((v_attachment->>'substituir')::boolean, false);

    IF num_nonnulls(
      CASE WHEN v_attachment ? 'slot' THEN 1 END,
      CASE WHEN v_attachment ? 'inserir_depois' THEN 1 END,
      CASE WHEN v_attachment ? 'inserir_antes' THEN 1 END
    ) <> 1 THEN
      RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: informe somente uma posição para a imagem.';
    END IF;

    IF v_attachment ? 'slot' THEN
      IF coalesce(v_attachment->>'slot', '') !~ '^[0-9]+$' THEN
        RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: slot inválido.';
      END IF;
      v_slot := (v_attachment->>'slot')::integer;
      IF v_slot < 1 OR v_slot > jsonb_array_length(v_images) THEN
        RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: o slot informado não existe na questão.';
      END IF;

      v_current := v_images -> (v_slot - 1);
      v_layout :=
        '{"x":0,"y":0,"width":70,"height":30,"rotation":0,"align":"center","mode":"block"}'::jsonb
        || coalesce(v_current->'layout', '{}'::jsonb)
        || coalesce(v_attachment->'layout', '{}'::jsonb);
      IF coalesce(v_current->>'url', '') <> ''
        AND v_current->>'url' <> v_url
        AND NOT v_replace
      THEN
        RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: o slot já possui outra imagem; marque substituir para trocá-la.';
      END IF;

      v_updated := (v_current - 'pending')
        || jsonb_build_object(
          'url', v_url,
          'layout', v_layout,
          'pos', coalesce(v_current->>'pos', 'depois'),
          'import_id', v_import_id
        );
      v_images := jsonb_set(v_images, ARRAY[(v_slot - 1)::text], v_updated, true);
      CONTINUE;
    END IF;

    v_before := v_attachment ? 'inserir_antes';
    v_anchor := coalesce(v_attachment->>'inserir_depois', v_attachment->>'inserir_antes');
    v_found_slot := NULL;

    IF jsonb_array_length(v_images) > 0 THEN
      FOR v_index IN 0..jsonb_array_length(v_images) - 1 LOOP
        IF v_images->v_index->>'import_id' = v_import_id THEN
          v_found_slot := v_index + 1;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    IF v_found_slot IS NULL THEN
      IF nullif(_legacy_main_image, '') IS NOT NULL
        OR nullif(_legacy_text_after, '') IS NOT NULL
      THEN
        RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: esta questão usa campos antigos de imagem; converta-a para blocos antes de inserir uma imagem por texto âncora.';
      END IF;
      IF jsonb_array_length(v_images) >= 20 THEN
        RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: a questão já atingiu o limite de 20 imagens neste campo.';
      END IF;

      v_layout :=
        '{"x":0,"y":0,"width":70,"height":30,"rotation":0,"align":"center","mode":"block"}'::jsonb
        || coalesce(v_attachment->'layout', '{}'::jsonb);
      v_images := v_images || jsonb_build_array(
        jsonb_build_object(
          'url', v_url,
          'layout', v_layout,
          'pos', 'depois',
          'import_id', v_import_id
        )
      );
      v_slot := jsonb_array_length(v_images);
    ELSE
      v_current := v_images -> (v_found_slot - 1);
      IF coalesce(v_current->>'url', '') <> v_url AND NOT v_replace THEN
        RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: o identificador de importação já existe com outra imagem.';
      END IF;
      v_layout :=
        '{"x":0,"y":0,"width":70,"height":30,"rotation":0,"align":"center","mode":"block"}'::jsonb
        || coalesce(v_current->'layout', '{}'::jsonb)
        || coalesce(v_attachment->'layout', '{}'::jsonb);
      v_updated := (v_current - 'pending')
        || jsonb_build_object(
          'url', v_url,
          'layout', v_layout,
          'pos', coalesce(v_current->>'pos', 'depois'),
          'import_id', v_import_id
        );
      v_images := jsonb_set(v_images, ARRAY[(v_found_slot - 1)::text], v_updated, true);
      v_slot := v_found_slot;
    END IF;

    v_marker := '[[img:' || v_slot::text || ']]';
    IF position(v_marker IN coalesce(v_text, '')) = 0 THEN
      IF v_before THEN
        IF v_anchor = '' OR v_text IS NULL THEN
          RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: inserir_antes exige uma âncora não vazia e texto existente.';
        END IF;
        v_occurrences := (length(v_text) - length(replace(v_text, v_anchor, ''))) / length(v_anchor);
        IF v_occurrences <> 1 THEN
          RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: a âncora precisa aparecer exatamente uma vez no texto.';
        END IF;
        v_text := replace(v_text, v_anchor, v_marker || v_anchor);
      ELSIF v_anchor = '' THEN
        v_text := coalesce(v_text, '') || v_marker;
      ELSE
        IF v_text IS NULL THEN
          RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: a âncora exige texto existente.';
        END IF;
        v_occurrences := (length(v_text) - length(replace(v_text, v_anchor, ''))) / length(v_anchor);
        IF v_occurrences <> 1 THEN
          RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: a âncora precisa aparecer exatamente uma vez no texto.';
        END IF;
        v_text := replace(v_text, v_anchor, v_anchor || v_marker);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('text', v_text, 'images', v_images);
END
$function$;

CREATE OR REPLACE FUNCTION public.import_question_images_batch(_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_item jsonb;
  v_selector jsonb;
  v_question public.questions%ROWTYPE;
  v_result jsonb;
  v_reference_text text;
  v_reference_images jsonb;
  v_statement_text text;
  v_statement_images jsonb;
  v_alternatives jsonb;
  v_attachments jsonb;
  v_alternative jsonb;
  v_url text;
  v_letter text;
  v_option jsonb;
  v_selector_id uuid;
  v_count integer;
  v_option_count integer;
  v_option_index integer;
  v_replace boolean;
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: questions precisa ser uma lista.';
  END IF;
  IF jsonb_array_length(_items) < 1 OR jsonb_array_length(_items) > 25 THEN
    RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: o lote precisa conter de 1 a 25 questões.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    v_selector := v_item->'identificacao';
    IF jsonb_typeof(v_selector) IS DISTINCT FROM 'object'
      OR coalesce(v_selector->>'ano', '') = ''
      OR coalesce(v_selector->>'prova', '') = ''
      OR coalesce(v_selector->>'numero', '') = ''
    THEN
      RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: informe ano, prova e número da questão.';
    END IF;

    v_selector_id := NULL;
    IF nullif(v_selector->>'id', '') IS NOT NULL THEN
      BEGIN
        v_selector_id := (v_selector->>'id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: o ID da questão não é um UUID válido.';
      END;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.questions AS q
    WHERE q.ano = v_selector->>'ano'
      AND q.prova = v_selector->>'prova'
      AND q.numero = v_selector->>'numero'
      AND (v_selector->>'instituicao' IS NULL OR q.instituicao = v_selector->>'instituicao')
      AND (v_selector_id IS NULL OR q.id = v_selector_id);

    IF v_count = 0 THEN
      RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: não encontrei uma questão com ano, prova e número informados.';
    ELSIF v_count > 1 THEN
      RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: a identificação encontrou mais de uma questão; informe o ID ou a instituição.';
    END IF;

    SELECT q.* INTO v_question
    FROM public.questions AS q
    WHERE q.ano = v_selector->>'ano'
      AND q.prova = v_selector->>'prova'
      AND q.numero = v_selector->>'numero'
      AND (v_selector->>'instituicao' IS NULL OR q.instituicao = v_selector->>'instituicao')
      AND (v_selector_id IS NULL OR q.id = v_selector_id)
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: a questão deixou de existir durante a importação.';
    END IF;
    IF v_question.id = ANY(v_seen_ids) THEN
      RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: a mesma questão apareceu mais de uma vez no lote.';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_question.id);

    IF v_item ? 'referencia_imagens'
      AND jsonb_typeof(v_item->'referencia_imagens') IS DISTINCT FROM 'array'
    THEN
      RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: referencia_imagens precisa ser uma lista.';
    END IF;
    IF v_item ? 'enunciado_imagens'
      AND jsonb_typeof(v_item->'enunciado_imagens') IS DISTINCT FROM 'array'
    THEN
      RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: enunciado_imagens precisa ser uma lista.';
    END IF;
    IF v_item ? 'alternativas_imagens'
      AND jsonb_typeof(v_item->'alternativas_imagens') IS DISTINCT FROM 'array'
    THEN
      RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: alternativas_imagens precisa ser uma lista.';
    END IF;

    v_attachments := coalesce(v_item->'referencia_imagens', '[]'::jsonb);
    v_result := public._apply_question_image_attachments(
      v_question.id,
      v_question.referencia_texto,
      v_question.referencia_imagens_extra,
      v_attachments,
      v_question.referencia_imagem,
      v_question.referencia_texto_apos
    );
    v_reference_text := v_result->>'text';
    v_reference_images := v_result->'images';

    v_attachments := coalesce(v_item->'enunciado_imagens', '[]'::jsonb);
    v_result := public._apply_question_image_attachments(
      v_question.id,
      v_question.enunciado,
      v_question.enunciado_imagens_extra,
      v_attachments,
      v_question.enunciado_imagem,
      NULL
    );
    v_statement_text := v_result->>'text';
    v_statement_images := v_result->'images';

    v_alternatives := coalesce(v_question.alternativas, '[]'::jsonb);
    IF jsonb_typeof(v_alternatives) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: as alternativas da questão não estão em formato de lista.';
    END IF;

    v_attachments := coalesce(v_item->'alternativas_imagens', '[]'::jsonb);
    FOR v_alternative IN SELECT value FROM jsonb_array_elements(v_attachments) LOOP
      IF jsonb_typeof(v_alternative) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: item de alternativa inválido.';
      END IF;

      v_letter := v_alternative->>'letra';
      v_url := v_alternative->>'url';
      IF v_letter IS NULL OR v_letter !~ '^[A-Z]$'
        OR v_url IS NULL
        OR octet_length(v_url) > 8388608
        OR v_url NOT LIKE 'data:image/png;base64,iVBORw0KGgo%'
      THEN
        RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: alternativa ou imagem PNG inválida.';
      END IF;

      v_option_count := 0;
      v_replace := coalesce((v_alternative->>'substituir')::boolean, false);
      IF jsonb_array_length(v_alternatives) > 0 THEN
        FOR v_option_index IN 0..jsonb_array_length(v_alternatives) - 1 LOOP
          v_option := v_alternatives->v_option_index;
          IF v_option->>'letra' = v_letter THEN
            v_option_count := v_option_count + 1;
            IF coalesce(v_option->>'imagem', '') <> ''
              AND v_option->>'imagem' <> v_url
              AND NOT v_replace
            THEN
              RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: a alternativa já possui outra imagem; marque substituir para trocá-la.';
            END IF;

            IF coalesce(v_option->>'texto', '') LIKE '[Diagrama%' THEN
              v_option := jsonb_set(v_option, '{texto}', to_jsonb(''::text), true);
            END IF;
            v_option := jsonb_set(v_option, '{imagem}', to_jsonb(v_url), true);
            v_alternatives := jsonb_set(
              v_alternatives,
              ARRAY[v_option_index::text],
              v_option,
              true
            );
          END IF;
        END LOOP;
      END IF;

      IF v_option_count = 0 THEN
        RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: não encontrei a letra de alternativa informada.';
      ELSIF v_option_count > 1 THEN
        RAISE EXCEPTION USING MESSAGE = 'QUESTION_IMAGE_INGEST: a letra da alternativa está duplicada na questão.';
      END IF;
    END LOOP;

    UPDATE public.questions
    SET referencia_texto = v_reference_text,
        referencia_imagens_extra = v_reference_images,
        enunciado = v_statement_text,
        enunciado_imagens_extra = v_statement_images,
        alternativas = v_alternatives,
        tem_imagem = true,
        updated_at = now()
    WHERE id = v_question.id;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'id', v_question.id,
        'ano', v_question.ano,
        'prova', v_question.prova,
        'numero', v_question.numero
      )
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'questions', v_results);
END
$function$;

REVOKE ALL ON FUNCTION public._apply_question_image_attachments(uuid, text, jsonb, jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_question_images_batch(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_question_images_batch(jsonb) TO service_role;

COMMENT ON FUNCTION public.import_question_images_batch(jsonb)
IS 'Aplica um lote atômico de imagens PNG a questões existentes, identificado por ano, prova e número.';
