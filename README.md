# 견적 관리 사이트 (페이앤밴 직원용)

장비를 고르면 세트가·할인을 계산해 견적서를 만들고, 견적서 이미지·문자 내용·고객용 링크(카톡·톡톡 미리보기 포함)를 뽑아 주는 내부용 사이트입니다.

## Netlify 배포

1. Netlify에서 이 GitHub 저장소를 연결합니다. 빌드 설정은 `netlify.toml`에 들어 있어 따로 입력할 것이 없습니다.
2. **Project configuration → Environment variables**에 `SITE_PASSWORD`(직원 공용 비밀번호)를 추가하고 다시 배포합니다. 이 값이 없으면 접속이 막힙니다.

금액표, 저장된 견적, 올린 이미지는 Netlify Blobs에 저장됩니다(별도 설정 없음).

## 화면

| 메뉴 | 내용 |
| --- | --- |
| 견적서 관리 | 기본 정보 → 장비 선택 → 견적 내역 → 견적 저장하기(완료 모달: 이미지 저장 / 문자 복사 / URL 공유) |
| 담당자 대시보드 | 저장된 견적 목록. 담당자별 건수, 검색, 기간, 보기·링크·수정·삭제, CSV 내보내기 |
| 제품 금액 관리 | 단품가, 세트가(구성·조건 포함), 기본 문구(참고사항·문자 내용·담당자 목록) |
| 이미지 리스트 | 단품·세트 사진 등록/변경/삭제 |

고객에게 보내는 링크는 `/q/견적ID`이며 비밀번호 없이 견적서만 보입니다.

## 구글 시트에 견적 자동 기록 (선택)

견적을 저장·수정·삭제할 때마다 구글 시트에 한 줄씩 기록할 수 있습니다. 사이트의 대시보드는 그대로 동작하고, 시트는 정리·집계용 사본이 됩니다.

1. 새 구글 시트를 만들고 **확장 프로그램 → Apps Script**를 엽니다.
2. 아래 코드를 붙여넣고 저장합니다.
3. **배포 → 새 배포 → 유형: 웹 앱**, 실행 계정 "나", 액세스 권한 "모든 사용자"로 배포하고 웹 앱 URL을 복사합니다.
4. Netlify 환경변수에 `SHEET_WEBHOOK_URL`로 그 URL을 넣고 다시 배포합니다.

```js
const COLUMNS = ['id', '저장일시', '견적일', '담당자', '고객명', '연락처', '구성', '정상가합계', '세트할인', '이벤트할인', '특별할인', '월렌탈료_VAT별도', '월렌탈료_VAT포함', '약정개월', '링크'];

function doPost(e) {
  const row = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) sheet.appendRow(COLUMNS);
  const ids = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues().map(r => r[0]);
  const at = ids.indexOf(row.id) + 1;                       // 이미 있는 견적이면 그 줄
  if (row.action === 'delete') { if (at > 1) sheet.deleteRow(at); }
  else {
    const values = COLUMNS.map(c => row[c] ?? '');
    if (at > 1) sheet.getRange(at, 1, 1, values.length).setValues([values]);
    else sheet.appendRow(values);
  }
  return ContentService.createTextOutput('ok');
}
```

## 파일 구성

| 경로 | 내용 |
| --- | --- |
| `public/index.html`, `public/js/*.js` | 직원용 화면 (core: 공통, quote: 견적서 관리, dash: 대시보드, price: 금액 관리, images: 이미지 리스트) |
| `public/data.js` | 기준표(26.11.11) 초기 금액과 기본 문구. 저장된 금액표가 없을 때만 사용 |
| `public/sheet.js` | 견적서 양식, 공급자 정보(`COMPANY`), 링크 미리보기 카드 |
| `public/img/lib` | 기본 제공 제품·세트 사진 |
| `netlify/functions` | `db`(금액표), `quotes`(견적 저장·목록), `images`(사진 업로드), `quote`(고객용 페이지), `og`(링크 미리보기 이미지) |
