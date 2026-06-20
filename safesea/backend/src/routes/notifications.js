const express = require('express');
const { pool } = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

function shape(n) {
  return {
    id: n.id,
    type: n.type,
    ico: n.ico,
    bg: n.bg,
    t: n.title,
    m: n.message,
    tm: n.time_label,
    unread: n.unread,
    sos: n.is_sos,
  };
}

// GET /api/notifications
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC, id DESC');
    res.json(rows.map(shape));
  } catch (e) {
    console.error('notifications error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { router, shape };
