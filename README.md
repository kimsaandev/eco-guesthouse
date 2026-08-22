# ECO Guest house and Cafe — 예약 사이트

작은 게스트하우스(방 5개)용 **결제 없는** 예약 사이트입니다.
손님은 객실을 보고 예약을 요청하고, 주인은 관리자 페이지에서 객실(사진·내용·가격)과 예약을 관리합니다.

- 몽골어 / 한국어 / 영어 3개국어 지원 (우측 상단 언어 전환)
- 결제 없음 — 예약은 서버에 저장되고 주인이 확인 후 직접 연락
- 객실별 중복 날짜 예약 자동 차단

## 실행 방법

```bash
npm install      # 최초 1회 (express, multer 설치)
npm start        # 또는 node server.js
```

실행 후 브라우저에서:

- 손님 사이트 : http://localhost:3000/
- 관리자 페이지 : http://localhost:3000/admin.html

### 관리자 비밀번호

기본값은 `eco2024` 입니다. **반드시 변경하세요.**

- 방법 1: 실행 시 지정 — `ADMIN_PASSWORD=원하는비번 node server.js`
- 방법 2: `server.js` 상단의 `ADMIN_PASSWORD` 값 수정

포트 변경: `PORT=8080 node server.js`

## 관리자에서 할 수 있는 것

**객실 관리 탭**
- 객실 추가 / 편집 / 삭제
- 사진 여러 장 업로드, 대표사진 지정, 개별 삭제
- 이름·설명(몽/한/영), 가격(₮), 최대 인원, 사이트 공개 여부 편집
- (새 객실은 먼저 "저장"한 뒤 사진을 추가할 수 있습니다)

**예약 관리 탭**
- 예약 목록(체크인 날짜순), 상태별 필터(대기/확정/취소)
- 대기 → 확정 / 취소 처리, 삭제
- 새 대기 예약 수를 탭에 빨간 배지로 표시

## 데이터 저장 위치

- 예약: `data/bookings.json`
- 객실: `data/rooms.json` (첫 실행 시 예시 객실 5개 자동 생성)
- 사진: `public/uploads/`

이 파일들은 서버가 자동으로 만들고 관리합니다. 백업하려면 위 폴더를 복사하세요.

## 구조

```
server.js            Express 서버 (API + 정적 파일)
data/                예약·객실 JSON 저장소
public/
  index.html         손님용 예약 사이트
  admin.html         주인용 관리 페이지
  css/style.css      공통 스타일
  css/admin.css      관리자 스타일
  js/i18n.js         3개국어 번역
  js/app.js          손님 페이지 로직
  js/admin.js        관리자 로직
```

## 이메일 알림

예약 이벤트마다 **예약자와 관리자 양쪽**에 자동 메일이 발송됩니다:

- **예약 신청** → 예약자(접수 안내) + 관리자(신규 신청 알림)
- **확정 / 불가(거절) / 취소** → 예약자(상태 안내) + 관리자(사본)

예약자 메일은 손님이 사이트에서 고른 언어(몽/한/영)로 발송됩니다.

메일 발송에는 SMTP 설정이 필요합니다(환경변수). 설정 방법은 [DEPLOY-RAILWAY.md](./DEPLOY-RAILWAY.md)의 Gmail 앱 비밀번호 안내를 참고하세요.
**SMTP를 설정하지 않으면 메일만 발송되지 않을 뿐, 사이트·예약 기능은 정상 동작합니다.**

로컬에서 메일까지 테스트하려면:

```bash
SMTP_USER=본인지메일@gmail.com SMTP_PASS=앱비밀번호 ADMIN_EMAIL=받을주소@gmail.com npm start
```

## 인터넷에 공개 (배포)

이 앱은 Node 서버 + 파일 저장이라 **Netlify 같은 정적 호스팅에서는 작동하지 않습니다.**
Railway에 배포하는 방법은 **[DEPLOY-RAILWAY.md](./DEPLOY-RAILWAY.md)** 를 참고하세요.
(핵심: 볼륨을 `/data`에 연결하고 `DATA_DIR`, `UPLOAD_DIR`, `ADMIN_PASSWORD` 환경변수를 설정)

## 참고

- 지도/연락처 등 실제 정보는 `public/index.html` 하단 Contact 섹션에서 수정하세요.
- 데이터/업로드 경로는 환경변수 `DATA_DIR`, `UPLOAD_DIR` 로 바꿀 수 있습니다 (배포 시 볼륨 연결용).
