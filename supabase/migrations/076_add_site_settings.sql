CREATE TABLE site_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage site settings"
  ON site_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
        AND user_profiles.platform_role = 'super_admin'
    )
  );

INSERT INTO site_settings (key, value)
VALUES ('billing', '{"monthly_price": 25000, "trial_days": 14}'::jsonb);
