import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, initDb } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3001;
const ML_SERVICE_URL = 'http://localhost:8000';

const fastify = Fastify({ logger: true });

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

await fastify.register(fastifyCors, { origin: '*' });
await fastify.register(fastifyJwt, { secret: 'medsecure-super-secret-key-2026' });
await fastify.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024 } });
await fastify.register(fastifyWebsocket);
await fastify.register(fastifyStatic, {
  root: uploadsDir,
  prefix: '/uploads/'
});

const wsClients = new Map();
const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

async function authenticate(request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}

async function optionalAuth(request) {
  try {
    await request.jwtVerify();
  } catch (err) {
    request.user = null;
  }
}

await initDb();

// WebSocket — fixed for @fastify/websocket v10 API
fastify.register(async function (fastify) {
  fastify.get('/ws/scan', { websocket: true }, (socket, req) => {
    let currentScanId = null;

    socket.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.action === 'join' && data.scanId) {
          currentScanId = data.scanId;
          if (!wsClients.has(currentScanId)) {
            wsClients.set(currentScanId, []);
          }
          wsClients.get(currentScanId).push(socket);
          socket.send(JSON.stringify({ status: 'subscribed', scanId: currentScanId }));
        }
      } catch (err) {
        console.error('WS parse error:', err.message);
      }
    });

    socket.on('close', () => {
      if (currentScanId && wsClients.has(currentScanId)) {
        const remaining = wsClients.get(currentScanId).filter(s => s !== socket);
        if (remaining.length === 0) wsClients.delete(currentScanId);
        else wsClients.set(currentScanId, remaining);
      }
    });
  });
});

// ──────────────────────────────────────── AUTH ────────────────────────────────────────

fastify.post('/api/v1/auth/register', async (request, reply) => {
  const { email, password, role, license_number, pin_code } = request.body || {};
  if (!email || !password || !role) return reply.status(400).send({ error: 'email, password, and role are required' });

  const existing = await query.get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return reply.status(409).send({ error: 'Email already registered' });

  const id = 'usr-' + generateId();
  const hash = bcrypt.hashSync(password, 10);
  const verified = ['consumer', 'healthcare_worker'].includes(role) ? 1 : 1;

  await query.run(
    'INSERT INTO users (id, email, password_hash, role, verified, license_number, pin_code) VALUES (?,?,?,?,?,?,?)',
    [id, email, hash, role, verified, license_number || null, pin_code || null]
  );

  const token = fastify.jwt.sign({ id, email, role, verified });
  return { token, user: { id, email, role, verified } };
});

fastify.post('/api/v1/auth/login', async (request, reply) => {
  const { email, password } = request.body || {};
  if (!email || !password) return reply.status(400).send({ error: 'Email and password required' });

  const user = await query.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return reply.status(401).send({ error: 'Invalid credentials' });
  }

  const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role, verified: user.verified });
  return { token, user: { id: user.id, email: user.email, role: user.role, verified: user.verified } };
});

fastify.get('/api/v1/auth/me', { preHandler: authenticate }, async (request) => {
  return await query.get('SELECT id,email,role,verified,license_number,pin_code,language FROM users WHERE id=?', [request.user.id]);
});

// ──────────────────────────────────────── MEDICINES ────────────────────────────────────────

