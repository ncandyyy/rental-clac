# 렌탈 견적 계산기 (직원용)

장비를 고르면 세트가·할인을 계산하고, 견적서 이미지와 고객용 링크(카톡·톡톡 미리보기 포함)를 만들어 주는 내부용 페이지입니다.

## Netlify 배포

1. Netlify에서 이 GitHub 저장소를 연결합니다. 빌드 설정은 `netlify.toml`에 들어 있어 따로 입력할 것이 없습니다.
2. **Site configuration → Environment variables**에 `SITE_PASSWORD`(직원 공용 비밀번호)를 추가하고 다시 배포합니다. 이 값이 없으면 접속이 막힙니다.

금액표와 고객용 견적은 Netlify Blobs에 저장됩니다(별도 설정 없음).

## 구성

| 경로 | 내용 |
| --- | --- |
| `public/index.html`, `app.js` | 직원용 계산기 + 금액 관리 |
| `public/data.js` | 기준표(26.11.11) 초기 금액. 저장된 금액표가 없을 때만 사용 |
| `public/sheet.js` | 견적서 양식, 링크 미리보기 카드 |
| `netlify/functions/db.mjs` | 금액표 읽기/저장 (`/api/db`) |
| `netlify/functions/share.mjs` | 고객용 링크 만들기 (`/api/share`) |
| `netlify/functions/quote.mjs` | 고객용 견적 페이지 (`/q/:id`) |
| `netlify/functions/og.mjs` | 링크 미리보기 이미지 (`/og/:id`) |
