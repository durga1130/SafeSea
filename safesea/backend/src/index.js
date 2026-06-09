const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const { pool, init } = require('./db');
const { verifyToken } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const { router: vesselRoutes, shape: vesselShape } = require('./routes/vessels');
const { router: notifRoutes } = require('./routes/notifications');
const { router: messageRoutes } = require('./routes/messages');
const usersRoutes = require('./routes/users');
const makeSosRouter = require('./routes/sos');

const PORT = parseInt(process.env.PORT || '4000', 10);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Mount REST routes
app.use('/api/auth', authRoutes);
app.use('/api/vessels', vesselRoutes);
app.use('/api/notifications', notifRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/sos', makeSosRouter(io));

// ── Socket.IO: real-time vessel tracking ──────────────────────
io.use((socket, next) => {
  // token optional — tracking feed is broadcast to connected clients
  const token = socket.handshake.auth && socket.handshake.auth.token;
  socket.user = token ? verifyToken(token) : null;
  next();
});

let fleet = []; // in-memory live fleet

function recompute(v) {
  // simple decay/jitter of distance to border, then derive zone + risk
  v.dist = Math.max(1, v.dist + (Math.random() - 0.5) * 1.2);
  v.zone = v.dist > 20 ? 'safe' : v.dist > 8 ? 'warning' : 'danger';
  const pDist = Math.min(1, Math.exp(-v.dist / 12));
  const pSpd = Math.min(1, v.spd / 25);
  v.risk = Math.round((0.7 * pDist + 0.3 * pSpd) * 100);
}

async function loadFleet() {
  const { rows } = await pool.query('SELECT * FROM vessels ORDER BY id');
  fleet = rows.map((r) => ({
    vessel_id: r.vessel_id, name: r.name,
    lat: Number(r.lat), lon: Number(r.lon),
    spd: Number(r.spd), dist: Number(r.dist),
    risk: Number(r.risk), zone: r.zone,
  }));
}

let tickCount = 0;
async function tick() {
  if (!fleet.length) return;
  fleet.forEach((v) => {
    // gentle random-walk movement
    v.lat += (Math.random() - 0.5) * 0.01;
    v.lon += (Math.random() - 0.5) * 0.01;
    v.spd = Math.max(2, Math.min(22, v.spd + (Math.random() - 0.5) * 1.5));
    recompute(v);
  });

  // broadcast in the exact UI shape
  io.emit('vessels:update', fleet.map((v) => ({
    id: v.vessel_id, name: v.name,
    lat: v.lat, lon: v.lon, spd: v.spd,
    dist: v.dist, risk: v.risk, zone: v.zone,
  })));

  // persist every ~5 ticks
  tickCount++;
  if (tickCount % 5 === 0) {
    try {
      for (const v of fleet) {
        await pool.query(
          `UPDATE vessels SET lat=$1, lon=$2, spd=$3, dist=$4, risk=$5, zone=$6, updated_at=now() WHERE vessel_id=$7`,
          [v.lat, v.lon, v.spd, v.dist, v.risk, v.zone, v.vessel_id]
        );
      }
    } catch (e) { console.warn('persist failed', e.message); }
  }
}

io.on('connection', (socket) => {
  // send the current fleet immediately on connect
  socket.emit('vessels:update', fleet.map((v) => ({
    id: v.vessel_id, name: v.name,
    lat: v.lat, lon: v.lon, spd: v.spd,
    dist: v.dist, risk: v.risk, zone: v.zone,
  })));
});

(async () => {
  try {
    await init();
    await loadFleet();
    setInterval(tick, 2000);
    server.listen(PORT, () => console.log(`[safesea] backend listening on :${PORT}`));
  } catch (e) {
    console.error('Fatal startup error:', e);
    process.exit(1);
  }
})();
