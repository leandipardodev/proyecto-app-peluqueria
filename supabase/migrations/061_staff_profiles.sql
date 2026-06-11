-- Staff profile info: description, photo, social links

CREATE TABLE IF NOT EXISTS staff_profiles (
  user_id     uuid PRIMARY KEY REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  description text,
  photo_url   text,
  instagram   text,
  whatsapp    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);

-- Create storage bucket for staff photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-photos', 'staff-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read of staff photos
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public can view staff photos') THEN
    CREATE POLICY "Public can view staff photos"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'staff-photos');
  END IF;
END $$;

-- Allow authenticated users to upload staff photos
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated users can upload staff photos') THEN
    CREATE POLICY "Authenticated users can upload staff photos"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'staff-photos'
        AND auth.role() = 'authenticated'
      );
  END IF;
END $$;
