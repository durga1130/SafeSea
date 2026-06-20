const express = require('express');
const { pool, adminEmail } = require('../db');
const { auth } = require('../middleware/auth');
const { utcLabel } = require('./messages');

function makeRouter(io) {
  const router = express.Router();

  // POST /api/sos
  router.post('/', auth, async (req, res) => {
    const { body, lat, lon, risk, zone } = req.body || {};
    try {
      const { rows: urows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
      const u = urows[0] || {};
      const to = await adminEmail();
      const subject = `🆘 SOS ALERT — ${u.vessel || ''} — ${u.fullname || req.user.username}`;
      const text = body || `SOS from ${u.fullname || req.user.username} (${u.vessel || ''})`;

      // 1) store the SOS event
      await pool.query(
        `INSERT INTO sos_events (vessel, user_email, lat, lon, risk, zone, body)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [u.vessel || null, req.user.email, lat ?? null, lon ?? null, risk ?? null, zone ?? null, text]
      );

      // 2) store the SOS message to the admin inbox
      const { rows: mrows } = await pool.query(
        `INSERT INTO messages (sender_id, from_email, from_name, to_email, vessel, subject, body, type, time_label)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'sos',$8) RETURNING *`,
        [req.user.id, req.user.email, u.fullname || req.user.username, to, u.vessel || null,
          subject, text, utcLabel()]
      );

      // 3) create + broadcast a live notification
      const { rows: nrows } = await pool.query(
        `INSERT INTO notifications (type, ico, bg, title, message, time_label, unread, is_sos)
         VALUES ('sos','🆘','rgba(255,34,68,.15)',$1,$2,$3,true,true) RETURNING *`,
        [`SOS — ${u.vessel || req.user.username}`,
          `${u.fullname || req.user.username} broadcast an SOS distress signal.`,
          new Date().toUTCString().slice(17, 25) + ' UTC']
      );
      if (io) {
        const n = nrows[0];
        io.emit('notification:new', {
          id: n.id, type: n.type, ico: n.ico, bg: n.bg,
          t: n.title, m: n.message, tm: n.time_label, unread: n.unread, sos: n.is_sos,
        });
      }

      res.status(201).json({
        ok: true,
        message: { id: mrows[0].id, to: mrows[0].to_email, subject, body: text, time: mrows[0].time_label, type: 'sos' },
      });
    } catch (e) {
      console.error('sos error', e);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /api/sos  — admin: list recent SOS events
  router.get('/', auth, async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM sos_events ORDER BY created_at DESC LIMIT 100');
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}

module.exports = makeRouter;
