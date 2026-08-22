# Railway 배포 가이드

이 앱은 **Node 서버 + 파일 저장(예약·객실·사진)** 이라 Netlify(정적 호스팅)에서는 안 됩니다.
Railway는 Node를 그대로 실행하고, **볼륨(Volume)** 으로 데이터를 영구 저장할 수 있어 적합합니다.

> ⚠️ 볼륨을 연결하지 않으면 재배포·재시작 때마다 **예약과 업로드한 사진이 모두 사라집니다.** 반드시 아래 3~4단계를 하세요.

---

## 준비: 코드를 GitHub에 올리기 (권장)

Railway는 GitHub 저장소에서 자동 배포하는 게 가장 쉽습니다.

```bash
cd mongol_booking
git init
git add .
git commit -m "ECO guesthouse booking site"
# GitHub에서 빈 저장소 만든 뒤:
git remote add origin https://github.com/<본인아이디>/eco-guesthouse.git
git branch -M main
git push -u origin main
```

> `node_modules`, `data/*.json`, `public/uploads/*` 는 `.gitignore`로 제외됩니다 (정상입니다 — 런타임에 볼륨에서 생성됨).

---

## 1. 프로젝트 생성

1. https://railway.app 로그인 → **New Project**
2. **Deploy from GitHub repo** → 방금 올린 저장소 선택
3. Railway가 자동으로 `npm install` → `npm start` 실행 (`railway.json`, `package.json` 참고)

---

## 2. 도메인 생성

- 서비스 → **Settings → Networking → Generate Domain**
- `https://xxxx.up.railway.app` 주소가 생깁니다. 이게 사이트 주소예요.

---

## 3. 볼륨(영구 저장소) 추가 ★필수★

- 서비스 → **Variables/Settings 옆의 Volume** (또는 우클릭 → New Volume)
- **Mount path** 를 `/data` 로 지정하고 생성

---

## 4. 환경변수 설정 ★필수★

서비스 → **Variables** 에서 아래 3개를 추가:

| 변수명 | 값 | 설명 |
|--------|-----|------|
| `DATA_DIR` | `/data/store` | 예약·객실·갤러리 JSON 저장 위치 (볼륨 안) |
| `UPLOAD_DIR` | `/data/uploads` | 업로드한 사진 저장 위치 (볼륨 안) |
| `ADMIN_PASSWORD` | `원하는_강력한_비밀번호` | 관리자 로그인 비번 (기본 eco2024 대신 꼭 변경) |
| `SMTP_USER` | `본인지메일@gmail.com` | 메일 발송 계정 (Gmail) |
| `SMTP_PASS` | `앱비밀번호16자리` | Gmail **앱 비밀번호** (일반 비번 아님, 아래 참고) |
| `ADMIN_EMAIL` | `wlstks7@gmail.com` | 예약 알림을 받을 주인 이메일 (미설정 시 기본값 사용) |

> `PORT` 는 **설정하지 마세요.** Railway가 자동으로 넣어주고, 서버가 자동으로 사용합니다.
> `SMTP_USER`/`SMTP_PASS` 를 설정하지 않으면 메일은 그냥 발송되지 않을 뿐, 사이트·예약은 정상 동작합니다.

### Gmail 앱 비밀번호 만들기 (메일 발송용)

Gmail은 보안상 일반 비밀번호로 외부 발송을 막습니다. **앱 비밀번호**가 필요합니다:

1. Google 계정 → **보안** → **2단계 인증**을 먼저 켭니다 (필수).
2. https://myaccount.google.com/apppasswords 접속
3. 앱 이름을 아무거나(예: `ECO booking`) 입력 → **만들기**
4. 나오는 **16자리 코드**를 `SMTP_PASS` 값으로 넣습니다 (띄어쓰기는 빼고 붙여 써도 됩니다).
5. `SMTP_USER` 에는 그 Gmail 주소를 넣습니다.

> 다른 메일 서버를 쓰려면 `SMTP_HOST`, `SMTP_PORT` 도 설정할 수 있습니다 (기본값 `smtp.gmail.com` / `465`).

변수를 저장하면 Railway가 자동으로 재배포합니다.

---

## 5. 확인

- `https://xxxx.up.railway.app/` → 손님 예약 사이트
- `https://xxxx.up.railway.app/admin` → 관리자 (설정한 `ADMIN_PASSWORD`로 로그인)
- 관리자에서 **사이트 사진 / 객실 사진**을 올리고, 손님 페이지에서 슬라이드가 뜨는지 확인
- 재배포해도 데이터가 유지되면 볼륨이 정상 연결된 것입니다

---

## 대안: Railway CLI로 배포 (GitHub 없이)

```bash
npm i -g @railway/cli
railway login
cd mongol_booking
railway init          # 새 프로젝트 생성
railway up            # 현재 폴더 배포
```

그 뒤 대시보드에서 위 2~4단계(도메인·볼륨·환경변수)를 동일하게 설정하세요.

---

## 요약 체크리스트

- [ ] GitHub에 push (또는 `railway up`)
- [ ] 도메인 생성
- [ ] 볼륨 생성 (mount path `/data`)
- [ ] 환경변수 `DATA_DIR=/data/store`, `UPLOAD_DIR=/data/uploads`, `ADMIN_PASSWORD=...`
- [ ] 메일용 `SMTP_USER`, `SMTP_PASS`(Gmail 앱 비밀번호), `ADMIN_EMAIL` 설정
- [ ] 사이트/관리자 접속 확인
- [ ] 테스트 예약 넣고 예약자·관리자 메일 수신 확인
