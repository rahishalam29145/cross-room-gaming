ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES public.games(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.publish_room(p_code text, p_game_name text, p_core text, p_token text, p_game_id uuid DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_code IS NULL OR length(p_code) < 4 OR length(p_code) > 12 THEN
    RAISE EXCEPTION 'invalid room code';
  END IF;
  IF p_token IS NULL OR length(p_token) < 16 OR length(p_token) > 128 THEN
    RAISE EXCEPTION 'invalid host token';
  END IF;

  IF EXISTS (SELECT 1 FROM public.rooms WHERE code = p_code) THEN
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
           game_id = p_game_id,
           p2_taken = false,
           last_seen_at = now()
     WHERE code = p_code;

    INSERT INTO public.room_keys (code, token)
    VALUES (p_code, p_token)
    ON CONFLICT (code) DO UPDATE SET token = excluded.token;
  ELSE
    INSERT INTO public.rooms (code, game_name, core, game_id, p2_taken, last_seen_at)
    VALUES (p_code, coalesce(left(p_game_name, 120), 'Retro game'), coalesce(left(p_core, 40), 'nes'), p_game_id, false, now());

    INSERT INTO public.room_keys (code, token) VALUES (p_code, p_token);
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.publish_room(text, text, text, text, uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.publish_room(text, text, text, text, uuid) TO service_role;