// ECO Guest house and Cafe - booking server
// Node.js + Express, JSON file storage, image upload via multer. No payment.

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mailer = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Admin password (change this!) --------------------------------------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'eco2024';
// -------------------------------------------------------------------------

// Data + uploads live under configurable paths so a hosting volume
// (e.g. Railway) can persist them across redeploys. Defaults keep local dev
// working with ./data and ./public/uploads.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'public', 'uploads');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const GALLERY_FILE = path.join(DATA_DIR, 'gallery.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure folders exist
for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

// ---- Tiny JSON store helpers -------------------------------------------
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
function id() {
  return crypto.randomBytes(6).toString('hex');
}

// ---- Admin password storage (hashed, persisted to the volume) -----------
function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(pw, stored) {
  if (!stored || !stored.salt || !stored.hash) return false;
  const h = crypto.scryptSync(String(pw), stored.salt, 64).toString('hex');
  const a = Buffer.from(h, 'hex');
  const b = Buffer.from(stored.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Settings hold the admin password hash. Seeded from ADMIN_PASSWORD env on
// first run; once the admin changes it in the dashboard, the stored value wins.
function getSettings() {
  let s = readJson(SETTINGS_FILE, null);
  if (!s || !s.password) {
    s = { password: hashPassword(ADMIN_PASSWORD) };
    writeJson(SETTINGS_FILE, s);
  }
  if (!['mn', 'ko', 'en'].includes(s.defaultLang)) s.defaultLang = 'en'; // default site language
  return s;
}
function saveSettings(s) {
  writeJson(SETTINGS_FILE, s);
}
getSettings(); // ensure settings file exists at startup

// Map a stored image URL (/uploads/xxx.png) to its file path on disk.
function uploadPathFromUrl(url) {
  return path.join(UPLOAD_DIR, path.basename(String(url)));
}

// ---- Seed 5 example rooms on first run ----------------------------------
function seedRooms() {
  if (fs.existsSync(ROOMS_FILE)) return;
  const seed = [
    {
      name: { mn: 'Хос ор өрөө 1', ko: '더블룸 1', en: 'Double Room 1' },
      desc: {
        mn: 'Тухтай хос ор бүхий тайван өрөө. Wi-Fi, халуун усны душ.',
        ko: '아늑한 더블 침대 객실. Wi-Fi, 온수 샤워 완비.',
        en: 'Cozy room with a double bed. Wi-Fi and hot shower.',
      },
      price: 90000, capacity: 2,
    },
    {
      name: { mn: 'Хос ор өрөө 2', ko: '더블룸 2', en: 'Double Room 2' },
      desc: {
        mn: 'Гэрэлтэй, цонхоороо байгаль харагдах хос ор өрөө.',
        ko: '채광이 좋고 자연 전망이 있는 더블룸.',
        en: 'Bright double room with a view of nature.',
      },
      price: 90000, capacity: 2,
    },
    {
      name: { mn: 'Ихэр ор өрөө 1', ko: '트윈룸 1', en: 'Twin Room 1' },
      desc: {
        mn: 'Хоёр дан ортой, найз нөхөд, хамтрагчдад тохиромжтой.',
        ko: '싱글 침대 2개, 친구·동료 여행객에게 적합.',
        en: 'Two single beds, perfect for friends or colleagues.',
      },
      price: 100000, capacity: 2,
    },
    {
      name: { mn: 'Ихэр ор өрөө 2', ko: '트윈룸 2', en: 'Twin Room 2' },
      desc: {
        mn: 'Өргөн уужим ихэр ор өрөө, ажлын ширээтэй.',
        ko: '넓은 트윈룸, 업무용 책상 구비.',
        en: 'Spacious twin room with a work desk.',
      },
      price: 100000, capacity: 2,
    },
    {
      name: { mn: 'Гэр бүлийн өрөө', ko: '패밀리룸', en: 'Family Room' },
      desc: {
        mn: 'Гэр бүлд зориулсан том өрөө, 4 хүн багтана.',
        ko: '가족을 위한 넓은 객실, 최대 4인.',
        en: 'Large room for families, sleeps up to 4.',
      },
      price: 160000, capacity: 4,
    },
  ];
  const rooms = seed.map((r, i) => ({
    id: id(),
    name: r.name,
    desc: r.desc,
    price: r.price,
    capacity: r.capacity,
    images: [],
    cover: 0,
    active: true,
    order: i,
  }));
  writeJson(ROOMS_FILE, rooms);
}
seedRooms();

// ---- Auth ---------------------------------------------------------------
const activeTokens = new Set();

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token && activeTokens.has(token)) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// ---- Uploads ------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, `${Date.now()}-${id()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// ---- Middleware & static ------------------------------------------------
app.use(express.json());

// Friendly URL: /admin -> admin.html (must be before static)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve uploaded images from UPLOAD_DIR (may be a mounted volume outside public/)
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// =========================================================================
// Public API
// =========================================================================

// ---- Site gallery (hero / about slideshows) ----------------------------
function getGallery() {
  const g = readJson(GALLERY_FILE, { hero: [], about: [] });
  g.hero = Array.isArray(g.hero) ? g.hero : [];
  g.about = Array.isArray(g.about) ? g.about : [];
  return g;
}
const GALLERY_SECTIONS = ['hero', 'about'];

// Public gallery
app.get('/api/gallery', (req, res) => {
  res.json(getGallery());
});

// Public site settings (safe fields only — never the password)
app.get('/api/site-settings', (req, res) => {
  res.json({ defaultLang: getSettings().defaultLang });
});

// Public room list (active rooms only)
app.get('/api/rooms', (req, res) => {
  const rooms = readJson(ROOMS_FILE, [])
    .filter((r) => r.active)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  res.json(rooms);
});

// Booking dates overlap check
function overlaps(aIn, aOut, bIn, bOut) {
  return aIn < bOut && aOut > bIn;
}

// A booking blocks its dates only while pending or confirmed.
// Cancelled and rejected bookings free the room up again.
function isBlocking(status) {
  return status === 'pending' || status === 'confirmed';
}

// Create a booking request (no payment)
app.post('/api/bookings', (req, res) => {
  const { roomId, name, phone, email, checkIn, checkOut, guests, message, lang, country } = req.body || {};

  if (!roomId || !name || !phone || !email || !checkIn || !checkOut) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  if (!(checkIn < checkOut)) {
    return res.status(400).json({ error: 'invalid_dates' });
  }

  const rooms = readJson(ROOMS_FILE, []);
  const room = rooms.find((r) => r.id === roomId && r.active);
  if (!room) return res.status(404).json({ error: 'room_not_found' });

  const g = parseInt(guests, 10) || 1;
  if (g > room.capacity) return res.status(400).json({ error: 'too_many_guests' });

  const bookings = readJson(BOOKINGS_FILE, []);
  const conflict = bookings.some(
    (b) =>
      b.roomId === roomId &&
      isBlocking(b.status) &&
      overlaps(checkIn, checkOut, b.checkIn, b.checkOut)
  );
  if (conflict) return res.status(409).json({ error: 'room_unavailable' });

  const booking = {
    id: id(),
    roomId,
    name: String(name).slice(0, 120),
    phone: String(phone).slice(0, 60),
    email: String(email || '').slice(0, 120),
    checkIn,
    checkOut,
    guests: g,
    country: String(country || '').slice(0, 80),
    message: String(message || '').slice(0, 1000),
    lang: ['mn', 'ko', 'en'].includes(lang) ? lang : 'en',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  bookings.push(booking);
  writeJson(BOOKINGS_FILE, bookings);
  res.status(201).json({ ok: true, booking });

  // Notify guest + admin (fire-and-forget; never blocks the response)
  mailer.sendBookingCreated(booking, room.name).catch((e) => console.error('[mail]', e.message));
});

// Guest booking lookup by email — returns that email's bookings + status.
app.post('/api/bookings/lookup', (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  const rooms = readJson(ROOMS_FILE, []);
  const roomName = (id) => {
    const r = rooms.find((x) => x.id === id);
    return r ? r.name : null;
  };
  const bookings = readJson(BOOKINGS_FILE, [])
    .filter((b) => String(b.email || '').toLowerCase() === email)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) // newest first
    .map((b) => ({
      id: b.id,
      roomName: roomName(b.roomId),
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      guests: b.guests,
      status: b.status,
    }));
  res.json({ bookings });
});

// Booked date ranges for a room (so the site can block unavailable dates)
app.get('/api/rooms/:id/booked', (req, res) => {
  const bookings = readJson(BOOKINGS_FILE, []).filter(
    (b) => b.roomId === req.params.id && isBlocking(b.status)
  );
  res.json(bookings.map((b) => ({ checkIn: b.checkIn, checkOut: b.checkOut })));
});

// =========================================================================
// Admin API
// =========================================================================

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (verifyPassword(password || '', getSettings().password)) {
    const token = id() + id();
    activeTokens.add(token);
    return res.json({ token });
  }
  res.status(401).json({ error: 'wrong_password' });
});

