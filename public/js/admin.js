// Admin dashboard: login, room CRUD + photo upload, booking management.
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
        $('#loginError').textContent = '비밀번호가 올바르지 않습니다.';
      }
    } catch {
      $('#loginError').textContent = '오류가 발생했습니다.';
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try { await api('/api/admin/logout', { method: 'POST' }); } catch {}
    logout();
  });

  // ---- Tabs ----
  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      const tab = t.dataset.tab;
      $('#tab-rooms').hidden = tab !== 'rooms';
      $('#tab-gallery').hidden = tab !== 'gallery';
      $('#tab-bookings').hidden = tab !== 'bookings';
      if (tab === 'gallery') loadGallery();
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
    if (!rooms.length) {
      list.innerHTML = '<p class="muted empty">객실이 없습니다. "객실 추가"를 눌러 시작하세요.</p>';
      return;
    }
    list.innerHTML = rooms
      .map((r) => {
        const cover = r.images && r.images.length ? r.images[r.cover || 0] : null;
        const thumb = cover ? `<img src="${cover}" alt="" />` : '🌿';
        const name = r.name.ko || r.name.mn || r.name.en || '(이름 없음)';
        return `
        <div class="admin-room">
          <div class="thumb">${thumb}</div>
          <div class="info">
            <h3>${esc(name)}
              <span class="tag ${r.active ? 'on' : 'off'}">${r.active ? '공개' : '숨김'}</span>
            </h3>
            <div class="sub">${money(r.price)} / 박 · 최대 ${r.capacity}인 · 사진 ${
          (r.images || []).length
        }장</div>
          </div>
          <div class="actions">
            <button class="btn btn-outline btn-sm" data-edit="${r.id}">편집</button>
            <button class="icon-btn danger" data-del="${r.id}">🗑</button>
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
    if (!confirm(`"${(r && (r.name.ko || r.name.en)) || '객실'}" 을(를) 삭제할까요? 사진도 함께 삭제됩니다.`)) return;
    await api('/api/admin/rooms/' + id, { method: 'DELETE' });
    loadRooms();
  }

  $('#addRoomBtn').addEventListener('click', () => openRoomEditor(null));

  function openRoomEditor(id) {
    editing = id ? rooms.find((r) => r.id === id) : null;
    const f = $('#roomForm');
    f.reset();
    $('#roomError').textContent = '';
    $('#roomModalTitle').textContent = editing ? '객실 편집' : '새 객실 추가';

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
      $('#photosSection').hidden = false;
      renderPhotos();
    } else {
      f.capacity.value = 2;
      f.active.checked = true;
      // photos only available after the room exists (needs an id to upload to)
      $('#photosSection').hidden = true;
    }
    setLangPane('mn');
    $('#roomModal').hidden = false;
  }

  function setLangPane(l) {
    document.querySelectorAll('.ltab').forEach((t) => t.classList.toggle('active', t.dataset.l === l));
    document.querySelectorAll('.lang-pane').forEach((p) => (p.hidden = p.dataset.lp !== l));
  }
  document.querySelectorAll('.ltab').forEach((t) =>
    t.addEventListener('click', () => setLangPane(t.dataset.l))
  );

  $('#roomCancel').addEventListener('click', () => ($('#roomModal').hidden = true));

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
      $('#roomError').textContent = '이름을 하나 이상 입력하세요.';
      return;
    }
    try {
      if (editing) {
        await api('/api/admin/rooms/' + editing.id, { method: 'PUT', body: payload });
      } else {
        const res = await api('/api/admin/rooms', { method: 'POST', body: payload });
        editing = await res.json(); // now has an id -> allow photo upload
      }
      await loadRooms();
      editing = rooms.find((r) => r.id === (editing && editing.id));
      if (editing) {
        // keep modal open so user can add photos to a freshly created room
        $('#photosSection').hidden = false;
        renderPhotos();
        $('#roomError').textContent = '';
        flash('저장되었습니다. 사진을 추가할 수 있습니다.');
      } else {
        $('#roomModal').hidden = true;
      }
    } catch {
      $('#roomError').textContent = '저장 중 오류가 발생했습니다.';
    }
  });

  function flash(msg) {
    const s = $('#uploadStatus');
    s.textContent = msg;
    setTimeout(() => { if (s.textContent === msg) s.textContent = ''; }, 2500);
  }

  // ---- Photos ----
  function renderPhotos() {
    if (!editing) return;
    const grid = $('#photoGrid');
    const imgs = editing.images || [];
    grid.innerHTML = imgs
      .map(
        (url, i) => `
      <div class="photo-item ${i === (editing.cover || 0) ? 'cover' : ''}" data-cover="${i}">
        ${i === (editing.cover || 0) ? '<span class="cover-flag">대표</span>' : ''}
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
        const url = b.dataset.delimg;
        const res = await api('/api/admin/rooms/' + editing.id + '/images', {
          method: 'DELETE',
          body: { url },
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
    flash('업로드 중…');
    try {
      const res = await api('/api/admin/rooms/' + editing.id + '/images', {
        method: 'POST',
        body: fd,
      });
      editing = await res.json();
      renderPhotos();
      loadRooms();
      flash('사진이 추가되었습니다.');
    } catch {
      flash('업로드 실패');
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
      grid.innerHTML = '<p class="muted" style="grid-column:1/-1;">아직 사진이 없습니다.</p>';
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
      status.textContent = '업로드 중…';
      try {
        const res = await api('/api/admin/gallery/' + section + '/images', {
          method: 'POST',
          body: fd,
        });
        gallery = await res.json();
        renderGallerySection(section, gridId, statusId);
        status.textContent = '추가되었습니다.';
        setTimeout(() => (status.textContent = ''), 2500);
      } catch {
        status.textContent = '업로드 실패';
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

  const STATUS_LABEL = { pending: '대기', confirmed: '확정', rejected: '불가', cancelled: '취소' };

  function roomNameById(id) {
    const r = rooms.find((x) => x.id === id);
    if (!r) return '(삭제된 객실)';
    return r.name.ko || r.name.mn || r.name.en || '(이름 없음)';
  }

  function renderBookings() {
    const pending = bookings.filter((b) => b.status === 'pending').length;
    const badge = $('#pendingBadge');
    badge.hidden = pending === 0;
    badge.textContent = pending;

    const body = $('#bookingsBody');
    const list =
      bookingFilter === 'all' ? bookings : bookings.filter((b) => b.status === bookingFilter);
    $('#noBookings').hidden = list.length !== 0;

    body.innerHTML = list
      .map(
        (b) => `
      <tr>
        <td><span class="status-pill status-${b.status}">${STATUS_LABEL[b.status]}</span></td>
        <td>${esc(roomNameById(b.roomId))}</td>
        <td>${esc(b.name)}</td>
        <td>${esc(b.phone)}${b.email ? '<br><small>' + esc(b.email) + '</small>' : ''}</td>
        <td>${b.checkIn}</td>
        <td>${b.checkOut}</td>
        <td>${b.guests}</td>
        <td class="msg">${esc(b.message)}</td>
        <td>
          <div class="row-actions">
            ${b.status !== 'confirmed' ? `<button class="icon-btn ok" data-confirm="${b.id}" title="확정">✔ 확정</button>` : ''}
            ${b.status !== 'rejected' ? `<button class="icon-btn warn" data-reject="${b.id}" title="불가(거절)">⊘ 불가</button>` : ''}
            ${b.status !== 'cancelled' ? `<button class="icon-btn" data-cancel="${b.id}" title="취소">✖ 취소</button>` : ''}
            <button class="icon-btn danger" data-delbk="${b.id}" title="삭제">🗑</button>
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
    if (!confirm('이 예약을 삭제할까요?')) return;
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
  if (token) showDash();
  else showLogin();
})();
