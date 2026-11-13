// 견적서 화면. 직원용 계산기와 고객용 링크 페이지가 같이 쓴다.
// q = 견적 스냅샷 (app.js의 snapshot() 참고)
const won = n => (Number(n) || 0).toLocaleString('ko-KR') + '원';
const disc = n => !n ? '0원' : (n > 0 ? '-' : '+') + won(Math.abs(n));   // 할인 표시 (음수 할인은 +)
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderSheet(q) {
  const rows = q.lines.map((l, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${l.kind === 'set' ? '세트' : '추가 장비'}</td>
      <td>${esc(l.name)}${l.comp ? `<div class="note">구성: ${esc(l.comp)}</div>` : ''}</td>
      <td class="num">${l.qty}</td>
      <td class="num">${won(l.list)}</td>
      <td class="num"><b>${won(l.final)}</b></td>
    </tr>`).join('');
  const info = [['고객명(상호)', q.customer], ['연락처', q.phone], ['견적일', q.date], ['담당자', q.staff]]
    .filter(([, v]) => v).map(([k, v]) => `<span><b>${k}</b> ${esc(v)}</span>`).join('');
  return `
  <div class="sheet">
    <h1>렌탈 견적서</h1>
    <div class="sheet-info">${info}</div>
    <table>
      <thead><tr><th>No</th><th>구분</th><th>상품</th><th class="num">수량</th><th class="num">정상가</th><th class="num">월 렌탈료</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">선택한 상품이 없습니다.</td></tr>'}</tbody>
    </table>
    <table class="total">
      <tr><th>정상가 합계</th><td class="num">${won(q.list)}</td></tr>
      <tr><th>세트 할인</th><td class="num">${disc(q.setDisc)}</td></tr>
      <tr><th>이벤트 할인</th><td class="num">${disc(q.eventDisc)}</td></tr>
      ${q.special ? `<tr><th>특별 할인</th><td class="num">${disc(q.special)}</td></tr>` : ''}
      <tr class="big"><th>최종 월 렌탈료 (VAT 별도)</th><td class="num">${won(q.monthly)}</td></tr>
      <tr class="big"><th>최종 월 렌탈료 (VAT 포함)</th><td class="num">${won(q.vat)}</td></tr>
      <tr><th>약정기간 총 납부액 (VAT 포함)</th><td class="num">${won(q.total)} (${q.months}개월)</td></tr>
    </table>
    ${q.conds && q.conds.length ? `<h2>적용 조건</h2><ul>${q.conds.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
  </div>`;
}

// 링크 미리보기(카톡·톡톡)에 나가는 1200×630 카드
function renderOgCard(q) {
  const items = q.lines.map(l => l.name + (l.qty > 1 ? ' ×' + l.qty : '')).join(' / ');
  return `
  <div class="og-card">
    <div class="og-label">렌탈 견적서</div>
    <div class="og-name">${esc(q.customer || '고객')}님 견적이 도착했어요</div>
    <div class="og-items">${esc(items)}</div>
    ${q.showPrice === false ? '' : `<div class="og-price">월 ${won(q.monthly)} <span>VAT 별도</span></div>`}
    <div class="og-cta">견적 확인하기 ›</div>
  </div>`;
}

const toPng = (node, pixelRatio) => htmlToImage.toPng(node, { pixelRatio, backgroundColor: '#ffffff', cacheBust: true });

async function saveSheetImage(node, q) {
  const a = document.createElement('a');
  const blob = await (await fetch(await toPng(node, 2))).blob();
  a.href = URL.createObjectURL(blob);
  a.download = `렌탈견적서_${q.customer || '고객'}_${q.date || ''}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
