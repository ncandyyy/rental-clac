// 견적서 관리(메인): 장비 선택 → 견적 내역 → 저장 → 완료 모달

const emptyRecipient = () => ({ customer: '', name: '', phone: '' });   // 상호 / 고객 성함 / 연락처
const emptyQuote = () => ({
  recipients: [emptyRecipient()],   // 수신자가 여러 명이면 저장할 때 수신자마다 견적서를 따로 만들고 한 묶음으로 둔다
  date: today(), months: 36, staff: '', special: 0, specialMemo: '',
  qty: {}, setChoice: 'auto',
  manual: [],                     // 직접 작성한 줄 { key, label, name, unit, qty, uom, amount }
  order: [],                      // 견적 내역 줄 순서 (줄 key 목록)
  notes: null,                    // null이면 기본 참고사항 사용
  imgRemoved: [], imgExtra: [],   // 자동으로 불러온 사진 중 뺀 것 / 직접 올린 것
  editingId: null,                // 저장된(또는 임시저장한) 견적을 이어서 쓰는 중이면 그 id
  editingStatus: null,            // 그 견적의 상태: draft / done / sent
  groupId: null,                  // 여러 수신자로 함께 만든 견적 묶음
});
// 작성 중인 견적은 이 브라우저에 남기지 않는다. 새로고침하면 빈 화면이고, 이어서 쓰려면 임시저장한다.
let quote = emptyQuote();
const FOLD_KEY = 'rental-folds-v2';
const folds = { photos: false, notes: true, ...JSON.parse(localStorage.getItem(FOLD_KEY) || '{}') };   // 접힌 영역

const EDIT_WARNING = "기본 세트·상품 항목을 직접 수정하면 금액표 기준 금액(세트·이벤트 할인)과 달라질 수 있습니다.\n금액만 조정하려면 아래 '특별 할인' 항목을 활용해 주세요.\n\n그래도 이 항목을 직접 수정할까요?";

