// 견적서 관리(메인): 장비 선택 → 견적 내역 → 저장 → 완료 모달

const emptyQuote = () => ({
  customer: '', phone: '', date: today(), months: 36, staff: '', special: 0, specialMemo: '',
  qty: {}, setChoice: 'auto',
  notes: null,                    // null이면 기본 참고사항 사용
  imgRemoved: [], imgExtra: [],   // 자동으로 불러온 사진 중 뺀 것 / 직접 올린 것
  editingId: null,                // 저장된 견적을 고치는 중이면 그 id
});
let quote = (() => { try { return { ...emptyQuote(), ...JSON.parse(localStorage.getItem(QUOTE_KEY)) }; } catch { return emptyQuote(); } })();
const FOLD_KEY = 'rental-folds-v2';
const folds = { simple: false, detail: false, photos: false, notes: true, ...JSON.parse(localStorage.getItem(FOLD_KEY) || '{}') };   // 접힌 영역

function saveQuote() { localStorage.setItem(QUOTE_KEY, JSON.stringify(quote)); }

// ───────── 계산 ─────────
const units = s => Object.values(s.comp).reduce((a, b) => a + b, 0);
// 고른 장비 안에 구성이 전부 들어가는 세트들. 많이 덮는 순.
function candidates() {
  return db.sets
    .filter(s => units(s) > 0 && Object.entries(s.comp).every(([id, n]) => (quote.qty[id] || 0) >= n))
    .sort((a, b) => units(b) - units(a));
}
// 자동 선택: 가장 많이 덮는 세트 중 조건 없는 유료렌탈 우선 (무상·매출조건 세트는 직원이 직접 선택)
function autoSet(cands) {
  if (!cands.length) return null;
  const top = cands.filter(s => units(s) === units(cands[0]));
  return top.find(s => s.type === '유료렌탈' && !s.cond) || top.find(s => s.type === '유료렌탈') || top[0];
}
function currentSet(cands) {
  if (quote.setChoice === 'none') return null;
  return cands.find(s => s.id === quote.setChoice) || autoSet(cands);
}
// set(없으면 null)을 적용했을 때의 견적. 세트에 안 들어간 장비는 추가 장비(단품 행사가).
function compute(set) {
  const lines = [], conds = [], autoImages = [];
  const addImage = (url, name) => { if (url && !autoImages.some(i => i.url === url)) autoImages.push({ url, name }); };
  if (set) {
    const c = calcSet(set);
    lines.push({ kind: 'set', name: set.name, qty: 1, unit: c.list, list: c.list, setDisc: c.setDisc, eventDisc: c.eventDisc, final: c.final });
    const note = [set.cond, set.check].filter(Boolean).join(' / ');
    if (note) conds.push(`${set.name} (${set.type}) — ${note}`);
    if (set.image) addImage(set.image, set.name);
    else for (const id of Object.keys(set.comp)) { const p = itemById(id); if (p) addImage(p.image, p.name); }
  }
  for (const p of db.items) {
    const n = (quote.qty[p.id] || 0) - (set?.comp[p.id] || 0);
    if (n <= 0) continue;
    lines.push({ kind: 'item', name: p.name, qty: n, unit: p.price, list: p.price * n, setDisc: 0, eventDisc: (p.price - p.sale) * n, final: p.sale * n });
    addImage(p.image, p.name);
  }
  const sum = k => lines.reduce((a, l) => a + l[k], 0);
  const subtotal = sum('final');
  const special = Math.min(Number(quote.special) || 0, subtotal);   // 특별 할인은 합계 이하로만
  const supply = subtotal - special;                                  // 총 합계 (VAT 별도)
  const vatAmount = Math.round(supply * 0.1);
  const final = supply + vatAmount;                                   // 최종 월 렌탈료 (VAT 포함)
  const months = Number(quote.months) || 0;
  return { lines, conds, autoImages, list: sum('list'), setDisc: sum('setDisc'), eventDisc: sum('eventDisc'), special, supply, vatAmount, final, months, total: final * months };
}
const quoteNotes = () => quote.notes || db.settings.notes;
const quoteImages = r => [...r.autoImages.filter(i => !quote.imgRemoved.includes(i.url)), ...quote.imgExtra];