// Update site settings (default language)
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const { defaultLang } = req.body || {};
  if (!['mn', 'ko', 'en'].includes(defaultLang)) {
    return res.status(400).json({ error: 'invalid_lang' });
  }
  const settings = getSettings();
  settings.defaultLang = defaultLang;
  saveSettings(settings);
  res.json({ ok: true, defaultLang });
});

// Email diagnostics: config status + send a real test to ADMIN_EMAIL
app.get('/api/admin/mail-config', requireAdmin, (req, res) => {
  res.json(mailer.config());
});
app.post('/api/admin/mail-test', requireAdmin, async (req, res) => {
  const result = await mailer.sendTest();
  res.status(result.ok ? 200 : 500).json(result);
});

// Change the admin password (requires the current password)
app.post('/api/admin/password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const settings = getSettings();
  if (!verifyPassword(currentPassword || '', settings.password)) {
    return res.status(400).json({ error: 'wrong_current' });
  }
  if (!newPassword || String(newPassword).length < 4) {
    return res.status(400).json({ error: 'weak_password' });
  }
  settings.password = hashPassword(String(newPassword));
  saveSettings(settings);
  // Invalidate every other session; keep the current one logged in.
  const current = (req.headers.authorization || '').slice(7);
  activeTokens.clear();
  activeTokens.add(current);
  res.json({ ok: true });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  const token = (req.headers.authorization || '').slice(7);
  activeTokens.delete(token);
  res.json({ ok: true });
});

