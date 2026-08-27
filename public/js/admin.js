// Admin dashboard: login, room CRUD + photo upload, booking management. (MN/KO/EN)
(function () {
  let token = localStorage.getItem('adminToken') || '';
  let rooms = [];
  let bookings = [];
  let editing = null; // room being edited (null = new)
  let bookingFilter = 'all';

  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  const money = (n) => '₮' + Number(n || 0).toLocaleString('en-US');

  // ---- i18n ----
  const lang = () => (window.getLang ? getLang() : 'ko');
  function t(key, vars) {
    const dict = (window.ADMIN_I18N && (ADMIN_I18N[lang()] || ADMIN_I18N.en)) || {};
    let s = dict[key] != null ? dict[key] : (window.ADMIN_I18N && ADMIN_I18N.en[key]) || key;
    if (vars) Object.keys(vars).forEach((k) => (s = s.replace('{' + k + '}', vars[k])));
    return s;
  }
  function localizedName(nameObj) {
    return (
      (nameObj && (nameObj[lang()] || nameObj.ko || nameObj.mn || nameObj.en)) || t('room_noname')
    );
  }
  function applyI18n() {
    document.documentElement.lang = lang();
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      el.placeholder = t(el.getAttribute('data-i18n-ph'));
    });
    document.querySelectorAll('.lang-switch button').forEach((b) =>
      b.classList.toggle('active', b.dataset.lang === lang())
    );
    // re-render dynamic content in the new language
    renderRooms();
    renderBookings();
    renderGallerySection('hero', 'heroGrid', 'heroStatus');
    renderGallerySection('about', 'aboutGrid', 'aboutStatus');
    if (!$('#roomModal').hidden) {
      $('#roomModalTitle').textContent = editing ? t('modal_edit_title') : t('modal_new_title');
    }
  }
  document.querySelectorAll('.lang-switch button').forEach((b) =>
    b.addEventListener('click', () => {
      if (window.setLang) setLang(b.dataset.lang);
      applyI18n();
    })
  );

  async function api(path, opts = {}) {
    const headers = opts.headers || {};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (opts.body && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(path, { ...opts, headers });
    if (res.status === 401) {
      logout();
      throw new Error('unauthorized');
    }
    return res;
  }

  // ---- Auth ----
  function showLogin() {
    $('#loginView').hidden = false;
    $('#dashView').hidden = true;
  }
  function showDash() {
    $('#loginView').hidden = true;
    $('#dashView').hidden = false;
    loadRooms();
    loadBookings();
  }
  function logout() {
    token = '';
    localStorage.removeItem('adminToken');
    showLogin();
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = $('#password').value;
    $('#loginError').textContent = '';
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const j = await res.json();
        token = j.token;
        localStorage.setItem('adminToken', token);
        $('#password').value = '';
        showDash();
      } else {
        $('#loginError').textContent = t('login_err_wrong');
      }
    } catch {
      $('#loginError').textContent = t('login_err_generic');
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try { await api('/api/admin/logout', { method: 'POST' }); } catch {}
    logout();
  });

  // ---- Email test ----
  $('#mailTestBtn').addEventListener('click', async () => {
    const btn = $('#mailTestBtn');
    btn.disabled = true;
    try {
      const res = await api('/api/admin/mail-test', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) {
        alert(t('mail_test_ok', { to: j.to }));
      } else if (j.error && /not configured/i.test(j.error)) {
        alert(t('mail_test_disabled'));
      } else {
        alert(t('mail_test_fail', { err: j.error || 'unknown' }));
      }
    } catch {
      alert(t('mail_test_fail', { err: 'network' }));
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Change password ----
  $('#pwBtn').addEventListener('click', () => {
    $('#pwForm').reset();
    $('#pwError').textContent = '';
    $('#pwModal').hidden = false;
  });
  $('#pwCancel').addEventListener('click', () => ($('#pwModal').hidden = true));
  $('#pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const errEl = $('#pwError');
    errEl.textContent = '';
    const currentPassword = f.currentPassword.value;
    const newPassword = f.newPassword.value;
    if (newPassword.length < 4) { errEl.textContent = t('pw_err_weak'); return; }
    if (newPassword !== f.confirmPassword.value) { errEl.textContent = t('pw_err_mismatch'); return; }
    try {
      const res = await api('/api/admin/password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      if (res.ok) {
        $('#pwModal').hidden = true;
        alert(t('pw_success'));
      } else {
        const j = await res.json().catch(() => ({}));
        errEl.textContent = t(j.error === 'wrong_current' ? 'pw_err_current' : 'pw_err_weak');
      }
    } catch {
      errEl.textContent = t('login_err_generic');
    }
  });

  // ---- Tabs ----
  document.querySelectorAll('.tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      tab.classList.add('active');
      const name = tab.dataset.tab;
      $('#tab-rooms').hidden = name !== 'rooms';
      $('#tab-gallery').hidden = name !== 'gallery';
      $('#tab-bookings').hidden = name !== 'bookings';
      $('#tab-settings').hidden = name !== 'settings';
      if (name === 'gallery') loadGallery();
      if (name === 'settings') loadSiteSettings();
    })
  );

  // ---- Site settings (default language) ----
  let siteDefaultLang = 'en';
  async function loadSiteSettings() {
    try {
      const s = await (await fetch('/api/site-settings')).json();
      if (s && ['mn', 'ko', 'en'].includes(s.defaultLang)) {
        siteDefaultLang = s.defaultLang;
        window.SITE_DEFAULT_LANG = s.defaultLang;
      }
    } catch {}
    renderDefaultLang();
    applyI18n();
  }
  function renderDefaultLang() {
    document.querySelectorAll('#defaultLangChoose button').forEach((b) =>
      b.classList.toggle('active', b.dataset.dl === siteDefaultLang)
    );
  }
  document.querySelectorAll('#defaultLangChoose button').forEach((b) =>
    b.addEventListener('click', async () => {
      const dl = b.dataset.dl;
      try {
        const res = await api('/api/admin/settings', { method: 'PUT', body: { defaultLang: dl } });
        if (res.ok) {
          siteDefaultLang = dl;
          window.SITE_DEFAULT_LANG = dl;
          renderDefaultLang();
          const st = $('#settingsStatus');
          st.textContent = t('set_saved');
          setTimeout(() => { if (st.textContent === t('set_saved')) st.textContent = ''; }, 2500);
        }
      } catch {}
    })
  );

  // ---- Rooms ----
  async function loadRooms() {
    try {
      const res = await api('/api/admin/rooms');
      rooms = await res.json();
      renderRooms();
    } catch {}
  }

  function renderRooms() {
    const list = $('#roomsList');
    if (!list) return;
    if (!rooms.length) {
      list.innerHTML = `<p class="muted empty">${t('rooms_empty')}</p>`;
      return;
    }
    list.innerHTML = rooms
      .map((r) => {
        const cover = r.images && r.images.length ? r.images[r.cover || 0] : null;
        const thumb = cover ? `<img src="${cover}" alt="" />` : '🌿';
        const imgCount = (r.images || []).length;
        return `
        <div class="admin-room">
          <div class="thumb">${thumb}</div>
          <div class="info">
            <h3>${esc(localizedName(r.name))}
              <span class="tag ${r.active ? 'on' : 'off'}">${r.active ? t('tag_public') : t('tag_hidden')}</span>
            </h3>
            <div class="sub">${money(r.price)} ${t('per_night')} · ${t('max_guests', { n: r.capacity })} · ${t('photos_count', { n: imgCount })}</div>
          </div>
          <div class="actions">
            <button class="btn btn-outline btn-sm" data-edit="${r.id}">${t('edit')}</button>
            <button class="icon-btn danger" data-del="${r.id}" title="${t('del')}">🗑</button>
          </div>
        </div>`;
      })
      .join('');

    list.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => openRoomEditor(b.dataset.edit))
    );
    list.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => deleteRoom(b.dataset.del))
    );
  }

  async function deleteRoom(id) {
    const r = rooms.find((x) => x.id === id);
    if (!confirm(t('room_delete_confirm', { name: r ? localizedName(r.name) : '' }))) return;
    await api('/api/admin/rooms/' + id, { method: 'DELETE' });
    loadRooms();
  }

  $('#addRoomBtn').addEventListener('click', () => openRoomEditor(null));

  function openRoomEditor(id) {
    editing = id ? rooms.find((r) => r.id === id) : null;
    const f = $('#roomForm');
    f.reset();
    $('#roomError').textContent = '';
    $('#roomModalTitle').textContent = editing ? t('modal_edit_title') : t('modal_new_title');

    if (editing) {
      f.name_mn.value = editing.name.mn || '';
      f.name_ko.value = editing.name.ko || '';
      f.name_en.value = editing.name.en || '';
      f.desc_mn.value = editing.desc.mn || '';
      f.desc_ko.value = editing.desc.ko || '';
      f.desc_en.value = editing.desc.en || '';
      f.price.value = editing.price;
      f.capacity.value = editing.capacity;
      f.active.checked = !!editing.active;
      $('#photosSection').hidden = false; // photos editable for existing rooms
      renderPhotos();
    } else {
      f.capacity.value = 2;
      f.active.checked = true;
      // A new room must be saved first (needs an id) before photos can be uploaded.
      $('#photosSection').hidden = true;
    }
    setLangPane('mn');
    $('#roomModal').hidden = false;
  }

  function setLangPane(l) {
    document.querySelectorAll('.ltab').forEach((t) => t.classList.toggle('active', t.dataset.l === l));
    document.querySelectorAll('.lang-pane').forEach((p) => (p.hidden = p.dataset.lp !== l));
  }
  document.querySelectorAll('.ltab').forEach((tab) =>
    tab.addEventListener('click', () => setLangPane(tab.dataset.l))
  );

  function closeRoomModal() { $('#roomModal').hidden = true; }
  $('#roomCancel').addEventListener('click', closeRoomModal);

  $('#roomForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const payload = {
      name: { mn: f.name_mn.value.trim(), ko: f.name_ko.value.trim(), en: f.name_en.value.trim() },
      desc: { mn: f.desc_mn.value.trim(), ko: f.desc_ko.value.trim(), en: f.desc_en.value.trim() },
      price: Number(f.price.value) || 0,
      capacity: Number(f.capacity.value) || 1,
      active: f.active.checked,
    };
    if (!payload.name.mn && !payload.name.ko && !payload.name.en) {
      $('#roomError').textContent = t('err_need_name');
      return;
    }
    try {
      if (editing) {
        await api('/api/admin/rooms/' + editing.id, { method: 'PUT', body: payload });
      } else {
        await api('/api/admin/rooms', { method: 'POST', body: payload });
      }
      await loadRooms();
      closeRoomModal(); // save & close
    } catch {
      $('#roomError').textContent = t('err_save');
    }
  });

  function flash(msg) {
    const s = $('#uploadStatus');
    s.textContent = msg;
    setTimeout(() => { if (s.textContent === msg) s.textContent = ''; }, 2500);
  }

  // ---- Room photos (live edit for existing rooms) ----
  function renderPhotos() {
    if (!editing) return;
    const grid = $('#photoGrid');
    const imgs = editing.images || [];
    grid.innerHTML = imgs
      .map(
        (url, i) => `
      <div class="photo-item ${i === (editing.cover || 0) ? 'cover' : ''}" data-cover="${i}">
        ${i === (editing.cover || 0) ? `<span class="cover-flag">${t('cover_flag')}</span>` : ''}
        <img src="${url}" alt="" />
        <button type="button" class="del" data-delimg="${esc(url)}">✕</button>
      </div>`
      )
      .join('');

    grid.querySelectorAll('[data-cover]').forEach((el) =>
      el.addEventListener('click', async (ev) => {
        if (ev.target.classList.contains('del')) return;
        const idx = Number(el.dataset.cover);
        await api('/api/admin/rooms/' + editing.id, { method: 'PUT', body: { cover: idx } });
        editing.cover = idx;
        renderPhotos();
        loadRooms();
      })
    );
    grid.querySelectorAll('[data-delimg]').forEach((b) =>
      b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const res = await api('/api/admin/rooms/' + editing.id + '/images', {
          method: 'DELETE',
          body: { url: b.dataset.delimg },
        });
        editing = await res.json();
        renderPhotos();
        loadRooms();
      })
    );
  }

  $('#photoInput').addEventListener('change', async (e) => {
    if (!editing || !e.target.files.length) return;
    const fd = new FormData();
    for (const file of e.target.files) fd.append('images', file);
    flash(t('uploading'));
    try {
      const res = await api('/api/admin/rooms/' + editing.id + '/images', { method: 'POST', body: fd });
      editing = await res.json();
      renderPhotos();
      loadRooms();
      flash(t('uploaded'));
    } catch {
      flash(t('upload_failed'));
    }
    e.target.value = '';
  });

  // ---- Site gallery (hero / about slideshows) ----
  let gallery = { hero: [], about: [] };

  async function loadGallery() {
    try {
      const res = await api('/api/gallery');
      gallery = await res.json();
    } catch {
      return;
    }
    renderGallerySection('hero', 'heroGrid', 'heroStatus');
    renderGallerySection('about', 'aboutGrid', 'aboutStatus');
  }

  function renderGallerySection(section, gridId, statusId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const imgs = gallery[section] || [];
    if (!imgs.length) {
      grid.innerHTML = `<p class="muted" style="grid-column:1/-1;">${t('gallery_empty')}</p>`;
      return;
    }
    grid.innerHTML = imgs
      .map(
        (url) => `
      <div class="photo-item">
        <img src="${url}" alt="" />
        <button type="button" class="del" data-del="${esc(url)}">✕</button>
      </div>`
      )
      .join('');
    grid.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        const res = await api('/api/admin/gallery/' + section + '/images', {
          method: 'DELETE',
          body: { url: b.dataset.del },
        });
        gallery = await res.json();
        renderGallerySection(section, gridId, statusId);
      })
    );
  }

  function setupGalleryUpload(inputId, section, gridId, statusId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('change', async (e) => {
      if (!e.target.files.length) return;
      const fd = new FormData();
      for (const file of e.target.files) fd.append('images', file);
      const status = document.getElementById(statusId);
      status.textContent = t('uploading');
      try {
        const res = await api('/api/admin/gallery/' + section + '/images', { method: 'POST', body: fd });
        gallery = await res.json();
        renderGallerySection(section, gridId, statusId);
        status.textContent = t('uploaded');
        setTimeout(() => (status.textContent = ''), 2500);
      } catch {
        status.textContent = t('upload_failed');
      }
      e.target.value = '';
    });
  }
  setupGalleryUpload('heroInput', 'hero', 'heroGrid', 'heroStatus');
  setupGalleryUpload('aboutInput', 'about', 'aboutGrid', 'aboutStatus');

  // ---- Bookings ----
  async function loadBookings() {
    try {
      const res = await api('/api/admin/bookings');
      bookings = await res.json();
      renderBookings();
    } catch {}
  }

  const statusLabel = (s) => t('st_' + s);

  function roomNameById(id) {
    const r = rooms.find((x) => x.id === id);
    if (!r) return t('room_deleted');
    return localizedName(r.name);
  }

  function renderBookings() {
    const body = $('#bookingsBody');
    if (!body) return;
    const pending = bookings.filter((b) => b.status === 'pending').length;
    const badge = $('#pendingBadge');
    badge.hidden = pending === 0;
    badge.textContent = pending;

    const list =
      bookingFilter === 'all' ? bookings : bookings.filter((b) => b.status === bookingFilter);
    $('#noBookings').hidden = list.length !== 0;

    body.innerHTML = list
      .map(
        (b) => `
      <tr>
        <td><span class="status-pill status-${b.status}">${statusLabel(b.status)}</span></td>
        <td>${esc(roomNameById(b.roomId))}</td>
        <td>${esc(b.name)}${b.country ? '<br><small style="color:var(--muted)">🌍 ' + esc(b.country) + '</small>' : ''}</td>
        <td>${esc(b.phone)}${b.email ? '<br><small>' + esc(b.email) + '</small>' : ''}</td>
        <td>${b.checkIn}</td>
        <td>${b.checkOut}</td>
        <td>${b.guests}</td>
        <td class="msg">${esc(b.message)}</td>
        <td>
          <div class="row-actions">
            ${b.status !== 'confirmed' ? `<button class="icon-btn ok" data-confirm="${b.id}">${t('act_confirm')}</button>` : ''}
            ${b.status !== 'rejected' ? `<button class="icon-btn warn" data-reject="${b.id}">${t('act_reject')}</button>` : ''}
            ${b.status !== 'cancelled' ? `<button class="icon-btn" data-cancel="${b.id}">${t('act_cancel')}</button>` : ''}
            <button class="icon-btn danger" data-delbk="${b.id}" title="${t('del')}">🗑</button>
          </div>
        </td>
      </tr>`
      )
      .join('');

    body.querySelectorAll('[data-confirm]').forEach((b) =>
      b.addEventListener('click', () => setStatus(b.dataset.confirm, 'confirmed'))
    );
    body.querySelectorAll('[data-reject]').forEach((b) =>
      b.addEventListener('click', () => setStatus(b.dataset.reject, 'rejected'))
    );
    body.querySelectorAll('[data-cancel]').forEach((b) =>
      b.addEventListener('click', () => setStatus(b.dataset.cancel, 'cancelled'))
    );
    body.querySelectorAll('[data-delbk]').forEach((b) =>
      b.addEventListener('click', () => deleteBooking(b.dataset.delbk))
    );
  }

  async function setStatus(id, status) {
    await api('/api/admin/bookings/' + id, { method: 'PATCH', body: { status } });
    loadBookings();
  }
  async function deleteBooking(id) {
    if (!confirm(t('booking_delete_confirm'))) return;
    await api('/api/admin/bookings/' + id, { method: 'DELETE' });
    loadBookings();
  }

  document.querySelectorAll('#statusFilter .chip').forEach((c) =>
    c.addEventListener('click', () => {
      document.querySelectorAll('#statusFilter .chip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      bookingFilter = c.dataset.f;
      renderBookings();
    })
  );

  // ---- Init ----
  applyI18n();
  loadSiteSettings();
  if (token) showDash();
  else showLogin();
})();