// 견적서·고객 링크에 들어가는 내용 (사유 메모 같은 내부 정보는 넣지 않는다)
function snapshot() {
  const { autoImages, ...r } = compute(currentSet(candidates()));
  return { customer: quote.customer.trim(), phone: quote.phone.trim(), date: quote.date, staff: quote.staff.trim() || COMPANY.name, ...r, notes: quoteNotes(), images: quoteImages({ autoImages }) };
}

// ───────── 화면 ─────────
PAGES.quote = function renderQuotePage() {
  $('page-quote').innerHTML = `
    <div class="basic">
      <div class="row between">
        <p class="title">기본 정보 입력</p>
        <div class="row">
          <span id="editBanner"></span>
          <button class="btn white" onclick="newQuote()">새 견적 작성</button>
        </div>
      </div>
      <div class="line">
        <div class="group">
          <label class="field">견적일 <input id="qDate" type="date" value="${esc(quote.date)}" oninput="setInfo('date', this.value)"></label>
          <label class="field">약정기간(개월)
            <span class="with-unit"><input id="qMonths" type="number" min="1" placeholder="00" value="${quote.months || ''}" oninput="setInfo('months', Number(this.value) || 0)"><span>개월</span></span>
          </label>
        </div>
        <label class="field">견적 담당자 <input id="qStaff" list="staffList" placeholder="미입력시 페이앤밴" value="${esc(quote.staff)}" oninput="setInfo('staff', this.value)"></label>
        <datalist id="staffList">${(db.settings.staff || []).map(s => `<option value="${esc(s)}">`).join('')}</datalist>
      </div>
      <div class="line right">
        <div class="group" style="gap:13px">
          <label class="field">고객명(상호) <input id="qCustomer" placeholder="입력" value="${esc(quote.customer)}" oninput="setInfo('customer', this.value)"></label>
          <label class="field">연락처 <input id="qPhone" placeholder="입력" value="${esc(quote.phone)}" oninput="setInfo('phone', this.value)"></label>
        </div>
      </div>
    </div>

    <div class="cols">
      <div class="col-left">
        <div class="row between">
          <p class="title">장비 선택</p>
          <select class="input" style="width:250px" onchange="loadSet(this.value); this.value=''" id="setLoader"></select>
        </div>
        <div class="fold" id="foldSimple">
          <button class="fold-head" onclick="toggleFold('simple')">세트 구성 간단 작성 <img src="/img/ui/chevron-down.svg" alt="" width="14" height="14"></button>
          <div class="fold-body" id="chipList"></div>
        </div>
        <div class="fold" id="foldDetail">
          <button class="fold-head" onclick="toggleFold('detail')">세트 구성 상세 작성 <img src="/img/ui/chevron-down.svg" alt="" width="14" height="14"></button>
          <div class="fold-body" id="pickList"></div>
        </div>
      </div>

      <div class="col-right">
        <p class="title">견적 내역</p>
        <div id="setPick"></div>
        <div>
          <table class="qtable">
            <thead><tr><th style="width:110px">항목</th><th>설명</th><th style="width:80px">단가</th><th style="width:60px">수량</th><th style="width:60px">단위</th><th style="width:110px">금액</th></tr></thead>
            <tbody id="lineBody"></tbody>
          </table>
          <div class="sum dashed"><div><span>총</span><span id="tList"></span></div></div>
          <div class="sum">
            <div><span>세트 할인</span><span id="tSet"></span></div>
            <div><span>이벤트 할인</span><span id="tEvent"></span></div>
            <div id="rowSpecial"><span>특별 할인</span><span id="tSpecial"></span></div>
          </div>
          <div class="special">
            <label class="field">특별 할인
              <span class="with-unit"><input id="qSpecial" type="number" min="0" step="1000" placeholder="--" value="${quote.special || ''}" onkeydown="if (event.key === 'Enter') applySpecial()"><span>원</span></span>
            </label>
            <label class="field">사유 <input id="qSpecialMemo" placeholder="내부용 · 고객에게 안보임" value="${esc(quote.specialMemo)}" onkeydown="if (event.key === 'Enter') applySpecial()"></label>
            <button class="btn" onclick="applySpecial()">적용</button>
          </div>
          <div class="sum pad">
            <div><span>총 합계</span><span id="tSupply"></span></div>
            <div><span>부가가치세(VAT)</span><span id="tVat"></span></div>
          </div>
          <div class="final"><b>최종 월 렌탈료(VAT 포함)</b><span>월<strong id="tFinal"></strong>원</span></div>
          <div class="final-sub"><span>기간 총 납부액(약정기간 x 월 렌탈료)</span><span id="tTotal"></span></div>
          <ul id="condList" class="sub" style="margin-top:12px; padding-left:16px; line-height:1.6"></ul>
        </div>

        <div class="card two" id="foldPhotos" ${dropAttrs('addQuoteFiles(imageFiles(event.dataTransfer))')}>
          <button class="card-fold" onclick="toggleFold('photos')" aria-label="접기/펴기"><img src="/img/ui/chevron-down.svg" alt="" width="18" height="18"></button>
          <div class="lead">
            <div>
              <p class="title">제품 이미지 등록</p>
              <p class="sub">자동으로 이미지 리스트에서 상품을 불러옵니다.<br>사진을 끌어다 놓거나, 복사한 이미지를 붙여넣기(Ctrl+V)해도 추가됩니다.</p>
            </div>
            <div class="row">
              <button class="btn" onclick="addQuoteImage()">직접 등록하기</button>
              <button class="btn" id="imgReset" onclick="resetQuoteImages()" hidden>자동으로 되돌리기</button>
            </div>
          </div>
          <div class="panel"><div class="dropzone" id="photoList"></div></div>
        </div>

        <div class="card two" id="foldNotes">
          <button class="card-fold" onclick="toggleFold('notes')" aria-label="접기/펴기"><img src="/img/ui/chevron-down.svg" alt="" width="18" height="18"></button>
          <div class="lead">
            <div>
              <p class="title">참고 사항(안내사항)</p>
              <p class="sub">수정 후 적용 시 참고사항 변경이 가능합니다.<br>한 줄에 한 항목씩 적어주세요.</p>
            </div>
            <div class="row">
              <button class="btn" onclick="applyNotes()">등록</button>
              <button class="btn" id="notesReset" onclick="resetNotes()" hidden>기본값으로</button>
            </div>
          </div>
          <div class="panel"><textarea class="notes-edit" id="qNotes"></textarea></div>
        </div>

        <button class="btn-big" id="saveBtn" onclick="saveQuoteToServer()">견적 저장하기</button>
      </div>
    </div>`;
  $('qNotes').value = quoteNotes().join('\n');
  renderPicks();
};

