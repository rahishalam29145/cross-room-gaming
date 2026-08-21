-- 1. Owner secret
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS host_token text;

-- 2. Replace permissive write policies
DROP POLICY IF EXISTS "Anyone can update rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can delete rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can create rooms" ON public.rooms;
DROP POLICY IF EXISTS "Anyone can view rooms" ON public.rooms;

CREATE POLICY "Public can view live rooms"
  ON public.rooms FOR SELECT TO anon, authenticated USING (true);

-- No INSERT/UPDATE/DELETE policies: all writes go through the security definer RPCs below.

-- 3. Column-level grants so host_token is never selectable by clients
REVOKE ALL ON public.rooms FROM anon, authenticated;
GRANT SELECT (id, code, game_name, core, p2_taken, last_seen_at, created_at) ON public.rooms TO anon, authenticated;
GRANT ALL ON public.rooms TO service_role;

-- 4. RPCs enforcing host ownership
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
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RAISE EXCEPTION 'invalid host token';
  END IF;

  INSERT INTO public.rooms (code, game_name, core, p2_taken, last_seen_at, host_token)
  VALUES (p_code, coalesce(left(p_game_name, 120), 'Retro game'), coalesce(left(p_core, 40), 'nes'), false, now(), p_token)
  ON CONFLICT (code) DO UPDATE
    SET game_name = excluded.game_name,
        core = excluded.core,
        p2_taken = false,
        last_seen_at = now()
    WHERE rooms.host_token = p_token OR rooms.last_seen_at < now() - interval '2 minutes';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room code already in use';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_room(p_code text, p_token text, p_p2_taken boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.rooms
     SET last_seen_at = now(), p2_taken = coalesce(p_p2_taken, p2_taken)
   WHERE code = p_code AND host_token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.remove_room(p_code text, p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rooms WHERE code = p_code AND host_token = p_token;
$$;

REVOKE ALL ON FUNCTION public.publish_room(text, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.heartbeat_room(text, text, boolean) FROM public;
REVOKE ALL ON FUNCTION public.remove_room(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.publish_room(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_room(text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_room(text, text) TO anon, authenticated;