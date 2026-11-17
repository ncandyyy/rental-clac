// 고객용 견적 페이지. 링크 미리보기 정보(og 태그)를 견적마다 넣어서 내려준다.
import { store, QUOTE_ID, INDEX_KEY } from '../lib/common.mjs';

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

  // 묶음 견적이면 같은 묶음의 견적서를 모두 보여준다 (만든 순서대로)
  let list = [{ id, q }];
  if (rec.groupId) {
    const quotes = store('quotes');
    const index = (await quotes.get(INDEX_KEY, { type: 'json' })) || [];
    const members = index.filter(s => s.groupId === rec.groupId && s.status !== 'draft')
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    if (members.length > 1) {
      const loaded = await Promise.all(members.map(async s => {
        const r = s.id === id ? rec : await quotes.get(s.id, { type: 'json' });
        return r && r.status !== 'draft' ? { id: s.id, q: r.public || r } : null;
      }));
      list = loaded.filter(Boolean);
      if (!list.some(x => x.id === id)) list.unshift({ id, q });
    }
  }
  const start = Math.max(0, list.findIndex(x => x.id === id));
  const many = list.length > 1;
  const title = `${q.name || q.customer || '고객'} 대표님 렌탈 견적서${many ? ` (${list.length}건)` : ''}`;
  const desc = many
    ? `견적서 ${list.length}건 · ${list.map(x => x.q.customer || x.q.name || '견적서').join(', ')} · 견적 내용을 확인해보세요.`
    : `월 렌탈료 ${won(q.final ?? q.vat)} (VAT 포함) · 견적 내용을 확인해보세요.`;
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
<div class="customer-tabs no-print" id="tabs"></div>
<div id="sheet" class="sheet-fit"></div>
<div class="customer-actions no-print">
  <button class="btn dark" onclick="saveSheetImage(window.QUOTES[cur].q)">견적서 이미지 저장</button>
  <button class="btn" onclick="window.print()">인쇄 / PDF 저장</button>
</div>
<script>window.QUOTES = ${JSON.stringify(list).replace(/</g, '\\u003c')};</script>
<script src="/vendor/html-to-image.js"></script>
<script src="/sheet.js"></script>
<script>
  let cur = ${start};
  // 묶음 견적서는 위의 탭으로 하나씩 넘겨 본다
  function show(i) {
    cur = i;
    const list = window.QUOTES;
    document.getElementById('tabs').innerHTML = list.length < 2 ? '' :
      list.map((x, j) => '<button class="' + (j === i ? 'on' : '') + '" onclick="show(' + j + ')">' + esc(x.q.customer || x.q.name || '견적서 ' + (j + 1)) + '</button>').join('');
    document.getElementById('sheet').innerHTML = renderSheet(list[i].q);
    layoutSheets(document.getElementById('sheet'));
    fitSheets();
  }
  document.fonts.ready.then(() => show(cur));
  addEventListener('resize', fitSheets);
</script>
</body>
</html>`);
};

export const config = { path: '/q/:id' };