function setInfo(field, value) { quote[field] = value; saveQuote(); renderResult(); }
function toggleFold(name) { folds[name] = !folds[name]; localStorage.setItem(FOLD_KEY, JSON.stringify(folds)); applyFolds(); }
function applyFolds() {
  $('foldSimple').classList.toggle('closed', folds.simple);
  $('foldDetail').classList.toggle('closed', folds.detail);
  $('foldPhotos').classList.toggle('closed', folds.photos);
  $('foldNotes').classList.toggle('closed', folds.notes);
}

function step(id, delta) {
  const n = Math.max(0, (quote.qty[id] || 0) + delta);
  if (n) quote.qty[id] = n; else delete quote.qty[id];
  saveQuote(); renderPicks();
}
function toggleItem(id) { step(id, quote.qty[id] ? -quote.qty[id] : 1); }
function chooseSet(value) {
  quote.setChoice = value === 'auto' || value === 'none' ? value : Number(value);
  saveQuote(); renderResult();
}
// 세트 구성을 그대로 담기
function loadSet(id) {
  const s = db.sets.find(x => x.id === Number(id));
  if (!s) return;
  quote.qty = { ...s.comp }; quote.setChoice = s.id;
  saveQuote(); renderPicks();
}
function newQuote() {
  if (Object.keys(quote.qty).length && !confirm('작성 중인 내용을 지우고 새 견적을 시작할까요?')) return;
  quote = { ...emptyQuote(), staff: quote.staff };
  saveQuote(); PAGES.quote();
}
function applySpecial() {
  quote.special = Math.max(0, Number($('qSpecial').value) || 0);
  quote.specialMemo = $('qSpecialMemo').value;
  saveQuote(); renderResult();
  toast(quote.special ? `특별 할인 ${won(quote.special)}을 적용했습니다.` : '특별 할인을 해제했습니다.');
}
function applyNotes() {
  quote.notes = $('qNotes').value.split('\n').map(s => s.trim()).filter(Boolean);
  saveQuote(); renderResult();
  toast('참고사항을 이 견적에 적용했습니다.');
}
function resetNotes() {
  quote.notes = null; $('qNotes').value = quoteNotes().join('\n');
  saveQuote(); renderResult();
}
async function addQuoteImage() {
  const file = await pickFile();
  if (file) addQuoteFiles([file]);
}
// 파일 선택 · 끌어다 놓기 · 붙여넣기로 들어온 사진을 이 견적에 추가
async function addQuoteFiles(files) {
  if (!files.length) return toast('이미지 파일(PNG·JPG·WEBP)만 넣을 수 있습니다.', true);
  try {
    toast('이미지 올리는 중…');
    for (const file of files) {
      const name = /^image\.\w+$/.test(file.name) ? '제품 이미지' : file.name.replace(/\.[^.]+$/, '');   // 붙여넣은 이미지는 이름이 없다
      quote.imgExtra.push({ url: await uploadImage(file), name });
    }
    if (folds.photos) toggleFold('photos');
    saveQuote(); renderResult(); toast(`이미지 ${files.length}장을 추가했습니다.`);
  } catch (e) { if (e.message !== 'unauthorized') toast('이미지 올리기 실패: ' + e.message, true); }
}
function removeQuoteImage(url) {
  if (quote.imgExtra.some(i => i.url === url)) quote.imgExtra = quote.imgExtra.filter(i => i.url !== url);
  else quote.imgRemoved.push(url);
  saveQuote(); renderResult();
}
function resetQuoteImages() { quote.imgRemoved = []; quote.imgExtra = []; saveQuote(); renderResult(); }

