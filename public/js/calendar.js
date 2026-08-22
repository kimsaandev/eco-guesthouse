// Dependency-free date-range picker that disables past and already-booked nights.
// A booking blocks the nights [checkIn, checkOut); the checkout day itself stays
// available as a new arrival/checkout day (standard hotel behavior).
(function () {
  const MONTH_LABEL = {
    ko: (y, m) => `${y}년 ${m + 1}월`,
    en: (y, m) =>
      `${['January','February','March','April','May','June','July','August','September','October','November','December'][m]} ${y}`,
    mn: (y, m) => `${y} оны ${m + 1}-р сар`,
  };
  const WEEKDAYS = {
    ko: ['일', '월', '화', '수', '목', '금', '토'],
    en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    mn: ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'],
  };

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }

  window.createCalendar = function (mount, opts) {
    opts = opts || {};
    const state = { view: new Date(), blocked: new Set(), checkIn: null, checkOut: null };
    state.view.setDate(1);
    const today = ymd(new Date());

    const lang = () => (window.getLang ? getLang() : 'en');
    const L = (obj) => obj[lang()] || obj.en;

    const isPast = (s) => s < today;
    const isBooked = (s) => state.blocked.has(s);

    function rangeHasBooked(ci, co) {
      let d = ci;
      while (d < co) { if (state.blocked.has(d)) return true; d = addDays(d, 1); }
      return false;
    }
    function rangeValid(ci, co) {
      if (!ci || !co) return true;
      return ci < co && !isPast(ci) && !rangeHasBooked(ci, co);
    }

    function setBlocked(ranges) {
      state.blocked = new Set();
      (ranges || []).forEach((r) => {
        let d = r.checkIn;
        while (d < r.checkOut) { state.blocked.add(d); d = addDays(d, 1); }
      });
      if (!rangeValid(state.checkIn, state.checkOut)) {
        state.checkIn = state.checkOut = null;
        emit();
      }
      render();
    }

    function emit() { if (opts.onChange) opts.onChange(state.checkIn, state.checkOut); }

    function pick(s) {
      if (isPast(s)) return;
      const choosingEnd = state.checkIn && !state.checkOut && s > state.checkIn;
      if (choosingEnd) {
        if (!rangeHasBooked(state.checkIn, s)) {
          state.checkOut = s; emit(); render(); return;
        }
        // range would cross a booked night -> restart at s (if it's a free night)
      }
      if (!isBooked(s)) { state.checkIn = s; state.checkOut = null; emit(); render(); }
    }

    function clickable(s) {
      if (isPast(s)) return false;
      if (!isBooked(s)) return true; // free night: can always start here
      // booked night: only valid as a checkout day (nights before it are free)
      return state.checkIn && !state.checkOut && s > state.checkIn && !rangeHasBooked(state.checkIn, s);
    }

    function render() {
      const y = state.view.getFullYear();
      const m = state.view.getMonth();
      const first = new Date(y, m, 1);
      const startPad = first.getDay();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const wd = WEEKDAYS[lang()] || WEEKDAYS.en;

      // Can we go to previous month? Only if it isn't fully in the past.
      const thisMonthStart = new Date();
      thisMonthStart.setDate(1);
      const atCurrentMonth = y === thisMonthStart.getFullYear() && m === thisMonthStart.getMonth();

      let html = `
        <div class="cal-head">
          <button type="button" class="cal-nav" data-nav="-1" ${atCurrentMonth ? 'disabled' : ''}>‹</button>
          <span class="cal-title">${L(MONTH_LABEL)(y, m)}</span>
          <button type="button" class="cal-nav" data-nav="1">›</button>
        </div>
        <div class="cal-grid cal-weekdays">${wd.map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="cal-grid cal-days">`;

      for (let i = 0; i < startPad; i++) html += '<span class="cal-empty"></span>';
      for (let day = 1; day <= daysInMonth; day++) {
        const s = `${y}-${pad(m + 1)}-${pad(day)}`;
        const cls = ['cal-day'];
        if (isPast(s)) cls.push('disabled');
        else {
          if (isBooked(s)) cls.push('booked');
          if (!clickable(s)) cls.push('disabled');
        }
        if (s === state.checkIn) cls.push('start');
        if (s === state.checkOut) cls.push('end');
        if (state.checkIn && state.checkOut && s > state.checkIn && s < state.checkOut) cls.push('inrange');
        html += `<button type="button" class="${cls.join(' ')}" data-d="${s}">${day}</button>`;
      }
      html += '</div>';
      mount.innerHTML = html;

      mount.querySelectorAll('[data-nav]').forEach((b) =>
        b.addEventListener('click', () => {
          state.view.setMonth(state.view.getMonth() + Number(b.dataset.nav));
          render();
        })
      );
      mount.querySelectorAll('.cal-day').forEach((b) => {
        if (b.classList.contains('disabled')) return;
        b.addEventListener('click', () => pick(b.dataset.d));
      });
    }

    render();
    return {
      setBlocked,
      select: pick, // programmatic selection (also used by cell clicks)
      refresh: render,
      reset() { state.checkIn = state.checkOut = null; emit(); render(); },
      getRange() { return { checkIn: state.checkIn, checkOut: state.checkOut }; },
    };
  };
})();