// ───────── 계산 ─────────
const units = s => Object.values(s.comp).reduce((a, b) => a + b, 0);
const maxOf = p => p?.max > 0 ? p.max : Infinity;
// 고른 장비 안에 구성이 전부 들어가는 세트 중, 가장 많이 덮는 것들만 (더 작은 세트는 보여주지 않는다)
function candidates() {
  const fits = db.sets.filter(s => units(s) > 0 && Object.entries(s.comp).every(([id, n]) => (quote.qty[id] || 0) >= n));
  const most = Math.max(0, ...fits.map(units));
  return fits.filter(s => units(s) === most);
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
// 고른 장비로 그 세트를 몇 벌 만들 수 있는지
const setCount = set => set ? Math.min(...Object.entries(set.comp).map(([id, n]) => Math.floor((quote.qty[id] || 0) / n))) : 0;

// set(없으면 null)을 적용했을 때의 견적. 세트에 안 들어간 장비는 추가 장비(단품 행사가), 직접 작성한 줄은 적은 금액 그대로.
function compute(set) {
  const lines = [], conds = [], autoImages = [];
  const addImage = (url, name) => { if (url && !autoImages.some(i => i.url === url)) autoImages.push({ url, name }); };
  const k = setCount(set);
  if (set && k) {
    const c = calcSet(set);
    lines.push({ key: 'set', kind: 'set', label: '세트 상품', name: set.name, qty: k, unit: c.list, uom: '세트',
      list: c.list * k, setDisc: c.setDisc * k, eventDisc: c.eventDisc * k, final: c.final * k });
    const note = [set.cond, set.check].filter(Boolean).join(' / ');
    if (note) conds.push(`${set.name} (${set.type}) : ${note}`);
    if (set.image) addImage(set.image, set.name);
    else for (const id of Object.keys(set.comp)) { const p = itemById(id); if (p) addImage(p.image, p.name); }
  }
  for (const p of db.items) {
    const n = (quote.qty[p.id] || 0) - (set && k ? set.comp[p.id] || 0 : 0) * k;
    if (n <= 0) continue;
    lines.push({ key: 'item:' + p.id, kind: 'item', itemId: p.id, label: p.category || '기타',
      name: p.name, qty: n, unit: p.price, uom: p.unit || '대', list: p.price * n, setDisc: 0, eventDisc: (p.price - p.sale) * n, final: p.sale * n });
    addImage(p.image, p.name);
  }
  for (const m of quote.manual) {
    const amount = Number(m.amount) || 0;
    lines.push({ key: m.key, kind: 'manual', label: m.label, name: m.name, qty: Number(m.qty) || 0, unit: Number(m.unit) || 0, uom: m.uom,
      list: amount, setDisc: 0, eventDisc: 0, final: amount });
  }
  // 직원이 정한 순서대로 (처음 나온 줄은 원래 순서대로 뒤에 붙는다)
  const pos = key => { const i = quote.order.indexOf(key); return i < 0 ? Infinity : i; };
  lines.sort((a, b) => pos(a.key) - pos(b.key));

  const sum = key => lines.reduce((a, l) => a + l[key], 0);
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
const current = () => compute(currentSet(candidates()));

// 견적서·고객 링크에 들어가는 내용 (사유 메모 같은 내부 정보는 넣지 않는다)
function snapshot(rcp = quote.recipients[0]) {
  const { autoImages, ...r } = current();
  r.lines = r.lines.map(({ key, itemId, ...l }) => l);
  return {
    customer: rcp.customer.trim(), name: rcp.name.trim(), phone: rcp.phone.trim(), date: quote.date, staff: quote.staff.trim() || COMPANY.name,
    ...r, notes: quoteNotes(), images: quoteImages({ autoImages }),
  };
}

// ───────── 화면 ─────────
PAGES.quote = function renderQuotePage() {
  $('page-quote').innerHTML = `
    <p class="greeting">${role === 'admin' ? '관리자' : '직원'}님, 반갑습니다.</p>
    <div class="basic card">
      <div class="row between">
        <p class="title">기본 정보 입력</p>
        <div class="row">
          <span id="editBanner"></span>
          <button class="btn white" onclick="openDrafts()">임시저장 불러오기</button>
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
      <div class="recips" id="recipList"></div>
    </div>

    <div class="cols">
      <div class="col-left">
        <p class="title">장비 선택</p>
        <div class="chip-list" id="chipList"></div>
      </div>

      <div class="col-right">
        <p class="title">견적 내역</p>
        <div id="setPick"></div>
        <div>
          <table class="qtable">
            <thead><tr><th class="mv"></th><th style="width:96px">항목</th><th>설명</th><th class="num" style="width:96px">단가</th><th style="width:118px">수량</th><th style="width:58px">단위</th><th class="num" style="width:104px">금액</th><th class="ac"></th></tr></thead>
            <tbody id="lineBody"></tbody>
          </table>
          <div class="row" style="padding:10px 0"><button class="btn" onclick="addManual()">+ 항목 직접 추가</button></div>
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
              <p class="sub">이미지 리스트에 등록된 제품 사진을<br>자동으로 불러옵니다.</p>
            </div>
            <div class="row">
              <button class="btn" onclick="addQuoteImage()">직접 등록하기</button>
              <button class="btn" id="imgReset" onclick="resetQuoteImages()" hidden>자동으로 되돌리기</button>
            </div>
          </div>
          <div class="panel"><div class="dropzone" id="photoList" tabindex="0" aria-label="제품 이미지 영역. 선택한 뒤 Ctrl+V로 붙여넣을 수 있습니다."></div></div>
        </div>

        <div class="card two" id="foldNotes">
          <button class="card-fold" onclick="toggleFold('notes')" aria-label="접기/펴기"><img src="/img/ui/chevron-down.svg" alt="" width="18" height="18"></button>
          <div class="lead">
            <div>
              <p class="title">참고 사항(안내사항)</p>
              <p class="sub">내용을 고친 뒤 등록을 누르면<br>이 견적서에 적용됩니다.<br>한 줄에 한 항목씩 적어주세요.</p>
            </div>
            <div class="row">
              <button class="btn" onclick="applyNotes()">등록</button>
              <button class="btn" id="notesReset" onclick="resetNotes()" hidden>기본값으로</button>
            </div>
          </div>
          <div class="panel"><textarea class="notes-edit" id="qNotes"></textarea></div>
        </div>

        <div class="save-row">
          <button class="btn-big light" id="draftBtn" onclick="saveQuoteToServer(true)">임시저장</button>
          <button class="btn-big" id="saveBtn" onclick="saveQuoteToServer()">견적 저장하기</button>
        </div>
      </div>
    </div>`;
  $('qNotes').value = quoteNotes().join('\n');
  renderRecipients();
  setupLineDrag();
  renderPicks();
};

function setInfo(field, value) { quote[field] = value; renderTotals(); }
function toggleFold(name) { folds[name] = !folds[name]; localStorage.setItem(FOLD_KEY, JSON.stringify(folds)); applyFolds(); }
function applyFolds() {
  $('foldPhotos').classList.toggle('closed', folds.photos);
  $('foldNotes').classList.toggle('closed', folds.notes);
}

// ───────── 수신자 (상호 / 고객 성함 / 연락처, + 로 추가) ─────────
function renderRecipients() {
  const many = quote.recipients.length > 1;
  $('recipList').innerHTML = quote.recipients.map((r, i) => `
    <div class="recip">
      ${many ? `<span class="badge">수신자 ${i + 1}</span>` : ''}
      <label class="field">상호 <input placeholder="입력" value="${esc(r.customer)}" oninput="setRecipient(${i}, 'customer', this.value)"></label>
      <label class="field">고객 성함 <input placeholder="입력" value="${esc(r.name)}" oninput="setRecipient(${i}, 'name', this.value)"></label>
      <label class="field">연락처 <input placeholder="숫자만 입력" inputmode="tel" maxlength="13" value="${esc(r.phone)}" oninput="this.value = formatPhone(this.value); setRecipient(${i}, 'phone', this.value)"></label>
      ${i === 0
        ? `<button class="btn icon" onclick="addRecipient()" title="수신자 추가" aria-label="수신자 추가">${ICON.plus(18)}</button>`
        : `<button class="btn icon" onclick="removeRecipient(${i})" title="이 수신자 빼기" aria-label="수신자 빼기">${ICON.x(18)}</button>`}
    </div>`).join('');
}
function setRecipient(i, field, value) { quote.recipients[i][field] = value; }
function addRecipient() {
  if (quote.recipients.length >= 10) return toast('수신자는 한 번에 10명까지 넣을 수 있습니다.', true);
  quote.recipients.push(emptyRecipient()); renderRecipients();
}
function removeRecipient(i) { quote.recipients.splice(i, 1); renderRecipients(); }

// ───────── 장비 선택 (칩) ─────────
function setQty(id, n) {
  const p = itemById(id);
  n = Math.max(0, Math.min(maxOf(p), Math.floor(Number(n)) || 0));
  if (Number.isFinite(maxOf(p)) && n === maxOf(p) && (quote.qty[id] || 0) < n) toast(`${p.name}은(는) 최대 ${p.max}${p.unit || '대'}까지 넣을 수 있습니다.`);
  if (n) quote.qty[id] = n; else delete quote.qty[id];
}
function toggleItem(id) { setQty(id, quote.qty[id] ? 0 : 1); renderPicks(); }
function chooseSet(value) {
  quote.setChoice = value === 'auto' || value === 'none' ? value : Number(value);
  renderResult();
}
function newQuote() {
  const hasContent = Object.keys(quote.qty).length || quote.manual.length || quote.recipients.some(r => r.customer || r.name || r.phone);
  if (hasContent && !confirm('작성 중인 내용을 지우고 새 견적을 시작할까요?')) return;
  quote = emptyQuote();
  PAGES.quote();
}
function renderPicks() {
  $('chipList').innerHTML = itemsByCategory().map(([cat, items]) => `
    <div class="chip-group">
      <p>${esc(cat)}</p>
      <div class="chips">${items.map(p => {
        const n = quote.qty[p.id] || 0;
        return `<button class="chip ${n ? 'on' : ''}" onclick="toggleItem(${p.id})"><span><b>${esc(p.name)}</b>(${won(p.price)})${n > 1 ? ' ×' + n : ''}</span>${n ? '<img src="/img/ui/x.svg" alt="빼기">' : ''}</button>`;
      }).join('')}</div>
    </div>`).join('');
  renderResult();
}

// ───────── 견적 내역 ─────────
function renderResult() {
  const cands = candidates();
  if (typeof quote.setChoice === 'number' && !cands.some(s => s.id === quote.setChoice)) quote.setChoice = 'auto';
  const auto = autoSet(cands), set = currentSet(cands);
  const r = compute(set);

  const opt = (value, checked, label) =>
    `<label class="${checked ? 'sel' : ''}"><input type="radio" name="setChoice" ${checked ? 'checked' : ''} onchange="chooseSet('${value}')"><span>${label}</span></label>`;
  $('setPick').innerHTML = !cands.length ? '' : `
    <div class="setpick">
      <span><b class="label">적용 세트 :</b> <span class="sub">같은 구성에 세트가 여러 개면 직접 고를 수 있습니다.</span></span>
      ${cands.map(s => opt(s.id, set === s,
        `<b>${esc(s.name)}</b> · ${s.type} · 월 ${won(compute(s).final)}` +
        (s === auto ? ' <span class="badge">자동 적용</span>' : '') +
        (s.cond ? ` <span class="badge red">${esc(s.cond)}</span>` : ''))).join('')}
      ${opt('none', !set, `세트 미적용 (단품 합계) · 월 ${won(compute(null).final)}`)}
    </div>`;

  const qtyCell = (l, onSet) => `
    <div class="qstep">
      <button onclick="${onSet}(${l.qty - 1})" aria-label="빼기">−</button>
      <input type="number" min="0" value="${l.qty}" onchange="${onSet}(this.value)" onkeydown="if (event.key === 'Enter') this.blur()">
      <button onclick="${onSet}(${l.qty + 1})" aria-label="더하기">＋</button>
    </div>`;
  $('lineBody').innerHTML = r.lines.map((l, i) => {
    const k = esc(l.key);
    const move = `<td class="mv"><span class="grip" title="끌어서 순서 바꾸기" aria-label="끌어서 순서 바꾸기">⋮⋮</span></td>`;
    if (l.kind === 'manual') {
      const m = quote.manual.find(x => x.key === l.key);
      return `<tr class="manual" data-key="${k}">${move}
        <td><select class="cell" onchange="editManual('${k}', 'label', this)">${m.label ? '' : '<option value="" selected>선택</option>'}${categoryOptions(m.label)}</select></td>
        <td><input class="cell" value="${esc(m.name)}" placeholder="설명" oninput="editManual('${k}', 'name', this)"></td>
        <td><input class="cell num" type="number" min="0" value="${m.unit || ''}" placeholder="0" oninput="editManual('${k}', 'unit', this)"></td>
        <td>${qtyCell(l, `setManualQty.bind(null, '${k}')`)}</td>
        <td><input class="cell" value="${esc(m.uom)}" placeholder="개" oninput="editManual('${k}', 'uom', this)"></td>
        <td><input class="cell num" type="number" value="${m.amount || ''}" placeholder="0" data-amount oninput="editManual('${k}', 'amount', this)"></td>
        <td class="ac"><button onclick="removeLine('${k}')" title="줄 삭제" aria-label="줄 삭제">${ICON.x(15)}</button></td>
      </tr>`;
    }
    const setter = l.kind === 'set' ? 'setSetQty' : `setItemQty.bind(null, ${l.itemId})`;
    return `<tr data-key="${k}">${move}
      <td>${esc(l.label)}</td>
      <td>${esc(l.name)}${l.kind === 'set' ? `<small>세트가 ${won(l.final / l.qty)}</small>` : (l.eventDisc ? `<small>행사가 ${won(l.final / l.qty)}</small>` : '')}</td>
      <td class="num">${num(l.unit)}</td>
      <td>${qtyCell(l, setter)}</td>
      <td>${esc(l.uom)}</td>
      <td class="num">${num(l.list)} 원</td>
      <td class="ac"><button onclick="convertLine('${k}')" title="직접 수정" aria-label="직접 수정">${ICON.edit(15)}</button><button onclick="removeLine('${k}')" title="줄 삭제" aria-label="줄 삭제">${ICON.x(15)}</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" class="empty">왼쪽에서 장비를 선택하거나 항목을 직접 추가하세요.</td></tr>';
  renderTotals(r);
}

// 합계·사진 영역만 다시 그린다 (직접 작성 칸을 입력하는 중에도 커서가 유지되도록)
function renderTotals(r = current()) {
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
      <button onclick="removeQuoteImage('${esc(i.url)}')" title="사진 빼기" aria-label="사진 빼기">${ICON.x(12)}</button></div>`).join('')
    || `<div class="empty">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>
        <b>사진을 여기로 드래그 앤 드롭</b>
        <span>이 상자를 클릭한 뒤 Ctrl+V로 복사한 이미지를 붙여넣을 수 있습니다.</span>
        <span>장비를 선택하면 등록된 제품 사진이 자동으로 들어옵니다.</span>
      </div>`;
  $('photoList').classList.toggle('is-empty', !images.length);
  $('imgReset').hidden = !quote.imgRemoved.length && !quote.imgExtra.length;
  $('notesReset').hidden = !quote.notes;
  applyFolds();
  $('editBanner').innerHTML = !quote.editingId ? '' : quote.editingStatus === 'draft'
    ? '<span class="badge yellow">임시저장한 견적을 이어서 작성 중</span>'
    : '<span class="badge yellow">저장된 견적 수정 중 · 저장하면 같은 링크에 덮어씁니다</span>';
}

// 세트 줄 수량: 세트 구성 장비를 세트 수만큼 늘리거나 줄인다
function setSetQty(n) {
  const set = currentSet(candidates());
  if (!set) return;
  const delta = Math.max(0, Math.floor(Number(n)) || 0) - setCount(set);
  for (const [id, c] of Object.entries(set.comp)) setQty(id, (quote.qty[id] || 0) + c * delta);
  renderPicks();
}
// 추가 장비 줄 수량: 세트에 들어간 대수는 그대로 두고 남는 대수만 바꾼다
function setItemQty(id, n) {
  const set = currentSet(candidates());
  const inSet = (set?.comp[id] || 0) * setCount(set);
  setQty(id, inSet + Math.max(0, Math.floor(Number(n)) || 0));
  renderPicks();
}
function setManualQty(key, n) {
  const m = quote.manual.find(x => x.key === key);
  m.qty = Math.max(0, Math.floor(Number(n)) || 0);
  m.amount = (Number(m.unit) || 0) * m.qty;
  renderResult();
}
function editManual(key, field, el) {
  const m = quote.manual.find(x => x.key === key);
  if (['unit', 'amount'].includes(field)) m[field] = Number(el.value) || 0; else m[field] = el.value;
  if (field === 'unit') {   // 단가를 바꾸면 금액 = 단가 × 수량 (금액 칸은 따로 고칠 수도 있다)
    m.amount = m.unit * (Number(m.qty) || 0);
    el.closest('tr').querySelector('[data-amount]').value = m.amount || '';
  }
  renderTotals();
}
function addManual() {
  const key = 'm' + Date.now().toString(36);
  quote.manual.push({ key, label: '기타', name: '', unit: 0, qty: 1, uom: '개', amount: 0 });
  renderResult();
  document.querySelector(`#lineBody tr[data-key="${key}"] input`)?.focus();
}
// 기본 세트·상품 줄을 직접 작성 줄로 바꾼다 (지금 금액은 그대로 옮긴다)
function convertLine(key) {
  const l = current().lines.find(x => x.key === key);
  if (!l || !confirm(EDIT_WARNING)) return;
  const m = { key: 'm' + Date.now().toString(36), label: l.label, name: l.name, unit: l.qty ? Math.round(l.final / l.qty) : 0, qty: l.qty, uom: l.uom, amount: l.final };
  const order = current().lines.map(x => x.key);
  order[order.indexOf(key)] = m.key;
  quote.order = order;
  quote.manual.push(m);
  if (l.kind === 'set') {
    const set = currentSet(candidates()), k = setCount(set);
    for (const [id, c] of Object.entries(set.comp)) setQty(id, (quote.qty[id] || 0) - c * k);
  } else setQty(l.itemId, (quote.qty[l.itemId] || 0) - l.qty);
  renderPicks();
}
function removeLine(key) {
  if (key.startsWith('m')) quote.manual = quote.manual.filter(m => m.key !== key);
  else if (key === 'set') return setSetQty(0);
  else return setItemQty(Number(key.split(':')[1]), 0);
  renderResult();
}
// 줄 왼쪽 손잡이(⋮⋮)를 끌어서 순서를 바꾼다
function setupLineDrag() {
  const body = $('lineBody');
  let dragKey = null;
  const clearMarks = () => body.querySelectorAll('.drop-before, .drop-after, .dragging').forEach(tr => tr.classList.remove('drop-before', 'drop-after', 'dragging'));
  const target = e => {
    const tr = e.target.closest('tr[data-key]');
    if (!tr || tr.dataset.key === dragKey) return null;
    const box = tr.getBoundingClientRect();
    return { tr, after: e.clientY > box.top + box.height / 2 };
  };
  body.addEventListener('mousedown', e => { const grip = e.target.closest('.grip'); if (grip) grip.closest('tr').draggable = true; });
  body.addEventListener('dragstart', e => {
    const tr = e.target.closest('tr[data-key]');
    if (!tr?.draggable) return;
    dragKey = tr.dataset.key;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragKey);
    tr.classList.add('dragging');
  });
  body.addEventListener('dragover', e => {
    if (!dragKey) return;
    e.preventDefault();
    body.querySelectorAll('.drop-before, .drop-after').forEach(tr => tr.classList.remove('drop-before', 'drop-after'));
    const t = target(e);
    if (t) t.tr.classList.add(t.after ? 'drop-after' : 'drop-before');
  });
  body.addEventListener('drop', e => {
    if (!dragKey) return;
    e.preventDefault();
    const t = target(e);
    if (t) {
      const order = current().lines.map(x => x.key).filter(k => k !== dragKey);
      order.splice(order.indexOf(t.tr.dataset.key) + (t.after ? 1 : 0), 0, dragKey);
      quote.order = order;
    }
    dragKey = null;
    renderResult();
  });
  body.addEventListener('dragend', () => {
    dragKey = null; clearMarks();
    body.querySelectorAll('tr[draggable]').forEach(tr => tr.removeAttribute('draggable'));
  });
}

function applySpecial() {
  quote.special = Math.max(0, Number($('qSpecial').value) || 0);
  quote.specialMemo = $('qSpecialMemo').value;
  renderTotals();
  toast(quote.special ? `특별 할인 ${won(quote.special)}을 적용했습니다.` : '특별 할인을 해제했습니다.');
}
function applyNotes() {
  quote.notes = $('qNotes').value.split('\n').map(s => s.trim()).filter(Boolean);
  renderTotals();
  toast('참고사항을 이 견적에 적용했습니다.');
}
function resetNotes() {
  quote.notes = null; $('qNotes').value = quoteNotes().join('\n');
  renderTotals();
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
    renderTotals(); toast(`이미지 ${files.length}장을 추가했습니다.`);
  } catch (e) { if (e.message !== 'unauthorized') toast('이미지 올리기 실패: ' + e.message, true); }
}
function removeQuoteImage(url) {
  if (quote.imgExtra.some(i => i.url === url)) quote.imgExtra = quote.imgExtra.filter(i => i.url !== url);
  else quote.imgRemoved.push(url);
  renderTotals();
}
function resetQuoteImages() { quote.imgRemoved = []; quote.imgExtra = []; renderTotals(); }

// ───────── 임시저장 / 저장 / 완료 모달 ─────────
const stateOf = recipients => {
  const { qty, setChoice, special, specialMemo, months, notes, imgRemoved, imgExtra, manual, order, groupId } = quote;
  return { qty, setChoice, special, specialMemo, months, notes, imgRemoved, imgExtra, manual, order, groupId, recipients };
};
const hasWho = r => r.customer.trim() || r.name.trim();

// asDraft: 임시저장(작성중). 아니면 작성완료로 저장하고 완료 모달을 띄운다.
// 수신자가 여러 명이면 수신자마다 견적서를 하나씩 만들고 같은 묶음(groupId)으로 저장한다.
// 어느 쪽이든 저장한 뒤에는 화면을 비워서 다음 사람이 새로 쓸 수 있게 한다.
async function saveQuoteToServer(asDraft) {
  const recips = quote.recipients.filter((r, i) => i === 0 || r.customer || r.name || r.phone);
  const first = snapshot(recips[0]);
  if (!asDraft && !first.lines.length) return toast('장비를 선택하거나 항목을 직접 추가하세요.', true);
  if (asDraft && !first.lines.length && !recips.some(r => r.customer || r.name || r.phone)) return toast('임시저장할 내용이 없습니다. 고객 정보나 장비를 먼저 입력하세요.', true);
  if (!asDraft && recips.some(r => !hasWho(r)) && !confirm('상호나 고객 성함이 비어 있는 수신자가 있습니다. 그대로 저장할까요?')) return;
  for (const b of [$('saveBtn'), $('draftBtn')]) b.disabled = true;
  try {
    const wasDone = quote.editingId && quote.editingStatus !== 'draft';
    if (asDraft) {
      const body = JSON.stringify({ quote: first, status: 'draft', state: stateOf(recips), groupId: quote.groupId });
      if (quote.editingId) await api('/api/quotes/' + quote.editingId, { method: 'PUT', body });
      else await api('/api/quotes', { method: 'POST', body });
    } else {
      if (recips.length > 1 && !quote.groupId) quote.groupId = 'g' + Math.random().toString(36).slice(2, 12);
      const saved = [];
      for (const [i, r] of recips.entries()) {
        const q = snapshot(r);
        const image = await htmlToPng(renderOgCard(q), 1);
        const body = JSON.stringify({ quote: q, image, status: 'done', state: stateOf([r]), groupId: quote.groupId });
        const { id } = i === 0 && quote.editingId
          ? await api('/api/quotes/' + quote.editingId, { method: 'PUT', body })
          : await api('/api/quotes', { method: 'POST', body });
        saved.push({ id, q });
      }
      showQuoteModal(saved, saved.length > 1 ? `견적서 ${saved.length}건 생성이 완료 되었습니다!` : wasDone ? '견적서가 수정 되었습니다!' : '견적서 생성이 완료 되었습니다!',
        saved.length > 1 ? '수신자별로 따로 저장되었습니다. 대시보드에서 하나씩 수정할 수 있습니다.' : '저장된 견적서는 대시보드에서 확인할 수 있습니다.');
    }
    quote = emptyQuote();
    PAGES.quote();
    if (asDraft) toast('임시저장했습니다. "임시저장 불러오기"나 대시보드에서 이어서 작성할 수 있습니다.');
  } catch (e) {
    if (e.message !== 'unauthorized') toast('저장 실패: ' + e.message, true);
  } finally {
    for (const b of [$('saveBtn'), $('draftBtn')]) if (b) b.disabled = false;
  }
}

// 저장된 견적(임시저장 포함)을 불러와 이어서 쓴다. 저장하면 같은 견적에 덮어쓴다.
async function loadQuote(id) {
  try {
    const { quote: q, state, status } = await api('/api/quotes/' + id);
    if (!state) return toast('이 견적은 예전 방식으로 저장되어 수정할 수 없습니다. 보기만 가능합니다.', true);
    const recipients = status === 'draft' && state.recipients?.length
      ? state.recipients.map(r => ({ ...emptyRecipient(), ...r }))
      : [{ customer: q.customer || '', name: q.name || '', phone: q.phone || '' }];
    quote = { ...emptyQuote(), ...state, recipients, date: q.date || today(), staff: q.staff === COMPANY.name ? '' : q.staff, editingId: id, editingStatus: status };
    closeModal(); showPage('quote');
    toast('견적을 불러왔습니다. 금액은 현재 금액표 기준으로 다시 계산됩니다.');
  } catch (e) { if (e.message !== 'unauthorized') toast('불러오기 실패: ' + e.message, true); }
}
const whoLabel = s => [s.customer, s.name].filter(Boolean).join(' · ');
// 임시저장 불러오기: 작성 중인 견적 목록에서 고른다
async function openDrafts() {
  let drafts;
  try { drafts = (await api('/api/quotes')).quotes.filter(s => s.status === 'draft'); }
  catch (e) { if (e.message !== 'unauthorized') toast('불러오기 실패: ' + e.message, true); return; }
  const when = s => new Date(s.updatedAt || s.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  openModal(`
    <h2 style="font-size:20px">임시저장 불러오기</h2>
    <p>작성 중이던 견적을 고르면 이어서 작성할 수 있습니다.</p>
    <div class="draft-list">
      ${drafts.map(s => `
        <button class="draft" onclick="loadQuote('${s.id}')">
          <span><b>${esc(whoLabel(s) || '(고객명 없음)')}</b> <span class="sub">담당자 ${esc(s.staff || COMPANY.name)} · ${when(s)} 저장</span></span>
          <span class="sub">${esc(s.items || '선택한 장비 없음')}</span>
        </button>`).join('') || '<p class="sub" style="padding:24px 0; text-align:center">임시저장한 견적이 없습니다.</p>'}
    </div>`, true);
}

// 문자에 들어가는 담당자 이름 (비워 두면 '페이앤밴 담당자 드림'이 되도록)
const staffName = q => q.staff && q.staff !== COMPANY.name ? q.staff : '담당자';
// 문자 내용: 기본 문구의 {칸}을 견적 내용으로 채운다
function fillMessage(q, url) {
  const items = q.lines.map(l => l.name + (l.qty > 1 ? ' ×' + l.qty : '')).join(', ');
  const values = { 고객명: whoOf(q), 상호: q.customer || '', 성함: q.name || '', 상품구성: items, 월렌탈료: num(q.final), 담당자: staffName(q), 링크: url };
  return (db.settings.message || '').replace(/\{(고객명|상호|성함|상품구성|월렌탈료|담당자|링크)\}/g, (_, k) => values[k]);
}

// 완료·보기 모달. list = [{ id, q }] (여러 수신자로 만든 묶음이면 탭으로 넘겨 본다)
// 묶음 문자: 견적마다 달라지는 줄({상품구성} {월렌탈료} {링크}가 든 줄)을 견적 수만큼 반복한다
function fillGroupMessage(list) {
  const tpl = (db.settings.message || '').split('\n');
  const perQuote = /\{(상품구성|월렌탈료|링크|상호)\}/;
  const idx = tpl.map((l, i) => perQuote.test(l) ? i : -1).filter(i => i >= 0);
  const fillOne = (text, x) => {
    const items = x.q.lines.map(l => l.name + (l.qty > 1 ? ' ×' + l.qty : '')).join(', ');
    const v = { 고객명: whoOf(x.q), 상호: x.q.customer || '', 성함: x.q.name || '', 상품구성: items, 월렌탈료: num(x.q.final), 담당자: staffName(x.q), 링크: modalUrl(x.id) };
    return text.replace(/\{(고객명|상호|성함|상품구성|월렌탈료|담당자|링크)\}/g, (_, k) => v[k]);
  };
  if (!idx.length) return fillOne(tpl.join('\n'), list[0]) + '\n\n' + list.map(x => `[${whoLabel(x.q) || '견적서'}] ${modalUrl(x.id)}`).join('\n');
  const a = idx[0], b = idx[idx.length - 1];
  const block = tpl.slice(a, b + 1).join('\n');
  const blocks = list.map(x => `[${x.q.customer || x.q.name || '견적서'}]\n` + fillOne(block, x)).join('\n\n');
  return [fillOne(tpl.slice(0, a).join('\n'), list[0]), blocks, fillOne(tpl.slice(b + 1).join('\n'), list[0])].join('\n');
}

let modalList = [], modalIdx = 0;
const modalUrl = id => `${location.origin}/q/${id}`;
function showQuoteModal(list, title, sub, start = 0) {
  modalList = list.map(x => ({ id: x.id, q: normalizeQuote(x.q) }));
  modalIdx = 0;
  const many = modalList.length > 1;
  openModal(`
    <h2>${esc(title)}</h2>
    <p>${esc(sub)}</p>
    <div class="modal-body">
      ${many ? `<div class="tabs modal-tabs" id="modalTabs"></div>` : ''}
      <div class="pager-wrap">
        <button class="page-arrow prev" onclick="modalPage(-1)" aria-label="이전 페이지">‹</button>
        <div id="modalSheet" class="sheet-fit paged"></div>
        <button class="page-arrow next" onclick="modalPage(1)" aria-label="다음 페이지">›</button>
      </div>
      <p class="page-count sub" id="modalPageCount"></p>
      <div class="modal-actions">
        <button class="btn" onclick="modalSaveImage(this)"><img src="/img/ui/save.svg" alt="">이미지 저장</button>
        <button class="btn" onclick="copyText($('modalMsg').value).then(async () => { toast('문자 내용을 복사했습니다.'); for (const { id } of modalList) await markSent(id); })"><img src="/img/ui/copy.svg" alt="">내용 문자 복사</button>
        <button class="btn" onclick="copyText(modalUrl(modalList[modalIdx].id)).then(() => { toast('링크를 복사했습니다. 카톡·톡톡에 붙여넣으면 미리보기가 함께 나갑니다.'); markSent(); })"><img src="/img/ui/link.svg" alt="">URL 공유(카카오톡,톡톡 공유용)</button>
        ${many ? `<button class="btn" onclick="copyAllLinks()"><img src="/img/ui/link.svg" alt="">전체 링크 한번에 복사</button>` : ''}
        <button class="btn" onclick="window.print()">인쇄 / PDF</button>
      </div>
      <textarea class="msg-edit" id="modalMsg" spellcheck="false"></textarea>
      <div class="url-row"><span>URL 링크 |</span><a id="modalUrl" target="_blank" rel="noopener"></a></div>
    </div>`);
  // 문자 내용은 묶음 전체를 한 번에 담는다 (탭을 바꿔도 고친 문자는 그대로)
  $('modalMsg').value = many ? fillGroupMessage(modalList) : fillMessage(modalList[0].q, modalUrl(modalList[0].id));
  showModalQuote(start);
}
function showModalQuote(i) {
  modalIdx = i;
  const { id, q } = modalList[i];
  if ($('modalTabs')) $('modalTabs').innerHTML = modalList.map((x, j) =>
    `<button class="${j === i ? 'on' : ''}" onclick="showModalQuote(${j})">${esc(whoLabel(x.q) || '수신자 ' + (j + 1))}</button>`).join('');
  $('modalSheet').innerHTML = renderSheet(q);
  layoutSheets($('modalSheet'));
  fitSheets();
  modalPageNo = 0; modalPage(0);
  $('modalUrl').href = $('modalUrl').textContent = modalUrl(id);
}
async function copyAllLinks() {
  await copyText(modalList.map(({ id, q }) => `${whoLabel(q) || '견적서'} : ${modalUrl(id)}`).join('\n'));
  toast(`링크 ${modalList.length}개를 복사했습니다.`);
  for (const { id } of modalList) await markSent(id);
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

// 링크나 문자를 복사하면 고객에게 전달한 것으로 보고 상태를 '전달'로 바꾼다
async function markSent(id = modalList[modalIdx]?.id) {
  if (!id) return;
  try {
    await api('/api/quotes/' + id, { method: 'PATCH', body: JSON.stringify({ status: 'sent' }) });
    const row = dashQuotes.find(s => s.id === id);
    if (row && row.status !== 'sent') { row.status = 'sent'; if (!$('page-dash').hidden) renderDash(); }
  } catch { /* 상태 표시만 못 바꾼 것이므로 복사는 그대로 둔다 */ }
}

async function modalSaveImage(btn) {
  btn.disabled = true;
  try { await saveSheetImage(modalList[modalIdx].q); toast('견적서 이미지를 저장했습니다.'); }
  catch (e) { toast('이미지 저장 실패: ' + e.message, true); }
  btn.disabled = false;
}