// 장비 선택 영역 (간단 작성 칩 + 상세 작성 목록)
function renderPicks() {
  $('setLoader').innerHTML = '<option value="">세트 구성으로 바로 담기…</option>' + db.sets.map((s, i) =>
    `<option value="${s.id}">${esc(`${i + 1}. ${s.name} · ${s.type} ${won(calcSet(s).final)}`)}</option>`).join('');
  const groups = itemsByCategory();
  $('chipList').innerHTML = groups.map(([cat, items]) => `
    <div class="chip-group">
      <p>${esc(cat)}</p>
      <div class="chips">${items.map(p => {
        const n = quote.qty[p.id] || 0;
        return `<button class="chip ${n ? 'on' : ''}" onclick="toggleItem(${p.id})"><span><b>${esc(p.name)}</b>(${won(p.price)})${n > 1 ? ' ×' + n : ''}</span>${n ? '<img src="/img/ui/x.svg" alt="빼기">' : ''}</button>`;
      }).join('')}</div>
    </div>`).join('');
  $('pickList').innerHTML = groups.map(([cat, items]) => `
    <div class="cat-head">${esc(cat)}</div>
    ${items.map(p => {
      const n = quote.qty[p.id] || 0;
      return `
      <div class="pick">
        <div class="info">
          <div class="thumb ${p.image ? 'has' : ''}" ${bg(p.image)}></div>
          <div><b>${esc(p.name)}</b><span>정상가 ${won(p.price)}${p.sale !== p.price ? ` · 행사가 ${won(p.sale)}` : ''}</span></div>
        </div>
        <div class="stepper">
          <button onclick="step(${p.id}, -1)" ${n ? '' : 'disabled'} aria-label="빼기"><img src="/img/ui/minus-square.svg" alt="" width="30" height="30"></button>
          <b>${n}</b>
          <button onclick="step(${p.id}, 1)" aria-label="더하기"><img src="/img/ui/plus-square.svg" alt="" width="30" height="30"></button>
        </div>
      </div>`;
    }).join('')}`).join('');
  applyFolds();
  renderResult();
}

