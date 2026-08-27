// Email notifications for booking events, via nodemailer (SMTP).
// If SMTP is not configured, emails are skipped gracefully (the app still works).
const nodemailer = require('nodemailer');

// Trim env vars — a stray leading/trailing space (common copy-paste mistake)
// in SMTP_HOST would otherwise break DNS resolution and silently kill email.
const env = (k, dflt) => {
  const v = process.env[k];
  return (v == null ? dflt : String(v).trim()) || dflt;
};
const SMTP_HOST = env('SMTP_HOST', 'smtp.gmail.com');
const SMTP_PORT = env('SMTP_PORT', '465');
const SMTP_USER = env('SMTP_USER', '');
// Strip ALL whitespace from the password: Gmail app passwords are shown as
// "abcd efgh ijkl mnop" but must be used with no spaces.
const SMTP_PASS = process.env.SMTP_PASS ? String(process.env.SMTP_PASS).replace(/\s+/g, '') : '';
const MAIL_FROM = env('MAIL_FROM', '');
const ADMIN_EMAIL = env('ADMIN_EMAIL', 'wlstks7@gmail.com');

let transporter = null;
if (SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465, // 465 = SSL, 587 = STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  console.log(`[mail] SMTP enabled (${SMTP_HOST}:${SMTP_PORT}) — admin: ${ADMIN_EMAIL}`);
} else {
  console.log('[mail] SMTP not configured (SMTP_USER/SMTP_PASS missing) — email notifications disabled');
}

const FROM = MAIL_FROM || `ECO Guest house <${SMTP_USER || 'no-reply@ecoguesthouse'}>`;

// Pick a room name in the guest's language, with fallbacks.
function pickName(nameObj, lang) {
  if (!nameObj) return '';
  return nameObj[lang] || nameObj.en || nameObj.ko || nameObj.mn || '';
}

// Guest-facing copy in 3 languages, keyed by event.
const GUEST = {
  mn: {
    created: {
      subject: 'Таны захиалгын хүсэлт хүлээн авлаа — ECO Guest house',
      heading: 'Захиалгын хүсэлт хүлээн авлаа',
      intro: 'Баярлалаа! Таны захиалгын хүсэлтийг хүлээн авлаа. Бид удахгүй баталгаажуулж холбогдоно.',
    },
    confirmed: {
      subject: 'Таны захиалга баталгаажлаа — ECO Guest house',
      heading: 'Захиалга баталгаажлаа ✅',
      intro: 'Таны захиалга баталгаажлаа. Тантай уулзахыг тэсэн ядан хүлээж байна!',
    },
    rejected: {
      subject: 'Таны захиалгын талаар — ECO Guest house',
      heading: 'Захиалга боломжгүй байна',
      intro: 'Уучлаарай, сонгосон өдрүүдэд захиалга авах боломжгүй байна. Өөр огноогоор дахин оролдоно уу.',
    },
    cancelled: {
      subject: 'Таны захиалга цуцлагдлаа — ECO Guest house',
      heading: 'Захиалга цуцлагдлаа',
      intro: 'Таны захиалга цуцлагдсан. Асуулт байвал бидэнтэй холбогдоно уу.',
    },
    labels: { room: 'Өрөө', checkin: 'Ирэх', checkout: 'Гарах', guests: 'Зочид', country: 'Улс', name: 'Нэр', phone: 'Утас' },
  },
  ko: {
    created: {
      subject: '예약 신청이 접수되었습니다 — ECO Guest house',
      heading: '예약 신청이 접수되었습니다',
      intro: '감사합니다! 예약 신청이 접수되었습니다. 확인 후 곧 연락드리겠습니다.',
    },
    confirmed: {
      subject: '예약이 확정되었습니다 — ECO Guest house',
      heading: '예약이 확정되었습니다 ✅',
      intro: '예약이 확정되었습니다. 방문을 기다리고 있겠습니다!',
    },
    rejected: {
      subject: '예약 안내 — ECO Guest house',
      heading: '예약이 불가합니다',
      intro: '죄송합니다. 선택하신 날짜에는 예약이 어렵습니다. 다른 날짜로 다시 시도해 주세요.',
    },
    cancelled: {
      subject: '예약이 취소되었습니다 — ECO Guest house',
      heading: '예약이 취소되었습니다',
      intro: '예약이 취소되었습니다. 문의사항이 있으면 연락 주세요.',
    },
    labels: { room: '객실', checkin: '체크인', checkout: '체크아웃', guests: '인원', country: '국가', name: '이름', phone: '연락처' },
  },
  en: {
    created: {
      subject: 'Your booking request was received — ECO Guest house',
      heading: 'Booking request received',
      intro: 'Thank you! We received your booking request and will confirm shortly.',
    },
    confirmed: {
      subject: 'Your booking is confirmed — ECO Guest house',
      heading: 'Booking confirmed ✅',
      intro: 'Your booking has been confirmed. We look forward to welcoming you!',
    },
    rejected: {
      subject: 'About your booking — ECO Guest house',
      heading: 'Booking not available',
      intro: 'Sorry, we are unable to take a booking for the selected dates. Please try different dates.',
    },
    cancelled: {
      subject: 'Your booking was cancelled — ECO Guest house',
      heading: 'Booking cancelled',
      intro: 'Your booking has been cancelled. Please contact us if you have any questions.',
    },
    labels: { room: 'Room', checkin: 'Check-in', checkout: 'Check-out', guests: 'Guests', country: 'Country', name: 'Name', phone: 'Phone' },
  },
};

