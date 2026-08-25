-- 1. Split host secrets out of the publicly readable rooms table
CREATE TABLE public.room_keys (
  code text PRIMARY KEY REFERENCES public.rooms(code) ON DELETE CASCADE,
  token text NOT NULL
);

ALTER TABLE public.room_keys ENABLE ROW LEVEL SECURITY;
-- No RLS policies: anon/authenticated have no access at all.
-- Only the server (service_role) reads and writes host secrets.
GRANT ALL ON public.room_keys TO service_role;

-- 2. Move existing secrets, then drop the exposed column
INSERT INTO public.room_keys (code, token)
SELECT code, host_token FROM public.rooms WHERE host_token IS NOT NULL;

ALTER TABLE public.rooms DROP COLUMN host_token;

-- rooms no longer holds any secret column: plain read grant for the public lobby
REVOKE ALL ON public.rooms FROM anon, authenticated;
GRANT SELECT ON public.rooms TO anon, authenticated;
GRANT ALL ON public.rooms TO service_role;

-- 3. RPCs now verify ownership against room_keys
CREATE OR REPLACE FUNCTION public.publish_room(p_code text, p_game_name text, p_core text, p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_code IS NULL OR length(p_code) < 4 OR length(p_code) > 12 THEN
    RAISE EXCEPTION 'invalid room code';
  END IF;
  IF p_token IS NULL OR length(p_token) < 16 OR length(p_token) > 128 THEN
    RAISE EXCEPTION 'invalid host token';
  END IF;

  IF EXISTS (SELECT 1 FROM public.rooms WHERE code = p_code) THEN
    -- Re-publish allowed only for the proven owner or a stale (dead) room
    IF NOT EXISTS (
      SELECT 1
        FROM public.rooms r
        LEFT JOIN public.room_keys k ON k.code = r.code
       WHERE r.code = p_code
         AND (k.token = p_token OR r.last_seen_at < now() - interval '2 minutes')
    ) THEN
      RAISE EXCEPTION 'room code already in use';
    END IF;

    UPDATE public.rooms
       SET game_name = coalesce(left(p_game_name, 120), 'Retro game'),
           core = coalesce(left(p_core, 40), 'nes'),
           p2_taken = false,
           last_seen_at = now()
     WHERE code = p_code;

    INSERT INTO public.room_keys (code, token)
    VALUES (p_code, p_token)
    ON CONFLICT (code) DO UPDATE SET token = excluded.token;
  ELSE
    INSERT INTO public.rooms (code, game_name, core, p2_taken, last_seen_at)
    VALUES (p_code, coalesce(left(p_game_name, 120), 'Retro game'), coalesce(left(p_core, 40), 'nes'), false, now());

    INSERT INTO public.room_keys (code, token) VALUES (p_code, p_token);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_room(p_code text, p_token text, p_p2_taken boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.rooms r
     SET last_seen_at = now(),
         p2_taken = coalesce(p_p2_taken, r.p2_taken)
   WHERE r.code = p_code
     AND EXISTS (
       SELECT 1 FROM public.room_keys k
        WHERE k.code = p_code AND k.token = p_token
     );
$$;

CREATE OR REPLACE FUNCTION public.remove_room(p_code text, p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rooms r
   WHERE r.code = p_code
     AND EXISTS (
       SELECT 1 FROM public.room_keys k
        WHERE k.code = p_code AND k.token = p_token
     );
$$;

-- 4. Privileged functions are no longer callable by clients.
-- Only the server (service_role) may execute them, via server functions.
REVOKE ALL ON FUNCTION public.publish_room(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_room(text, text, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_room(text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.heartbeat_room(text, text, boolean) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_room(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_room(text, text) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.publish_room(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_room(text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_room(text, text) TO service_role;