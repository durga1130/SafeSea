const express = require('express');
const { pool, adminEmail } = require('../db');
const { auth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function utcLabel() {
  // matches the original UI's nowStr(): toUTCString().slice(5,25)
  return new Date().toUTCString().slice(5, 25);
}

function inboxShape(m) {
  return {
    id: m.id,
    from: m.from_email,
    fromName: m.from_name,
    to: m.to_email,
    vessel: m.vessel,
    subject: m.subject,
    body: m.body,
    time: m.time_label,
    type: m.type,
    unread: m.unread,
    replyTo: m.reply_to_email,
  };
}

function sentShape(m) {
  return {
    id: m.id,
    to: m.to_email,
    subject: m.subject,
    body: m.body,
    time: m.time_label,
    type: m.type,
    reply: m.reply_text || undefined,
  };
}

// GET /api/messages/inbox  — messages addressed to the current user
router.get('/inbox', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM messages WHERE to_email = $1 ORDER BY created_at DESC, id DESC',
      [req.user.email]
    );
    res.json(rows.map(inboxShape));
  } catch (e) {
    console.error('inbox error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/messages/sent  — messages sent by the current user
router.get('/sent', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM messages WHERE from_email = $1 ORDER BY created_at DESC, id DESC',
      [req.user.email]
    );
    res.json(rows.map(sentShape));
  } catch (e) {
    console.error('sent error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/messages  — compose a message to the Coast Guard admin
router.post('/', auth, async (req, res) => {
  const { subject, body, type } = req.body || {};
  if (!subject || !body) return res.status(400).json({ error: 'subject and body required' });
  try {
    const { rows: urows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const u = urows[0] || {};
    const to = await adminEmail();
    const { rows } = await pool.query(
      `INSERT INTO messages (sender_id, from_email, from_name, to_email, vessel, subject, body, type, time_label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.id, req.user.email, u.fullname || req.user.username, to, u.vessel || null,
        subject, body, type || 'info', utcLabel()]
    );
    res.status(201).json(sentShape(rows[0]));
  } catch (e) {
    console.error('compose error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/messages/:id/reply  — admin replies to a received message
router.post('/:id/reply', auth, requireAdmin, async (req, res) => {
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ error: 'body required' });
  try {
    const { rows: orows } = await pool.query('SELECT * FROM messages WHERE id = $1', [req.params.id]);
    const original = orows[0];
    if (!original) return res.status(404).json({ error: 'Original message not found' });

    // Create the reply message delivered to the original sender's inbox
    const { rows } = await pool.query(
      `INSERT INTO messages (sender_id, from_email, from_name, to_email, vessel, subject, body, type, reply_to_email, parent_id, time_label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'reply',$8,$9,$10) RETURNING *`,
      [req.user.id, req.user.email, 'Coast Guard Admin', original.from_email, original.vessel,
        'Re: ' + original.subject, `Admin Reply:\n\n${body}\n\n---\nOriginal Subject: ${original.subject}`,
        original.from_email, original.id, utcLabel()]
    );

    // Annotate the original so it shows the reply in the sender's "Sent" view
    await pool.query('UPDATE messages SET replied = true, reply_text = $1 WHERE id = $2', [body, original.id]);

    res.status(201).json(inboxShape(rows[0]));
  } catch (e) {
    console.error('reply error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { router, utcLabel };
