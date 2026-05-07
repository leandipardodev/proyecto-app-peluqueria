-- Migration 002: Add slug and fields to shops table

-- Add new columns to shops
ALTER TABLE shops ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS opening_hours JSONB;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS google_maps_url TEXT;

-- Function to generate slug from shop name
CREATE OR REPLACE FUNCTION generate_shop_slug(shop_name TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INT := 0;
BEGIN
  -- Convert to lowercase
  base_slug := lower(shop_name);
  
  -- Replace accented characters
  base_slug := regexp_replace(base_slug, 'á|à|ä|â', 'a', 'g');
  base_slug := regexp_replace(base_slug, 'é|è|ë|ê', 'e', 'g');
  base_slug := regexp_replace(base_slug, 'í|ì|ï|î', 'i', 'g');
  base_slug := regexp_replace(base_slug, 'ó|ò|ö|ô', 'o', 'g');
  base_slug := regexp_replace(base_slug, 'ú|ù|ü|û', 'u', 'g');
  base_slug := regexp_replace(base_slug, 'ñ', 'n', 'g');
  
  -- Replace non-alphanumeric characters with hyphens
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  
  -- Trim hyphens from start and end
  base_slug := trim(both '-' from base_slug);
  
  final_slug := base_slug;
  
  -- Check uniqueness and append counter if needed
  WHILE EXISTS (SELECT 1 FROM shops WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate slug on insert
CREATE OR REPLACE FUNCTION set_shop_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := generate_shop_slug(NEW.name);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_shop_slug ON shops;
CREATE TRIGGER trigger_set_shop_slug
  BEFORE INSERT ON shops
  FOR EACH ROW
  EXECUTE FUNCTION set_shop_slug();

-- Generate slugs for existing shops that don't have one
UPDATE shops SET slug = generate_shop_slug(name) WHERE slug IS NULL OR slug = '';