const STATUS_KO = { pending: '대기', confirmed: '확정', rejected: '불가(거절)', cancelled: '취소' };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function detailsTable(labels, booking, roomName) {
  const rows = [
    [labels.room, roomName],
    [labels.checkin, booking.checkIn],
    [labels.checkout, booking.checkOut],
    [labels.guests, booking.guests],
    [labels.name, booking.name],
    [labels.phone, booking.phone],
  ];
  if (booking.country) rows.splice(4, 0, [labels.country || 'Country', booking.country]);
  return `<table style="border-collapse:collapse;margin:16px 0;font-size:15px;">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 14px 6px 0;color:#6b7a72;">${esc(k)}</td><td style="padding:6px 0;font-weight:600;color:#24302a;">${esc(v)}</td></tr>`
    )
    .join('')}</table>`;
}

function wrap(heading, bodyHtml) {
  return `
  <div style="font-family:Segoe UI,Apple SD Gothic Neo,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#24302a;">
    <div style="font-size:20px;font-weight:800;color:#234f3b;margin-bottom:4px;">🌿 ECO Guest house &amp; Cafe</div>
    <h2 style="color:#2f6b4f;font-size:18px;margin:18px 0 10px;">${esc(heading)}</h2>
    ${bodyHtml}
    <p style="color:#9aa79f;font-size:12px;margin-top:24px;border-top:1px solid #e2e0d8;padding-top:12px;">
      ECO Guest house and Cafe · 이 메일은 예약 시스템에서 자동 발송되었습니다.
    </p>
  </div>`;
}

async function send(to, subject, html, replyTo) {
  if (!transporter || !to) return;
  try {
    const msg = { from: FROM, to, subject, html };
    if (replyTo) msg.replyTo = replyTo; // so a reply reaches the right person
    await transporter.sendMail(msg);
    console.log(`[mail] sent "${subject}" -> ${to}`);
  } catch (err) {
    console.error(`[mail] FAILED "${subject}" -> ${to}:`, err.message);
  }
}

// Booking just created: notify guest (received) + admin (new request).
async function sendBookingCreated(booking, roomNameObj) {
  const lang = GUEST[booking.lang] ? booking.lang : 'en';
  const g = GUEST[lang];
  const guestRoom = pickName(roomNameObj, lang);
  const adminRoom = pickName(roomNameObj, 'ko');

  // Guest
  const guestBody = `<p style="font-size:15px;line-height:1.6;">${esc(g.created.intro)}</p>${detailsTable(
    g.labels,
    booking,
    guestRoom
  )}`;
  await send(booking.email, g.created.subject, wrap(g.created.heading, guestBody), ADMIN_EMAIL);

  // Admin (Korean)
  const adminBody = `
    <p style="font-size:15px;line-height:1.6;">새 예약 신청이 들어왔습니다. 관리자 페이지에서 확정/불가/취소를 처리하세요.</p>
    ${detailsTable(GUEST.ko.labels, booking, adminRoom)}
    ${booking.email ? `<p style="font-size:14px;color:#6b7a72;">예약자 이메일: ${esc(booking.email)}</p>` : ''}
    ${booking.message ? `<p style="font-size:14px;"><b>메모:</b> ${esc(booking.message)}</p>` : ''}`;
  await send(ADMIN_EMAIL, `[신규 예약 신청] ${adminRoom} · ${booking.checkIn}~${booking.checkOut} · ${booking.name}`, wrap('신규 예약 신청', adminBody), booking.email);
}

// Status changed: notify guest (localized) + admin (copy).
async function sendStatusUpdate(booking, roomNameObj, status) {
  if (!GUEST.en[status]) return; // only confirmed/rejected/cancelled have templates
  const lang = GUEST[booking.lang] ? booking.lang : 'en';
  const g = GUEST[lang];
  const guestRoom = pickName(roomNameObj, lang);
  const adminRoom = pickName(roomNameObj, 'ko');

  const guestBody = `<p style="font-size:15px;line-height:1.6;">${esc(g[status].intro)}</p>${detailsTable(
    g.labels,
    booking,
    guestRoom
  )}`;
  await send(booking.email, g[status].subject, wrap(g[status].heading, guestBody), ADMIN_EMAIL);

  // Admin copy (Korean)
  const adminBody = `
    <p style="font-size:15px;line-height:1.6;">예약 상태가 <b>${STATUS_KO[status] || status}</b>(으)로 변경되었습니다.</p>
    ${detailsTable(GUEST.ko.labels, booking, adminRoom)}`;
  await send(ADMIN_EMAIL, `[예약 ${STATUS_KO[status] || status}] ${adminRoom} · ${booking.checkIn}~${booking.checkOut} · ${booking.name}`, wrap(`예약 상태 변경: ${STATUS_KO[status] || status}`, adminBody), booking.email);
}

// Diagnostics: current mail config (no secrets) + a real test send.
function config() {
  return { enabled: !!transporter, host: SMTP_HOST, port: Number(SMTP_PORT), from: FROM, admin: ADMIN_EMAIL };
}
async function sendTest(to) {
  if (!transporter) {
    return { ok: false, error: 'SMTP not configured (set SMTP_USER / SMTP_PASS)' };
  }
  const target = to || ADMIN_EMAIL;
  try {
    await transporter.sendMail({
      from: FROM,
      to: target,
      subject: 'ECO Guest house — 메일 테스트 / Email test',
      html: wrap(
        '메일 테스트 / Email test',
        '<p style="font-size:15px;line-height:1.6;">이 메일이 보이면 예약 알림 이메일이 정상 작동합니다.<br>If you can read this, booking-notification emails are working.</p>'
      ),
    });
    return { ok: true, to: target };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { sendBookingCreated, sendStatusUpdate, mailEnabled: () => !!transporter, config, sendTest };
