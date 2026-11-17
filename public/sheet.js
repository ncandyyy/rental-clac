// 견적서 양식. 직원용 화면과 고객용 링크 페이지가 같이 쓴다.
// q = 견적 내용 (js/quote.js의 snapshot() 참고)

// 견적서에 찍히는 공급자 정보
const COMPANY = {
  name: '페이앤밴', tel: '1577-0115',
  bizNo: '726-81-00834', ceo: '차정관, 안형권', email: 'paynvan1@gmail.com', address: '대구 중구 동덕로167, KT빌딩11층',
  account: '하나은행 103-910074-27704 (예금주 : (주)미르네프로)',
};
const IMAGES_PER_PAGE = 9;   // 제품 사진 페이지 한 장에 들어가는 사진 수 (3×3)

const num = n => (Number(n) || 0).toLocaleString('ko-KR');
const won = n => num(n) + '원';
const minus = n => !n ? '0 원' : `${n > 0 ? '-' : '+'} ${num(Math.abs(n))} 원`;   // 할인 표시 (음수 할인은 +)
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 예전에 저장된 견적도 같은 양식으로 보이도록 항목 이름을 맞춘다
function normalizeQuote(q) {
  const supply = q.supply ?? q.monthly ?? 0;          // 할인 적용 합계 (VAT 별도)
  const final = q.final ?? q.vat ?? supply;            // 최종 월 렌탈료 (VAT 포함)
  return { ...q, supply, final, vatAmount: q.vatAmount ?? final - supply, notes: q.notes || [], images: q.images || [], lines: q.lines || [] };
}

function sheetHeader(q) {
  return `
    <div class="sh-title"><h1>${esc(q.customer || '고객')} 대표님 렌탈 견적서</h1><img src="/img/ui/logo.svg" alt="PAYNVAN" width="43" height="9"></div>
    <div class="sh-meta">
      <div><b>견적일자</b><span>${esc(q.date)}</span></div>
      <div><b>견적 담당자</b><span>${esc(q.staff || COMPANY.name)}</span></div>
    </div>`;
}

function renderSheet(raw) {
  const q = normalizeQuote(raw);
  const row = (k, v) => `<div><b>${k}</b><span>${esc(v)}</span></div>`;
  const lines = q.lines.map(l => `
    <tr>
      <td>${l.kind === 'set' ? '세트 상품' : '추가 장비'}</td>
      <td>${esc(l.name)}</td>
      <td>${num(l.unit ?? l.list / (l.qty || 1))}</td>
      <td>${l.qty}</td>
      <td>${l.kind === 'set' ? '세트' : '대'}</td>
      <td>${num(l.list)} 원</td>
    </tr>`).join('');

  const main = `
  <div class="sheet-page">
    ${sheetHeader(q)}
    <div class="sh-parties">
      <div class="sh-party">
        <div class="sh-who">
          <div><small>공급자</small><strong>${COMPANY.name} | ${COMPANY.tel}</strong></div>
          <img src="/img/ui/stamp.png" alt="" width="46" height="46">
        </div>
        <div class="sh-rows">${row('사업자', COMPANY.bizNo)}${row('대표자', COMPANY.ceo)}${row('이메일', COMPANY.email)}${row('주소', COMPANY.address)}</div>
      </div>
      <i class="sh-divider"></i>
      <div class="sh-party">
        <div class="sh-who"><div><small>수신자</small><strong>${esc(q.customer || '고객')} <em>대표님</em></strong></div></div>
        <div class="sh-rows">${row('연락처', q.phone || '-')}${row('수신자', q.customer || '-')}</div>
      </div>
    </div>
    <div class="sh-body">
      <p class="sh-label">견적 항목</p>
      <div class="sh-items">
        <img class="sh-watermark" src="/img/ui/watermark.svg" alt="" width="328" height="66">
        <table>
          <thead><tr><th>항목</th><th>설명</th><th>단가</th><th>수량</th><th>단위</th><th>금액</th></tr></thead>
          <tbody>${lines}</tbody>
        </table>
      </div>
      <div class="sh-sum first">
        <div><b>금액</b><span>${num(q.list)} 원</span></div>
        <div><b>부가가치세(VAT)</b><span>${num(q.vatAmount)} 원</span></div>
      </div>
      <div class="sh-sum">
        <div><b>세트 할인</b><span>${minus(q.setDisc)}</span></div>
        <div><b>이벤트 할인</b><span>${minus(q.eventDisc)}</span></div>
        ${q.special ? `<div><b>특별 할인</b><span>${minus(q.special)}</span></div>` : ''}
      </div>
      <div class="sh-final"><b>최종 월 렌탈료(VAT 포함)</b><span><strong>${num(q.final)}</strong> 원</span></div>
      ${q.notes.length ? `<div class="sh-notes"><p>참고사항</p><ul>${q.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
      <p class="sh-account">▶ 입금 계좌 | ${COMPANY.account}</p>
    </div>
  </div>`;

  // 제품 사진은 양식 다음 페이지에, 넘치면 그다음 페이지로
  let photoPages = '';
  for (let i = 0; i < q.images.length; i += IMAGES_PER_PAGE) {
    photoPages += `
  <div class="sheet-page">
    ${sheetHeader(q)}
    <div class="sh-body">
      <p class="sh-label">제품 이미지</p>
      <div class="sh-photos">
        ${q.images.slice(i, i + IMAGES_PER_PAGE).map(im => `<figure><div><img src="${esc(im.url)}" alt=""></div><figcaption>${esc(im.name)}</figcaption></figure>`).join('')}
      </div>
    </div>
  </div>`;
  }
  return `<div class="sheet-pages">${main}${photoPages}</div>`;
}

// 화면 폭에 맞춰 견적서를 키우거나 줄인다 (.sheet-fit 안에 있는 견적서)
function fitSheets() {
  for (const box of document.querySelectorAll('.sheet-fit')) {
    const pages = box.querySelector('.sheet-pages');
    if (pages) pages.style.zoom = Math.min(1.7, Math.max(0.4, (box.clientWidth || innerWidth) / 595));
  }
}

// 링크 미리보기(카톡·톡톡)에 나가는 1200×630 카드
function renderOgCard(raw) {
  const q = normalizeQuote(raw);
  const items = q.lines.map(l => l.name + (l.qty > 1 ? ' ×' + l.qty : '')).join(' / ');
  return `
  <div class="og-card">
    <img src="/img/ui/logo.svg" alt="" width="200" height="40">
    <div class="og-name">${esc(q.customer || '고객')} 대표님<br>렌탈 견적서가 도착했어요</div>
    <div class="og-items">${esc(items)}</div>
    <div class="og-bottom">
      <div class="og-price"><span>월</span> ${num(q.final)}<span>원 · VAT 포함</span></div>
      <div class="og-cta">견적 확인하기 ›</div>
    </div>
  </div>`;
}

// 화면 밖에 그려서 PNG로 만든다 (화면에 보이는 크기·확대와 상관없이 같은 결과)
async function htmlToPng(html, pixelRatio) {
  const box = document.createElement('div');
  box.className = 'offscreen';
  box.innerHTML = html;
  document.body.appendChild(box);
  try {
    await Promise.all([...box.querySelectorAll('img')].map(img => img.decode().catch(() => {})));
    await document.fonts.ready;
    return await htmlToImage.toPng(box.firstElementChild, { pixelRatio, backgroundColor: '#ffffff' });
  } finally {
    box.remove();
  }
}

async function saveSheetImage(q) {
  const blob = await (await fetch(await htmlToPng(renderSheet(q), 3))).blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `렌탈견적서_${q.customer || '고객'}_${q.date || ''}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
