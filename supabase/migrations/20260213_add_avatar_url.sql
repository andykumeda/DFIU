
-- Add avatar_url to profiles
ALTER TABLE "public"."profiles" 
ADD COLUMN IF NOT EXISTS "avatar_url" text;

-- Update the handle_new_user function to sync avatar_url and name from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, name, avatar_url)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    name = EXCLUDED.name,
    avatar_url = EXCLUDED.avatar_url;
  RETURN new;
END;
$function$;
