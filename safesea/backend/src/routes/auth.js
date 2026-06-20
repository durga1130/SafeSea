const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { sign } = require('../middleware/auth');

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

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    return res.json({ token: sign(user), user: publicUser(user) });
  } catch (e) {
    console.error('login error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  let { username, password, fullname, email, phone, vessel, role, nationality } = req.body || {};
  if (!username || !password || !email || !fullname) {
    return res.status(400).json({ error: 'username, password, email and fullname required' });
  }
  role = ['fisherman', 'crew', 'admin'].includes(role) ? role : 'fisherman';
  nationality = nationality || 'IND';
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, role, fullname, email, phone, vessel, nationality)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [username, hash, role, fullname, email, phone || null, vessel || null, nationality]
    );
    return res.status(201).json({ user: publicUser(rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Username or email already exists' });
    console.error('signup error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