// 견적 내역 영역
function renderResult() {
  const cands = candidates();
  if (typeof quote.setChoice === 'number' && !cands.some(s => s.id === quote.setChoice)) quote.setChoice = 'auto';
  const auto = autoSet(cands), set = currentSet(cands);
  const r = compute(set);

  const opt = (value, checked, label) =>
    `<label><input type="radio" name="setChoice" ${checked ? 'checked' : ''} onchange="chooseSet('${value}')"><span>${label}</span></label>`;
  $('setPick').innerHTML = !cands.length ? '' : `
    <div class="setpick">
      <span class="sub">적용 세트 — 같은 구성에 세트가 여러 개면 직접 고를 수 있습니다.</span>
      ${cands.map(s => opt(s.id, set === s,
        `<b>${esc(s.name)}</b> · ${s.type} · 월 ${won(compute(s).final)}` +
        (s === auto ? ' <span class="badge">자동 추천</span>' : '') +
        (s.cond ? ` <span class="badge red">${esc(s.cond)}</span>` : ''))).join('')}
      ${opt('none', !set, `세트 미적용 (단품 합계) · 월 ${won(compute(null).final)}`)}
    </div>`;

  $('lineBody').innerHTML = r.lines.map(l => `
    <tr>
      <td>${l.kind === 'set' ? '세트 상품' : '추가 장비'}</td>
      <td>${esc(l.name)}${l.kind === 'set' ? `<small>세트가 ${won(l.final)}</small>` : (l.eventDisc ? `<small>행사가 ${won(l.final / l.qty)}</small>` : '')}</td>
      <td>${num(l.unit)}</td><td>${l.qty}</td><td>${l.kind === 'set' ? '세트' : '대'}</td><td>${num(l.list)} 원</td>
    </tr>`).join('') || '<tr><td colspan="6" class="empty">왼쪽에서 장비를 선택하세요.</td></tr>';
  $('tList').textContent = num(r.list) + ' 원';
  $('tSet').textContent = minus(r.setDisc);
  $('tEvent').textContent = minus(r.eventDisc);
  $('rowSpecial').hidden = !r.special;
  $('tSpecial').textContent = minus(r.special);
  $('tSupply').textContent = num(r.supply) + ' 원';
  $('tVat').textContent = num(r.vatAmount) + ' 원';
  $('tFinal').textContent = num(r.final);
  $('tTotal').textContent = `${num(r.total)} 원 (${r.months}개월)`;
  $('condList').innerHTML = r.conds.map(c => `<li>${esc(c)}</li>`).join('');

  const images = quoteImages(r);
  $('photoList').innerHTML = images.map(i => `
    <div class="photo"><div ${bg(i.url)}></div><p title="${esc(i.name)}">${esc(i.name)}</p>
      <button onclick="removeQuoteImage('${esc(i.url)}')" aria-label="사진 빼기">✕</button></div>`).join('')
    || '<p class="empty">장비를 선택하면 등록된 제품 사진이 여기에 표시됩니다.<br>사진이 없는 제품은 이미지 리스트에서 등록할 수 있습니다.</p>';
  $('imgReset').hidden = !quote.imgRemoved.length && !quote.imgExtra.length;
  $('notesReset').hidden = !quote.notes;
  $('editBanner').innerHTML = quote.editingId ? '<span class="badge yellow">저장된 견적 수정 중 · 저장하면 같은 링크에 덮어씁니다</span>' : '';
}