fastify.get('/api/v1/medicines/search', async (request) => {
  const q = request.query.q;
  if (!q) return [];
  const results = await query.all(
    `SELECT id, name, generic_name, manufacturer_name, composition, expected_colors, approved_batch_format 
     FROM medicines WHERE name LIKE ? OR generic_name LIKE ? OR manufacturer_name LIKE ? OR composition LIKE ? LIMIT 20`,
    [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`]
  );
  return results.map(r => ({ ...r, composition: JSON.parse(r.composition), expected_colors: JSON.parse(r.expected_colors) }));
});

fastify.get('/api/v1/medicines/:id', async (request, reply) => {
  const row = await query.get('SELECT * FROM medicines WHERE id = ?', [request.params.id]);
  if (!row) return reply.status(404).send({ error: 'Not found' });
  return { ...row, composition: JSON.parse(row.composition), expected_colors: JSON.parse(row.expected_colors) };
});

// NEW: Medicine substitution suggestion — when a scanned medicine is flagged, find verified alternatives
fastify.get('/api/v1/medicines/:id/alternatives', async (request) => {
  const med = await query.get('SELECT generic_name, composition FROM medicines WHERE id = ?', [request.params.id]);
  if (!med) return [];
  const alts = await query.all(
    `SELECT id, name, generic_name, manufacturer_name, composition, expected_colors 
     FROM medicines WHERE generic_name = ? AND id != ? LIMIT 10`,
    [med.generic_name, request.params.id]
  );
  return alts.map(r => ({ ...r, composition: JSON.parse(r.composition), expected_colors: JSON.parse(r.expected_colors) }));
});

// ──────────────────────────────────────── SCANS ────────────────────────────────────────

fastify.post('/api/v1/scans', { preHandler: optionalAuth }, async (request, reply) => {
  const data = await request.file();
  if (!data) return reply.status(400).send({ error: 'No image uploaded' });

  const lat = parseFloat(request.headers['x-latitude']) || (20 + Math.random() * 10);
  const lng = parseFloat(request.headers['x-longitude']) || (72 + Math.random() * 8);

  const scanId = 'scan-' + generateId();
  const ext = path.extname(data.filename) || '.jpg';
  const fileName = `${scanId}${ext}`;
  const filePath = path.join(uploadsDir, fileName);

  const writeStream = fs.createWriteStream(filePath);
  await new Promise((resolve, reject) => {
    data.file.pipe(writeStream);
    data.file.on('end', resolve);
    data.file.on('error', reject);
  });

  const relativeUrl = `/uploads/${fileName}`;
  const userId = request.user ? request.user.id : null;

  await query.run(
    'INSERT INTO scans (id, user_id, image_url, lat, lng) VALUES (?,?,?,?,?)',
    [scanId, userId, relativeUrl, lat, lng]
  );

  runMlPipeline(scanId, filePath, relativeUrl, lat, lng);

  return { scanId, status: 'processing', image_url: relativeUrl };
});

async function runMlPipeline(scanId, filePath, relativeUrl, lat, lng) {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/process_scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scan_id: scanId, file_path: filePath })
    });

    if (!response.ok) throw new Error(`ML responded ${response.status}`);
    const result = await response.json();

    const verdict = result.authenticity_score >= 80 ? 'verified'
      : result.authenticity_score >= 55 ? 'caution' : 'high_risk';

    await query.run(
      `UPDATE scans SET medicine_id=?, authenticity_score=?, verdict=?,
       ocr_extracted=?, anomalies=?, signal_breakdown=?, scanned_at=CURRENT_TIMESTAMP WHERE id=?`,
      [result.medicine_id, result.authenticity_score, verdict,
       JSON.stringify(result.ocr_extracted), JSON.stringify(result.anomalies),
       JSON.stringify(result.signal_breakdown), scanId]
    );

    if (verdict === 'high_risk' && result.medicine_id) {
      const batch = result.ocr_extracted?.batch_number || 'UNKNOWN';
      const existing = await query.get('SELECT * FROM alerts WHERE medicine_id=? AND batch_number=?', [result.medicine_id, batch]);
      if (existing) {
        const newCount = existing.report_count + 1;
        await query.run('UPDATE alerts SET report_count=?, severity=?, last_updated=CURRENT_TIMESTAMP WHERE id=?',
          [newCount, newCount >= 3 ? 'high' : 'caution', existing.id]);
      } else {
        await query.run('INSERT INTO alerts (id,medicine_id,batch_number,report_count,lat,lng,severity) VALUES (?,?,?,1,?,?,?)',
          ['alt-' + generateId(), result.medicine_id, batch, lat, lng, 'caution']);
      }
    }

    const payload = JSON.stringify({
      status: 'completed', scanId,
      data: { id: scanId, image_url: relativeUrl, authenticity_score: result.authenticity_score,
        verdict, ocr_extracted: result.ocr_extracted, anomalies: result.anomalies,
        signal_breakdown: result.signal_breakdown, medicine_id: result.medicine_id,
        medicine_name: result.ocr_extracted?.name, lat, lng }
    });

    if (wsClients.has(scanId)) {
      wsClients.get(scanId).forEach(s => { try { s.send(payload); } catch (e) {} });
    }
  } catch (err) {
    console.error(`ML pipeline error for ${scanId}:`, err.message);
    await query.run(
      `UPDATE scans SET verdict='caution', authenticity_score=50,
       ocr_extracted='{}', anomalies='["ML service unavailable — fallback score applied"]',
       signal_breakdown='{"ocr":50,"visual":50,"batch":50,"barcode":50,"community":100}' WHERE id=?`,
      [scanId]
    );
    if (wsClients.has(scanId)) {
      const fallback = JSON.stringify({ status: 'completed', scanId,
        data: { id: scanId, authenticity_score: 50, verdict: 'caution',
          ocr_extracted: {}, anomalies: ['ML service unavailable — fallback score applied'],
          signal_breakdown: { ocr: 50, visual: 50, batch: 50, barcode: 50, community: 100 }, lat, lng }
      });
      wsClients.get(scanId).forEach(s => { try { s.send(fallback); } catch (e) {} });
    }
  }
}

fastify.get('/api/v1/scans/:id', { preHandler: optionalAuth }, async (request, reply) => {
  const scan = await query.get(
    `SELECT s.*, m.name as medicine_name, m.generic_name, m.manufacturer_name
     FROM scans s LEFT JOIN medicines m ON s.medicine_id = m.id WHERE s.id=?`, [request.params.id]);
  if (!scan) return reply.status(404).send({ error: 'Scan not found' });
  return { ...scan,
    ocr_extracted: scan.ocr_extracted ? JSON.parse(scan.ocr_extracted) : null,
    anomalies: scan.anomalies ? JSON.parse(scan.anomalies) : [],
    signal_breakdown: scan.signal_breakdown ? JSON.parse(scan.signal_breakdown) : null
  };
});

fastify.get('/api/v1/scans/history', { preHandler: authenticate }, async (request) => {
  return await query.all(
    `SELECT s.id, s.image_url, s.authenticity_score, s.verdict, s.scanned_at,
     m.name as medicine_name, m.generic_name, m.manufacturer_name
     FROM scans s LEFT JOIN medicines m ON s.medicine_id=m.id
     WHERE s.user_id=? ORDER BY s.scanned_at DESC LIMIT 50`, [request.user.id]);
});

// ──────────────────────────────────────── ALERTS ────────────────────────────────────────

fastify.get('/api/v1/alerts/map', async () => {
  const alerts = await query.all(
    `SELECT a.*, m.name as medicine_name, m.manufacturer_name, m.generic_name
     FROM alerts a JOIN medicines m ON a.medicine_id=m.id`);
  return {
    type: 'FeatureCollection',
    features: alerts.map(a => ({
      type: 'Feature', id: a.id,
      geometry: { type: 'Point', coordinates: [a.lng, a.lat] },
      properties: { medicine_name: a.medicine_name, manufacturer_name: a.manufacturer_name,
        batch_number: a.batch_number, report_count: a.report_count, severity: a.severity,
        generic_name: a.generic_name }
    }))
  };
});

fastify.get('/api/v1/alerts/feed', async () => {
  return await query.all(
    `SELECT a.*, m.name as medicine_name, m.generic_name, m.manufacturer_name
     FROM alerts a JOIN medicines m ON a.medicine_id=m.id ORDER BY a.last_updated DESC LIMIT 30`);
});

fastify.post('/api/v1/reports', { preHandler: authenticate }, async (request, reply) => {
  const { medicine_id, batch_number, lat, lng } = request.body || {};
  if (!medicine_id || !batch_number) return reply.status(400).send({ error: 'medicine_id and batch_number required' });

  const existing = await query.get('SELECT * FROM alerts WHERE medicine_id=? AND batch_number=?', [medicine_id, batch_number]);
  if (existing) {
    const c = existing.report_count + 1;
    await query.run('UPDATE alerts SET report_count=?, severity=?, last_updated=CURRENT_TIMESTAMP WHERE id=?',
      [c, c >= 3 ? 'high' : 'caution', existing.id]);
  } else {
    await query.run('INSERT INTO alerts (id,medicine_id,batch_number,report_count,lat,lng,severity) VALUES (?,?,?,1,?,?,?)',
      ['alt-' + generateId(), medicine_id, batch_number, lat || 22.0, lng || 73.0, 'caution']);
  }
  return { success: true };
});

// ──────────────────────────────────────── DASHBOARD ────────────────────────────────────────

fastify.get('/api/v1/dashboard/pharmacist', { preHandler: authenticate }, async (request, reply) => {
  if (!['pharmacist', 'inspector'].includes(request.user.role)) {
    return reply.status(403).send({ error: 'Role not authorized' });
  }

  const total = await query.get('SELECT COUNT(*) as c FROM scans');
  const hr = await query.get("SELECT COUNT(*) as c FROM scans WHERE verdict='high_risk'");
  const ca = await query.get("SELECT COUNT(*) as c FROM scans WHERE verdict='caution'");
  const ve = await query.get("SELECT COUNT(*) as c FROM scans WHERE verdict='verified'");
  const al = await query.get('SELECT COUNT(*) as c FROM alerts');

  const recentScans = await query.all(
    `SELECT s.id, s.authenticity_score, s.verdict, s.scanned_at, s.image_url,
     m.name as medicine_name, m.manufacturer_name
     FROM scans s LEFT JOIN medicines m ON s.medicine_id=m.id
     ORDER BY s.scanned_at DESC LIMIT 15`);

  const topFlagged = await query.all(
    `SELECT m.name, m.manufacturer_name, COUNT(*) as flag_count
     FROM scans s JOIN medicines m ON s.medicine_id=m.id
     WHERE s.verdict='high_risk' GROUP BY m.name ORDER BY flag_count DESC LIMIT 5`);

  return {
    stats: { total_scans: total.c, high_risk: hr.c, caution: ca.c, verified: ve.c, active_alerts: al.c },
    recentScans, topFlagged
  };
});

fastify.get('/api/v1/analytics/district', { preHandler: authenticate }, async (request, reply) => {
  if (request.user.role !== 'inspector') return reply.status(403).send({ error: 'Inspector role required' });
  return await query.all(
    `SELECT m.manufacturer_name, s.verdict, COUNT(*) as count
     FROM scans s JOIN medicines m ON s.medicine_id=m.id GROUP BY m.manufacturer_name, s.verdict`);
});

fastify.get('/api/v1/health', async () => {
  return { status: 'healthy', db: 'sqlite', time: new Date().toISOString(), version: '2.0.0' };
});

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`MedSecure Backend running → http://localhost:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
