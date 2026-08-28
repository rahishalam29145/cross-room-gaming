CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint NOT NULL,
  core text NOT NULL DEFAULT 'nes',
  system_label text NOT NULL DEFAULT 'Retro',
  cover_path text,
  kind text NOT NULL DEFAULT 'rom',
  content_hash text NOT NULL,
  play_count integer NOT NULL DEFAULT 0,
  report_count integer NOT NULL DEFAULT 0,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT games_kind_check CHECK (kind IN ('rom','bios')),
  CONSTRAINT games_hash_unique UNIQUE (content_hash)
);

GRANT SELECT ON public.games TO anon, authenticated;
GRANT ALL ON public.games TO service_role;

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view visible games"
  ON public.games FOR SELECT
  TO anon, authenticated
  USING (hidden = false);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_games_updated_at
BEFORE UPDATE ON public.games
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX games_created_at_idx ON public.games (created_at DESC);
CREATE INDEX games_kind_idx ON public.games (kind);

-- Storage: anyone may read library files, and upload into the uploads/ prefix.
CREATE POLICY "Anyone can read game files"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id IN ('game-roms','game-covers'));

CREATE POLICY "Anyone can upload game files"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id IN ('game-roms','game-covers')
    AND (storage.foldername(name))[1] = 'uploads'
  );