// ───────── 저장 / 완료 모달 ─────────
async function saveQuoteToServer() {
  const q = snapshot();
  if (!q.lines.length) return toast('장비를 먼저 선택하세요.', true);
  if (!q.customer && !confirm('고객명이 비어 있습니다. 그대로 저장할까요?')) return;
  const btn = $('saveBtn');
  btn.disabled = true; btn.textContent = '저장 중…';
  try {
    const image = await htmlToPng(renderOgCard(q), 1);
    const { qty, setChoice, special, specialMemo, months, notes, imgRemoved, imgExtra } = quote;
    const body = JSON.stringify({ quote: q, image, state: { qty, setChoice, special, specialMemo, months, notes, imgRemoved, imgExtra } });
    const { id } = quote.editingId
      ? await api('/api/quotes/' + quote.editingId, { method: 'PUT', body })
      : await api('/api/quotes', { method: 'POST', body });
    const wasEdit = !!quote.editingId;
    quote.editingId = id;
    saveQuote(); renderResult();
    showQuoteModal(id, q, wasEdit ? '견적서가 수정 되었습니다!' : '견적서 생성이 완료 되었습니다!', '저장된 견적서는 대시보드에서 확인할 수 있습니다.');
  } catch (e) {
    if (e.message !== 'unauthorized') toast('저장 실패: ' + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = '견적 저장하기';
  }
}

// 문자 내용: 기본 문구의 {칸}을 견적 내용으로 채운다
function fillMessage(q, url) {
  const items = q.lines.map(l => l.name + (l.qty > 1 ? ' ×' + l.qty : '')).join(', ');
  const values = { 고객명: q.customer || '고객', 상품구성: items, 월렌탈료: num(q.final), 담당자: q.staff || COMPANY.name, 링크: url };
  return (db.settings.message || '').replace(/\{(고객명|상품구성|월렌탈료|담당자|링크)\}/g, (_, k) => values[k]);
}

let modalQuote = null;   // 모달에 떠 있는 견적 (대시보드에서도 같이 씀)
function showQuoteModal(id, rawQuote, title, sub) {
  const q = normalizeQuote(rawQuote);
  const url = `${location.origin}/q/${id}`;
  modalQuote = q;
  openModal(`
    <h2>${esc(title)}</h2>
    <p>${esc(sub)}</p>
    <div class="modal-body">
      <div class="pager-wrap">
        <button class="page-arrow prev" onclick="modalPage(-1)" aria-label="이전 페이지">‹</button>
        <div id="modalSheet" class="sheet-fit paged">${renderSheet(q)}</div>
        <button class="page-arrow next" onclick="modalPage(1)" aria-label="다음 페이지">›</button>
      </div>
      <p class="page-count sub" id="modalPageCount"></p>
      <div class="modal-actions">
        <button class="btn" onclick="modalSaveImage(this)"><img src="/img/ui/save.svg" alt="">이미지 저장</button>
        <button class="btn" onclick="copyText($('modalMsg').value).then(() => toast('문자 내용을 복사했습니다.'))"><img src="/img/ui/copy.svg" alt="">내용 문자 복사</button>
        <button class="btn" onclick="copyText('${url}').then(() => toast('링크를 복사했습니다. 카톡·톡톡에 붙여넣으면 미리보기가 함께 나갑니다.'))"><img src="/img/ui/link.svg" alt="">URL 공유(카카오톡,톡톡 공유용)</button>
        <button class="btn" onclick="window.print()">인쇄 / PDF</button>
      </div>
      <textarea class="msg-edit" id="modalMsg" spellcheck="false"></textarea>
      <div class="url-row"><span>URL 링크 |</span><a href="${url}" target="_blank" rel="noopener">${url}</a></div>
    </div>`);
  $('modalMsg').value = fillMessage(q, url);
  fitSheets();
  modalPageNo = 0; modalPage(0);
}
// 견적서가 2장 이상이면 화살표로 한 장씩 넘겨 본다 (이미지 저장·인쇄는 항상 전체)
let modalPageNo = 0;
function modalPage(delta) {
  const pages = [...document.querySelectorAll('#modalSheet .sheet-page')];
  modalPageNo = Math.max(0, Math.min(pages.length - 1, modalPageNo + delta));
  pages.forEach((el, i) => el.classList.toggle('cur', i === modalPageNo));
  const many = pages.length > 1;
  document.querySelector('.page-arrow.prev').hidden = !many || modalPageNo === 0;
  document.querySelector('.page-arrow.next').hidden = !many || modalPageNo === pages.length - 1;
  $('modalPageCount').textContent = many ? `${modalPageNo + 1} / ${pages.length} 페이지` : '';
}
addEventListener('keydown', e => {
  if (!$('modalSheet') || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  if (e.key === 'ArrowLeft') modalPage(-1);
  if (e.key === 'ArrowRight') modalPage(1);
});

async function modalSaveImage(btn) {
  btn.disabled = true;
  try { await saveSheetImage(modalQuote); toast('견적서 이미지를 저장했습니다.'); }
  catch (e) { toast('이미지 저장 실패: ' + e.message, true); }
  btn.disabled = false;
}
