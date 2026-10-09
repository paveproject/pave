-- Custom SQL migration file, put your code below! --

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.slugify(value text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  IF value IS NULL THEN
    RETURN '';
  END IF;
  
  RETURN regexp_replace(
           regexp_replace(
             lower(extensions.unaccent("value")),
             '[^a-z0-9\\-_]+', '-', 'gi' 
           ),
           '(^-+|-+$)', '', 'g' 
         );
END;
$function$;