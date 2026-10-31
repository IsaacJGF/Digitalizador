-- Replace the legacy catalog defaults with the agreed initial taxonomy.
-- Catalog data must not be repopulated by browser page loads.
DELETE FROM public.catalog_subconteudos;
DELETE FROM public.catalog_conteudos;
DELETE FROM public.catalog_areas;
DELETE FROM public.catalog_relacionados;
DELETE FROM public.catalog_tags;
DELETE FROM public.catalog_provas;
DELETE FROM public.catalog_instituicoes;

INSERT INTO public.catalog_areas (nome, ativo) VALUES
  ('Mecânica', true),
  ('Física Térmica', true),
  ('Ondulatória', true),
  ('Óptica', true),
  ('Eletromagnetismo', true),
  ('Física Moderna', true);

INSERT INTO public.catalog_provas (nome, ativo) VALUES ('ENEM', true);
INSERT INTO public.catalog_instituicoes (nome, ativo) VALUES ('Inep', true);
