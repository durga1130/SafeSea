-- ════════════════════════════════════════════════════════════
-- SafeSea — seed data (idempotent)
-- Default logins:
--   fisherman : fisher_001 / pass123
--   crew      : crew_001   / crew123
--   admin     : admin      / admin123
-- ════════════════════════════════════════════════════════════

INSERT INTO users (username, password_hash, role, fullname, email, phone, vessel, nationality) VALUES
  ('fisher_001', '$2a$10$JFi7hrE8CejhsisjQ7CKjepw2V9ptJ/KFylBaBhVFuxZDNsS5BOxu', 'fisherman', 'Ravi Kumar',        'fisher001@gmail.com',      '+91 98765 43210', 'IND-TN-042', 'IND'),
  ('crew_001',   '$2a$10$0NlsPKbjpSXr3EjLvylOOeEvptUpl4wm1Tp8vbWIkpTS386Dwz3rO', 'crew',      'Senthil Murugan',   'crew001@gmail.com',        '+91 90000 11111', 'IND-TN-101', 'IND'),
  ('admin',      '$2a$10$ajelF4GMpHeC6m6HJKzIwOBCWfrUd0c40bHmDbd72UY3kX5/bF37i', 'admin',     'Coast Guard Admin', 'sharupriya3010@gmail.com', '+91 97914 85043', 'CG-HQ',      'IND')
ON CONFLICT (username) DO NOTHING;

INSERT INTO vessels (vessel_id, name, lat, lon, spd, dist, risk, zone) VALUES
  ('IND-TN-042', 'Ravi Kumar',   9.254, 79.851, 12.4, 18.4, 12, 'safe'),
  ('IND-TN-101', 'Muthu Selvam', 9.45,  79.9,    9.8,  9.2, 55, 'warning'),
  ('IND-TN-087', 'Anbarasan',    9.62,  80.1,   14.2,  4.1, 82, 'danger'),
  ('IND-KL-033', 'Suresh Babu',  8.9,   79.7,   11.0, 28.0,  8, 'safe'),
  ('IND-AP-015', 'Venkata Rao', 10.1,   79.5,    7.5, 41.0,  4, 'safe'),
  ('IND-TN-055', 'Palanisamy',   9.3,   80.0,   13.0,  7.8, 68, 'warning')
ON CONFLICT (vessel_id) DO NOTHING;

INSERT INTO notifications (type, ico, bg, title, message, time_label, unread, is_sos) VALUES
  ('sos',  '🆘', 'rgba(255,34,68,.15)',  'SOS — IND-TN-087',     'Anbarasan is 4.1nm from border. Risk: 82%',          '08:42 UTC', true,  true),
  ('warn', '⚠️', 'rgba(255,214,0,.12)',  'Warning — IND-TN-055', 'Palanisamy: 7.8nm from boundary. Risk 68%',          '08:31 UTC', true,  false),
  ('warn', '⚠️', 'rgba(255,214,0,.12)',  'Warning — IND-TN-101', 'Muthu Selvam: Risk 55%',                             '08:15 UTC', true,  false),
  ('info', 'ℹ️', 'rgba(0,200,255,.1)',   'Weather Update',       'Wave height rising 1.8m in Bay of Bengal zone 4',    '07:00 UTC', false, false),
  ('ok',   '✅', 'rgba(0,255,136,.08)',  'Safe — IND-AP-015',    'Venkata Rao returned to safe zone.',                 '06:45 UTC', false, false)
ON CONFLICT DO NOTHING;