// All rooms (including hidden)
app.get('/api/admin/rooms', requireAdmin, (req, res) => {
  const rooms = readJson(ROOMS_FILE, []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  res.json(rooms);
});

// Create room
app.post('/api/admin/rooms', requireAdmin, (req, res) => {
  const rooms = readJson(ROOMS_FILE, []);
  const b = req.body || {};
  const room = {
    id: id(),
    name: { mn: b?.name?.mn || '', ko: b?.name?.ko || '', en: b?.name?.en || '' },
    desc: { mn: b?.desc?.mn || '', ko: b?.desc?.ko || '', en: b?.desc?.en || '' },
    price: Number(b.price) || 0,
    capacity: Number(b.capacity) || 1,
    images: [],
    cover: 0,
    active: b.active !== false,
    order: rooms.length,
  };
  rooms.push(room);
  writeJson(ROOMS_FILE, rooms);
  res.status(201).json(room);
});

// Update room fields
app.put('/api/admin/rooms/:id', requireAdmin, (req, res) => {
  const rooms = readJson(ROOMS_FILE, []);
  const room = rooms.find((r) => r.id === req.params.id);
  if (!room) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};

  if (b.name) room.name = { mn: b.name.mn || '', ko: b.name.ko || '', en: b.name.en || '' };
  if (b.desc) room.desc = { mn: b.desc.mn || '', ko: b.desc.ko || '', en: b.desc.en || '' };
  if (b.price !== undefined) room.price = Number(b.price) || 0;
  if (b.capacity !== undefined) room.capacity = Number(b.capacity) || 1;
  if (b.active !== undefined) room.active = !!b.active;
  if (b.cover !== undefined) room.cover = Number(b.cover) || 0;
  if (Array.isArray(b.images)) room.images = b.images;

  writeJson(ROOMS_FILE, rooms);
  res.json(room);
});

