// Guest-facing site logic: i18n, load rooms, submit booking.
(function () {
  let rooms = [];

  function t(key) {
    const lang = getLang();
    return (window.I18N[lang] && window.I18N[lang][key]) || key;
  }

  function applyI18n() {
    const lang = getLang();
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const val = t(key);
      if (val) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      el.placeholder = t(el.getAttribute('data-i18n-ph'));
    });
    // active language button
    document.querySelectorAll('#langSwitch button').forEach((b) => {
      b.classList.toggle('active', b.dataset.lang === lang);
    });
    renderRooms();
    fillRoomSelect();
    if (calendar) calendar.refresh(); // weekday/month names follow the language
  }

  function money(n) {
    return '₮' + Number(n || 0).toLocaleString('en-US');
  }

  function roomName(room) {
    const lang = getLang();
    return room.name[lang] || room.name.en || room.name.mn || room.name.ko || '';
  }
  function roomDesc(room) {
    const lang = getLang();
    return room.desc[lang] || room.desc.en || room.desc.mn || room.desc.ko || '';
  }

  function renderRooms() {
    const grid = document.getElementById('roomsGrid');
    if (!grid) return;
    grid.innerHTML = rooms
      .map((r) => {
        const cover = r.images && r.images.length ? r.images[r.cover || 0] : null;
        const img = cover
          ? `<img src="${cover}" alt="" loading="lazy" />`
          : `<div class="no-photo">🌿</div>`;
        return `
        <article class="room-card">
          <div class="room-photo">${img}</div>
          <div class="room-body">
            <h3>${escapeHtml(roomName(r))}</h3>
            <p class="room-desc">${escapeHtml(roomDesc(r))}</p>
            <div class="room-meta">
              <span class="room-price">${money(r.price)} <small>${t('per_night')}</small></span>
              <span class="room-cap">👤 ${r.capacity} ${t('capacity')}</span>
            </div>
            <button class="btn btn-outline book-btn" data-room="${r.id}">${t('book_this')}</button>
          </div>
        </article>`;
      })
      .join('');

    grid.querySelectorAll('.book-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById('roomSelect').value = btn.dataset.room;
        if (calendar) calendar.reset();
        loadBookedForRoom(btn.dataset.room);
        document.getElementById('book').scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  function fillRoomSelect() {
    const sel = document.getElementById('roomSelect');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML =
      `<option value="" disabled ${current ? '' : 'selected'}>${t('f_room_ph')}</option>` +
      rooms
        .map(
          (r) =>
            `<option value="${r.id}" ${r.id === current ? 'selected' : ''}>${escapeHtml(
              roomName(r)
            )} — ${money(r.price)}</option>`
        )
        .join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Reusable slideshow: fills `root` with fading background slides + arrows + dots.
  function buildSlideshow(root, images, opts) {
    opts = opts || {};
    if (root._timer) clearInterval(root._timer);
    root.innerHTML = '';
    if (!images || !images.length) {
      root.classList.add('empty');
      return;
    }
    root.classList.remove('empty');

    const slidesWrap = document.createElement('div');
    slidesWrap.className = 'slides';
    images.forEach((url, i) => {
      const s = document.createElement('div');
      s.className = 'slide' + (i === 0 ? ' active' : '');
      s.style.backgroundImage = `url("${url}")`;
      slidesWrap.appendChild(s);
    });
    root.appendChild(slidesWrap);

    let idx = 0;
    let dots = null;
    const slides = slidesWrap.querySelectorAll('.slide');

    function show(n) {
      idx = (n + slides.length) % slides.length;
      slides.forEach((s, i) => s.classList.toggle('active', i === idx));
      if (dots) dots.querySelectorAll('button').forEach((d, i) => d.classList.toggle('active', i === idx));
    }
    function restart() {
      if (root._timer) clearInterval(root._timer);
      if (images.length > 1 && opts.auto !== false) {
        root._timer = setInterval(() => show(idx + 1), opts.interval || 5000);
      }
    }

    if (images.length > 1) {
      const prev = document.createElement('button');
      prev.className = 's-nav s-prev';
      prev.type = 'button';
      prev.innerHTML = '‹';
      prev.setAttribute('aria-label', 'Previous');
      const next = document.createElement('button');
      next.className = 's-nav s-next';
      next.type = 'button';
      next.innerHTML = '›';
      next.setAttribute('aria-label', 'Next');
      prev.addEventListener('click', () => { show(idx - 1); restart(); });
      next.addEventListener('click', () => { show(idx + 1); restart(); });
      root.appendChild(prev);
      root.appendChild(next);

      dots = document.createElement('div');
      dots.className = 's-dots';
      images.forEach((_, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        if (i === 0) b.className = 'active';
        b.addEventListener('click', () => { show(i); restart(); });
        dots.appendChild(b);
      });
      root.appendChild(dots);
    }
    restart();
  }

  async function loadGallery() {
    let g = { hero: [], about: [] };
    try {
      g = await (await fetch('/api/gallery')).json();
    } catch {}
    const hero = document.getElementById('heroSlides');
    const about = document.getElementById('aboutSlides');
    if (hero) buildSlideshow(hero, g.hero, { interval: 6000 });
    if (about) buildSlideshow(about, g.about, { interval: 5000 });
  }

  async function loadRooms() {
    try {
      const res = await fetch('/api/rooms');
      rooms = await res.json();
    } catch {
      rooms = [];
    }
    renderRooms();
    fillRoomSelect();
  }

  let calendar = null;

  function setupCalendar() {
    const mount = document.getElementById('calendar');
    if (!mount || !window.createCalendar) return;
    calendar = createCalendar(mount, {
      onChange(checkIn, checkOut) {
        document.getElementById('checkIn').value = checkIn || '';
        document.getElementById('checkOut').value = checkOut || '';
        document.getElementById('ciLabel').textContent = checkIn || '—';
        document.getElementById('coLabel').textContent = checkOut || '—';
      },
    });
  }

  // Load booked date ranges for the selected room and feed them to the calendar.
  async function loadBookedForRoom(roomId) {
    if (!calendar) return;
    if (!roomId) {
      calendar.setBlocked([]);
      return;
    }
    try {
      const res = await fetch('/api/rooms/' + roomId + '/booked');
      calendar.setBlocked(await res.json());
    } catch {
      calendar.setBlocked([]);
    }
  }

  async function submitBooking(e) {
    e.preventDefault();
    const form = e.target;
    const errEl = document.getElementById('formError');
    errEl.textContent = '';
    const data = Object.fromEntries(new FormData(form).entries());
    data.lang = getLang(); // so the confirmation email is in the guest's language

    if (!data.roomId) {
      errEl.textContent = t('err_noroom');
      return;
    }
    if (!data.checkIn || !data.checkOut) {
      errEl.textContent = t('err_nodates');
      return;
    }
    if (!(data.checkIn < data.checkOut)) {
      errEl.textContent = t('err_dates');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        form.reset();
        if (calendar) calendar.reset();
        document.querySelector('input[name="guests"]').value = 1;
        openModal();
      } else {
        const j = await res.json().catch(() => ({}));
        const map = {
          room_unavailable: 'err_unavailable',
          invalid_dates: 'err_dates',
          too_many_guests: 'err_guests',
          invalid_email: 'err_email',
        };
        errEl.textContent = t(map[j.error] || 'err_generic');
      }
    } catch {
      errEl.textContent = t('err_generic');
    } finally {
      btn.disabled = false;
    }
  }

  function openModal() {
    document.getElementById('successModal').hidden = false;
  }
  function closeModal() {
    document.getElementById('successModal').hidden = true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('year').textContent = new Date().getFullYear();

    document.querySelectorAll('#langSwitch button').forEach((b) => {
      b.addEventListener('click', () => {
        setLang(b.dataset.lang);
        applyI18n();
      });
    });

    document.getElementById('menuToggle').addEventListener('click', () => {
      document.getElementById('nav').classList.toggle('open');
    });
    document.querySelectorAll('#nav a').forEach((a) =>
      a.addEventListener('click', () => document.getElementById('nav').classList.remove('open'))
    );

    document.getElementById('bookingForm').addEventListener('submit', submitBooking);
    document.getElementById('modalClose').addEventListener('click', closeModal);

    setupCalendar();
    // Reload availability whenever the chosen room changes
    document.getElementById('roomSelect').addEventListener('change', (e) => {
      if (calendar) calendar.reset();
      loadBookedForRoom(e.target.value);
    });

    loadGallery();
    loadRooms().then(applyI18n);
    applyI18n();
  });
})();
