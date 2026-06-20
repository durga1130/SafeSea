const express = require('express');
const { pool } = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

function shape(v) {
  return {
    id: v.vessel_id,
    name: v.name,
    lat: Number(v.lat),
    lon: Number(v.lon),
    spd: Number(v.spd),
    dist: Number(v.dist),
    risk: Number(v.risk),
    zone: v.zone,
  };
}

// GET /api/vessels
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM vessels ORDER BY id');
    res.json(rows.map(shape));
  } catch (e) {
    console.error('vessels error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/vessels/:vesselId
router.get('/:vesselId', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM vessels WHERE vessel_id = $1', [req.params.vesselId]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(shape(rows[0]));
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { router, shape };
