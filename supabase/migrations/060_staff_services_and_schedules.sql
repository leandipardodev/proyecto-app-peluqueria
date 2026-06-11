-- 060: Staff services assignment and individual schedules

-- Many-to-many: which staff can perform which services
CREATE TABLE IF NOT EXISTS staff_services (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   uuid NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_services_staff   ON staff_services (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_services_service ON staff_services (service_id);

-- Individual staff schedules (per day of week)
CREATE TABLE IF NOT EXISTS staff_schedules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_active   boolean NOT NULL DEFAULT true,
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  break_start time,
  break_end   time,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz,
  UNIQUE (staff_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_staff_schedules_staff ON staff_schedules (staff_id);

-- Seed: assign all existing services to all active staff members
INSERT INTO staff_services (staff_id, service_id)
SELECT sm.user_id, s.id
FROM shop_memberships sm
CROSS JOIN services s
WHERE sm.is_active = true
  AND sm.role IN ('owner', 'staff', 'admin')
  AND s.shop_id = sm.shop_id
ON CONFLICT (staff_id, service_id) DO NOTHING;

-- Seed: create default Mon-Fri 9-20 + Sat 9-14 schedules for all staff
INSERT INTO staff_schedules (staff_id, day_of_week, is_active, start_time, end_time)
SELECT sm.user_id, d.dow, true,
  CASE
    WHEN d.dow BETWEEN 1 AND 5 THEN '09:00'::time
    WHEN d.dow = 6 THEN '09:00'::time
    ELSE '09:00'::time
  END,
  CASE
    WHEN d.dow BETWEEN 1 AND 5 THEN '20:00'::time
    WHEN d.dow = 6 THEN '14:00'::time
    ELSE '14:00'::time
  END
FROM shop_memberships sm
CROSS JOIN (SELECT unnest(ARRAY[0,1,2,3,4,5,6]) AS dow) d
WHERE sm.is_active = true
  AND sm.role IN ('owner', 'staff', 'admin')
  AND d.dow BETWEEN 1 AND 6  -- Mon-Sat, skip Sunday (inactive)
ON CONFLICT (staff_id, day_of_week) DO NOTHING;