// Delete room (and its uploaded images)
app.delete('/api/admin/rooms/:id', requireAdmin, (req, res) => {
  let rooms = readJson(ROOMS_FILE, []);
  const room = rooms.find((r) => r.id === req.params.id);
  if (!room) return res.status(404).json({ error: 'not_found' });
  for (const img of room.images || []) {
    fs.rm(uploadPathFromUrl(img), { force: true }, () => {});
  }
  rooms = rooms.filter((r) => r.id !== req.params.id);
  writeJson(ROOMS_FILE, rooms);
  res.json({ ok: true });
});

// Upload images to a room
app.post('/api/admin/rooms/:id/images', requireAdmin, upload.array('images', 12), (req, res) => {
  const rooms = readJson(ROOMS_FILE, []);
  const room = rooms.find((r) => r.id === req.params.id);
  if (!room) return res.status(404).json({ error: 'not_found' });
  const urls = (req.files || []).map((f) => `/uploads/${f.filename}`);
  room.images = [...(room.images || []), ...urls];
  writeJson(ROOMS_FILE, rooms);
  res.json(room);
});

// Delete one image from a room
app.delete('/api/admin/rooms/:id/images', requireAdmin, (req, res) => {
  const { url } = req.body || {};
  const rooms = readJson(ROOMS_FILE, []);
  const room = rooms.find((r) => r.id === req.params.id);
  if (!room) return res.status(404).json({ error: 'not_found' });
  const idx = (room.images || []).indexOf(url);
  if (idx >= 0) {
    room.images.splice(idx, 1);
    if (room.cover >= room.images.length) room.cover = 0;
    fs.rm(uploadPathFromUrl(url), { force: true }, () => {});
    writeJson(ROOMS_FILE, rooms);
  }
  res.json(room);
});

// Upload images to a site gallery section (hero | about)
app.post(
  '/api/admin/gallery/:section/images',
  requireAdmin,
  upload.array('images', 12),
  (req, res) => {
    const { section } = req.params;
    if (!GALLERY_SECTIONS.includes(section)) return res.status(400).json({ error: 'bad_section' });
    const g = getGallery();
    const urls = (req.files || []).map((f) => `/uploads/${f.filename}`);
    g[section] = [...g[section], ...urls];
    writeJson(GALLERY_FILE, g);
    res.json(g);
  }
);

// Delete one image from a site gallery section
app.delete('/api/admin/gallery/:section/images', requireAdmin, (req, res) => {
  const { section } = req.params;
  if (!GALLERY_SECTIONS.includes(section)) return res.status(400).json({ error: 'bad_section' });
  const { url } = req.body || {};
  const g = getGallery();
  const idx = g[section].indexOf(url);
  if (idx >= 0) {
    g[section].splice(idx, 1);
    fs.rm(uploadPathFromUrl(url), { force: true }, () => {});
    writeJson(GALLERY_FILE, g);
  }
  res.json(g);
});

// Bookings (admin)
app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  const bookings = readJson(BOOKINGS_FILE, []).sort((a, b) =>
    a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0
  );
  res.json(bookings);
});

app.patch('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const bookings = readJson(BOOKINGS_FILE, []);
  const booking = bookings.find((b) => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: 'not_found' });
  const { status } = req.body || {};
  if (!['pending', 'confirmed', 'rejected', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'invalid_status' });
  }
  const changed = booking.status !== status;
  booking.status = status;
  writeJson(BOOKINGS_FILE, bookings);
  res.json(booking);

  // Notify guest + admin on meaningful status changes (fire-and-forget)
  if (changed && ['confirmed', 'rejected', 'cancelled'].includes(status)) {
    const room = readJson(ROOMS_FILE, []).find((r) => r.id === booking.roomId);
    mailer
      .sendStatusUpdate(booking, room ? room.name : null, status)
      .catch((e) => console.error('[mail]', e.message));
  }
});

app.delete('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  let bookings = readJson(BOOKINGS_FILE, []);
  bookings = bookings.filter((b) => b.id !== req.params.id);
  writeJson(BOOKINGS_FILE, bookings);
  res.json({ ok: true });
});

// Multer / generic error handler
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || 'error' });
  next();
});

app.listen(PORT, () => {
  console.log(`\nECO Guest house booking site running:`);
  console.log(`  Guests : http://localhost:${PORT}/`);
  console.log(`  Admin  : http://localhost:${PORT}/admin  (password: set via ADMIN_PASSWORD, changeable in the dashboard)\n`);
});
