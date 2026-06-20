const express = require('express');
const { pool } = require('../db');
const { auth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    fullname: u.fullname,
    email: u.email,
    phone: u.phone,
    vessel: u.vessel,
    nationality: u.nationality,
  };
}

// GET /api/users/me
router.get('/me', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(publicUser(rows[0]));
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users  (admin only)
router.get('/', auth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY id');
    res.json(rows.map(publicUser));
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
