// 견적서 양식. 직원용 화면과 고객용 링크 페이지가 같이 쓴다.
// q = 견적 내용 (js/quote.js의 snapshot() 참고)

// 견적서에 찍히는 공급자 정보
const COMPANY = {
  name: '페이앤밴', tel: '1577-0115',
  bizNo: '726-81-00834', ceo: '차정관, 안형권', email: 'paynvan1@gmail.com', address: '대구 중구 동덕로167, KT빌딩11층',
  account: '하나은행 103-910074-27704 (예금주 : (주)미르네프로)',
};
const PHOTO_NOTICE = '※ 제품 이미지는 이해를 돕기 위한 예시이며, 회사 사정에 따라 실제 제품과 다르거나 변경될 수 있습니다.';

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

// 견적서 제목에 쓰는 받는 분 이름 (성함 → 상호 순)
const whoOf = q => q.name || q.customer || '고객';
// 견적 항목 한 줄의 표시값
const LINE_LABEL = { set: '세트 상품', item: '추가 장비', manual: '' };
const lineLabel = l => l.label || LINE_LABEL[l.kind] || '';
const lineUom = l => l.uom || (l.kind === 'set' ? '세트' : '대');

function sheetHeader(q) {
  return `
    <div class="sh-head">
      <div class="sh-title"><h1>${esc(whoOf(q))} 대표님 렌탈 견적서</h1><img src="/img/ui/logo.svg" alt="PAYNVAN" width="52" height="10"></div>
      <div class="sh-meta">
        <div><b>견적일자</b><span>${esc(q.date)}</span></div>
        <div><b>견적 담당자</b><span>${esc(q.staff || COMPANY.name)}</span></div>
      </div>
    </div>`;
}

// 견적서는 블록(.blk)을 위에서부터 빈칸 없이 이어 붙인다.
// 순서: 공급자·수신자 → 견적 항목 → 금액 → 최종 → 제품 이미지 → 참고사항 → 입금 계좌
// 화면에 넣은 뒤 layoutSheets()가 A4 높이에 맞춰 페이지를 나눈다.
function renderSheet(raw) {
  const q = normalizeQuote(raw);
  const row = (k, v) => `<div><b>${k}</b><span>${esc(v)}</span></div>`;
  const lines = q.lines.map(l => `
    <tr>
      <td>${esc(lineLabel(l))}</td>
      <td>${esc(l.name)}</td>
      <td class="r">${num(l.unit ?? l.list / (l.qty || 1))}</td>
      <td class="r">${l.qty}</td>
      <td>${esc(lineUom(l))}</td>
      <td class="r">${num(l.list)} 원</td>
    </tr>`).join('');

  const photoRows = [];
  for (let i = 0; i < q.images.length; i += 3) photoRows.push(q.images.slice(i, i + 3));
  const blocks = [
    `<div class="blk sh-parties">
      <div class="sh-party">
        <div class="sh-who">
          <div><small>공급자</small><strong>${COMPANY.name} | ${COMPANY.tel}</strong></div>
          <img src="/img/ui/stamp.png" alt="" width="50" height="50">
        </div>
        <div class="sh-rows">${row('사업자', COMPANY.bizNo)}${row('대표자', COMPANY.ceo)}${row('이메일', COMPANY.email)}${row('주소', COMPANY.address)}</div>
      </div>
      <i class="sh-divider"></i>
      <div class="sh-party">
        <div class="sh-who"><div><small>수신자</small><strong>${esc(whoOf(q))} <em>대표님</em></strong></div></div>
        <div class="sh-rows">${row('상호', q.customer || '-')}${row('성함', q.name || '-')}${row('연락처', q.phone || '-')}</div>
      </div>
    </div>`,
    `<div class="blk sh-items">
      <p class="sh-label">견적 항목</p>
      <table>
        <thead><tr><th>항목</th><th>설명</th><th class="r">단가</th><th class="r">수량</th><th>단위</th><th class="r">금액</th></tr></thead>
        <tbody>${lines}</tbody>
      </table>
    </div>`,
    `<div class="blk sh-sums">
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
    </div>`,
    ...photoRows.map((list, i) => `
    <div class="blk sh-photo-row ${i === 0 ? 'first' : ''}">
      ${i === 0 ? '<p class="sh-label">제품 이미지</p>' : ''}
      <div class="sh-photos">${list.map(im => `<figure><div><img src="${esc(im.url)}" alt=""></div><figcaption>${esc(im.name)}</figcaption></figure>`).join('')}</div>
    </div>`),
    photoRows.length ? `<p class="blk sh-photo-notice">${PHOTO_NOTICE}</p>` : '',
    q.notes.length ? `<div class="blk sh-notes-wrap"><div class="sh-notes"><p>참고사항</p><ul>${q.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div></div>` : '',
    `<p class="blk sh-account">▶ 입금 계좌 | ${COMPANY.account}</p>`,
  ];
  return `<div class="sheet-pages" data-flow="1">
    <div class="sheet-page">
      <img class="sh-watermark" src="/img/ui/watermark.svg" alt="" width="328" height="66">
      ${sheetHeader(q)}
      <div class="sh-body">${blocks.join('')}</div>
    </div>
  </div>`;
}

// A4(595×842) 한 장에 들어가는 만큼씩 블록을 나눠 담는다. 넘치는 블록은 다음 장으로.
const PAGE_H = 842, PAGE_PAD_TOP = 42, PAGE_PAD_BOTTOM = 36;
function layoutSheets(root = document) {
  for (const pages of root.querySelectorAll('.sheet-pages[data-flow]')) {
    pages.removeAttribute('data-flow');
    pages.style.zoom = '';
    const first = pages.querySelector('.sheet-page');
    const head = first.querySelector('.sh-head');
    const blocks = [...first.querySelectorAll('.sh-body > .blk')];
    first.style.display = 'flex';   // 한 장씩 보기 화면에서 숨겨져 있어도 높이를 잴 수 있게
    const heights = blocks.map(b => b.offsetHeight);
    const headH = head.offsetHeight;
    first.style.display = '';
    const room = PAGE_H - PAGE_PAD_TOP - PAGE_PAD_BOTTOM - headH;
    let page = first, used = 0;
    blocks.forEach((b, i) => {
      if (used > 0 && used + heights[i] > room) {
        page = document.createElement('div');
        page.className = 'sheet-page';
        page.innerHTML = first.querySelector('.sh-watermark').outerHTML + head.outerHTML + '<div class="sh-body"></div>';
        pages.appendChild(page);
        used = 0;
      }
      page.querySelector('.sh-body').appendChild(b);
      used += heights[i];
    });
  }
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
    <div class="og-name">${esc(whoOf(q))} 대표님<br>렌탈 견적서가 도착했어요</div>
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
    layoutSheets(box);
    return await htmlToImage.toPng(box.firstElementChild, { pixelRatio, backgroundColor: '#ffffff' });
  } finally {
    box.remove();
  }
}

async function saveSheetImage(q) {
  const blob = await (await fetch(await htmlToPng(renderSheet(q), 3))).blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `렌탈견적서_${[q.customer, q.name].filter(Boolean).join('_') || '고객'}_${q.date || ''}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
