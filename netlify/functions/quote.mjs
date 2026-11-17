// 고객용 견적 페이지. 링크 미리보기 정보(og 태그)를 견적마다 넣어서 내려준다.
import { store, QUOTE_ID } from '../lib/common.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const won = n => (Number(n) || 0).toLocaleString('ko-KR') + '원';
const html = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });

export default async (req, context) => {
  const id = context.params.id;
  const rec = QUOTE_ID.test(id) ? await store('quotes').get(id, { type: 'json' }) : null;
  if (!rec || rec.status === 'draft') {   // 임시저장(작성중) 견적은 고객에게 열리지 않는다
    return html('<!DOCTYPE html><html lang="ko"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>견적서를 찾을 수 없습니다</title><body style="font-family:sans-serif;padding:40px"><h1>견적서를 찾을 수 없습니다</h1><p>링크가 잘못되었거나 삭제된 견적입니다. 담당자에게 문의해주세요.</p></body></html>', 404);
  }
  const q = rec.public || rec;   // 내부 정보(state)는 내려보내지 않는다
  const origin = new URL(req.url).origin;
  const title = `${q.customer || '고객'}님 렌탈 견적서`;
  const desc = `월 렌탈료 ${won(q.final ?? q.vat)} (VAT 포함) · 견적 내용을 확인해보세요.`;
  const version = encodeURIComponent(rec.updatedAt || rec.createdAt || '');

  return html(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${origin}/q/${id}">
<meta property="og:image" content="${origin}/og/${id}?v=${version}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/style.css">
</head>
<body class="customer">
<div id="sheet" class="sheet-fit"></div>
<div class="customer-actions no-print">
  <button class="btn dark" onclick="saveSheetImage(window.QUOTE)">견적서 이미지 저장</button>
  <button class="btn" onclick="window.print()">인쇄 / PDF 저장</button>
</div>
<script>window.QUOTE = ${JSON.stringify(q).replace(/</g, '\\u003c')};</script>
<script src="/vendor/html-to-image.js"></script>
<script src="/sheet.js"></script>
<script>
  document.getElementById('sheet').innerHTML = renderSheet(window.QUOTE);
  fitSheets();
  addEventListener('resize', fitSheets);
</script>
</body>
</html>`);
};

export const config = { path: '/q/:id' };
