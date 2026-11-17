// 제품 금액 관리: 단품가 · 세트가 · 기본 문구

const priceView = { group: '', text: '', open: null };   // 세트 목록 필터 / 펼친 세트 id

PAGES.price = function renderPricePage() {
  $('page-price').innerHTML = `
    <div class="page-head">
      <div><p class="title">제품 금액 관리</p><p class="sub" style="margin-top:8px">칸을 고치면 바로 저장되고 모든 직원의 견적 화면에 반영됩니다. 금액은 월 렌탈료(VAT 별도)입니다.</p></div>
      <div class="row">
        <span class="save-state sub"></span>
        <button class="btn white" onclick="exportDb()">내보내기</button>
        <button class="btn white" onclick="importDb()">가져오기</button>
        <button class="btn white danger" onclick="resetDb()">기준표로 초기화</button>
      </div>
    </div>

    <div class="row between"><p class="title">단품가</p><button class="btn dark" onclick="addItem()">+ 단품 추가</button></div>
    <p class="sub" style="margin:8px 0 12px">세트의 정상가 합계와 세트 밖 추가 장비 계산에 쓰입니다. <span class="badge yellow">노란 줄</span>은 임시값이라 확정이 필요한 품목입니다.</p>
    <div class="table-card">
      <table class="list">
        <thead><tr><th></th><th>품목</th><th>분류</th><th class="num">정상가</th><th class="num">행사가</th><th class="num">행사 할인</th><th>확정 필요</th><th>비고</th><th></th></tr></thead>
        <tbody id="itemBody"></tbody>
      </table>
    </div>

    <div class="section">
      <div class="row between"><p class="title">세트가</p><button class="btn dark" onclick="addSet()">+ 세트 추가</button></div>
      <p class="sub" style="margin:8px 0 12px">세트 할인가와 행사가만 넣으면 됩니다(VAT 별도 금액). 행사가가 있으면 행사가, 없으면 세트 할인가에 부가세 10%를 더한 금액이 최종입니다. 무상렌탈은 세트 할인가 0원.</p>
      <div class="row" style="margin-bottom:12px">
        <div class="tabs" id="setTabs"></div>
        <input class="input" style="width:220px" placeholder="세트 이름 검색" value="${esc(priceView.text)}" oninput="priceView.text = this.value; renderSets()">
      </div>
      <div class="table-card">
        <table class="list">
          <thead><tr><th>No</th><th>상품 구성</th><th>유형</th><th class="num">세트 할인가</th><th class="num">행사가</th><th class="num">최종(VAT 포함)</th><th></th></tr></thead>
          <tbody id="setBody"></tbody>
        </table>
      </div>
    </div>

    <div class="section settings">
      <p class="title">기본 문구</p>
      <p class="sub" style="margin:8px 0 12px">견적을 새로 만들 때 기본으로 들어가는 내용입니다. 견적마다 따로 고칠 수도 있습니다.</p>
      <div class="card" style="display:grid; grid-template-columns:1fr 1fr; gap:16px 24px">
        <label><b class="label">참고사항 :</b> <span class="sub">한 줄에 한 항목</span>
          <textarea style="margin-top:8px" oninput="editSetting('notes', this.value)">${esc(db.settings.notes.join('\n'))}</textarea></label>
        <label><b class="label">담당자 목록 :</b> <span class="sub">한 줄에 한 명 · 견적 담당자 칸 자동완성</span>
          <textarea style="margin-top:8px" placeholder="예) 김다은" oninput="editSetting('staff', this.value)">${esc((db.settings.staff || []).join('\n'))}</textarea></label>
        <label style="grid-column:1 / -1"><b class="label">문자 내용 :</b> <span class="sub">{고객명} {상호} {성함} {상품구성} {월렌탈료} {담당자} {링크} 자리에 견적 내용이 자동으로 들어갑니다.</span>
          <textarea style="margin-top:8px; min-height:280px" oninput="editSetting('message', this.value)">${esc(db.settings.message)}</textarea></label>
      </div>
    </div>`;
  renderItems(); renderSets();
};

// ───────── 단품가 ─────────
function renderItems() {
  $('itemBody').innerHTML = itemsByCategory().flatMap(([, items]) => items).map(p => `
    <tr id="item-${p.id}" class="${p.tbd ? 'tbd' : ''}">
      <td><div class="thumb ${p.image ? 'has' : ''}" style="width:32px; height:32px" ${bg(p.image)}></div></td>
      <td><input class="input" style="min-width:200px" value="${esc(p.name)}" oninput="editItem(${p.id}, 'name', this)"></td>
      <td><select class="input" style="width:130px" onchange="editItem(${p.id}, 'category', this); renderItems()">${categoryOptions(p.category)}</select></td>
      <td class="num"><input class="input num" type="number" min="0" step="1000" value="${p.price}" oninput="editItem(${p.id}, 'price', this)"></td>
      <td class="num"><input class="input num" type="number" min="0" step="1000" value="${p.sale}" oninput="editItem(${p.id}, 'sale', this)"></td>
      <td class="num calc" id="item-disc-${p.id}">${won(p.price - p.sale)}</td>
      <td><input type="checkbox" ${p.tbd ? 'checked' : ''} onchange="editItem(${p.id}, 'tbd', this)"></td>
      <td><input class="input" style="min-width:180px" value="${esc(p.memo)}" oninput="editItem(${p.id}, 'memo', this)"></td>
      <td class="acts"><button class="btn danger" onclick="removeItem(${p.id})">삭제</button></td>
    </tr>`).join('');
}
function editItem(id, field, el) {
  const p = itemById(id);
  if (field === 'tbd') { p.tbd = el.checked; $('item-' + id).className = p.tbd ? 'tbd' : ''; }
  else if (field === 'price' || field === 'sale') p[field] = Number(el.value) || 0;
  else p[field] = el.value;
  $('item-disc-' + id).textContent = won(p.price - p.sale);
  saveDb();
  if (field === 'name') renderSets();
}
function addItem() {
  db.items.push({ id: nextId(db.items), name: '', category: '기타', price: 0, sale: 0, tbd: false, memo: '', image: '', unit: '대', max: 0 });
  saveDb(); renderItems();
}
function removeItem(id) {
  const used = db.sets.filter(s => s.comp[id]).length;
  if (!confirm(used ? `이 단품은 세트 ${used}개의 구성에 들어 있습니다. 삭제하면 구성에서도 빠집니다. 삭제할까요?` : '이 단품을 삭제할까요?')) return;
  db.items = db.items.filter(p => p.id !== id);
  db.sets.forEach(s => delete s.comp[id]);
  delete quote.qty[id];
  saveDb(); renderItems(); renderSets();
}

// ───────── 세트가 ─────────
// 최종 = 행사가(없으면 세트 할인가)에 부가세 10%를 더한 금액
const setFinalVat = s => won(Math.round(calcSet(s).final * 1.1));
function setCalcCells(s) {
  return `
    <td class="num"><input class="input num" type="number" min="0" step="1000" value="${s.price}" oninput="editSet(${s.id}, 'price', this)"></td>
    <td class="num"><input class="input num" type="number" min="0" step="1000" value="${s.sale ?? ''}" placeholder="없음" oninput="editSet(${s.id}, 'sale', this)"></td>
    <td class="num" data-k="final"><b>${setFinalVat(s)}</b></td>`;
}
function renderSets() {
  const groups = [...new Set(db.sets.map(s => s.group || '기타'))];
  $('setTabs').innerHTML = ['', ...groups].map(g =>
    `<button class="${priceView.group === g ? 'on' : ''}" onclick="priceView.group = '${esc(g)}'; renderSets()">${esc(g || '전체')}</button>`).join('');
  const text = priceView.text.trim().toLowerCase();
  $('setBody').innerHTML = db.sets.map((s, i) => {
    if (s.id !== priceView.open && ((priceView.group && (s.group || '기타') !== priceView.group) || (text && !s.name.toLowerCase().includes(text)))) return '';
    const open = priceView.open === s.id;
    return `
    <tr id="set-${s.id}">
      <td>${i + 1}</td>
      <td style="min-width:220px"><b>${esc(s.name || '(이름 없음)')}</b>
        <div class="sub" style="margin-top:3px">${esc(s.group)}${s.cond ? ` · <span class="err">${esc(s.cond)}</span>` : ''}</div></td>
      <td><span class="badge ${s.type === '무상렌탈' ? 'red' : ''}">${s.type}</span></td>
      ${setCalcCells(s)}
      <td class="acts"><button class="btn ${open ? 'dark' : ''}" onclick="priceView.open = ${open ? 'null' : s.id}; renderSets()">${open ? '닫기' : '상세'}</button></td>
    </tr>
    ${open ? `
    <tr class="detail"><td colspan="7">
      <div class="detail-grid">
        <label><b class="label">상품 구성(이름)</b> <input class="input" value="${esc(s.name)}" oninput="editSet(${s.id}, 'name', this)" onchange="renderSets()"></label>
        <div class="row" style="align-items:flex-end; flex-wrap:nowrap">
          <label class="grow"><b class="label">구분</b> <input class="input" value="${esc(s.group)}" oninput="editSet(${s.id}, 'group', this)" onchange="renderSets()"></label>
          <label><b class="label">유형</b> <select class="input" style="width:110px" onchange="editSet(${s.id}, 'type', this); renderSets()">
            ${['유료렌탈', '무상렌탈'].map(t => `<option ${t === s.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        </div>
        <label><b class="label">매출·특별조건</b> <input class="input" value="${esc(s.cond)}" oninput="editSet(${s.id}, 'cond', this)" onchange="renderSets()"></label>
        <label><b class="label">직원 확인</b> <input class="input" value="${esc(s.check)}" oninput="editSet(${s.id}, 'check', this)"></label>
        <label style="grid-column:1 / -1"><b class="label">비고</b> <input class="input" value="${esc(s.memo)}" oninput="editSet(${s.id}, 'memo', this)"></label>
        <div class="comp-edit">
          <span style="width:100%"><b class="label">구성 장비 :</b> <span class="sub">세트에 들어가는 대수 (＋/－로 조정)</span></span>
          ${db.items.map(p => { const n = s.comp[p.id] || 0; return `
            <span class="chip ${n ? 'on' : ''}"><b>${esc(p.name || '(이름 없음)')}</b>
              <button onclick="editComp(${s.id}, ${p.id}, -1)" ${n ? '' : 'disabled'}>−</button><b>${n}</b><button onclick="editComp(${s.id}, ${p.id}, 1)">+</button></span>`; }).join('')}
        </div>
        <div class="row" style="grid-column:1 / -1; justify-content:flex-end"><button class="btn white danger" onclick="removeSet(${s.id})">이 세트 삭제</button></div>
      </div>
    </td></tr>` : ''}`;
  }).join('') || '<tr><td colspan="7" class="sub" style="padding:24px 8px; text-align:center">조건에 맞는 세트가 없습니다.</td></tr>';
}
// 금액 입력 중에는 포커스를 유지하도록 최종 칸만 다시 그림
function refreshSetCalc() {
  for (const s of db.sets) {
    const cell = $('set-' + s.id)?.querySelector('[data-k=final]');
    if (cell) cell.innerHTML = `<b>${setFinalVat(s)}</b>`;
  }
}
function editSet(id, field, el) {
  const s = db.sets.find(x => x.id === id);
  if (field === 'price') s.price = Number(el.value) || 0;
  else if (field === 'sale') s.sale = el.value === '' ? null : Number(el.value) || 0;
  else s[field] = el.value;
  saveDb(); refreshSetCalc();
}
function editComp(setId, itemId, delta) {
  const s = db.sets.find(x => x.id === setId);
  const n = Math.max(0, (s.comp[itemId] || 0) + delta);
  if (n) s.comp[itemId] = n; else delete s.comp[itemId];
  saveDb(); renderSets();
}
function addSet() {
  const id = nextId(db.sets);
  db.sets.push({ id, group: priceView.group || '', name: '', type: '유료렌탈', price: 0, sale: null, cond: '', check: PAID, memo: '', image: '', comp: {} });
  priceView.open = id;
  saveDb(); renderSets();
  $('set-' + id).scrollIntoView({ block: 'center' });
}
function removeSet(id) {
  if (!confirm('이 세트를 삭제할까요?')) return;
  db.sets = db.sets.filter(s => s.id !== id);
  priceView.open = null;
  saveDb(); renderSets();
}

// ───────── 기본 문구 ─────────
function editSetting(field, value) {
  db.settings[field] = field === 'message' ? value : value.split('\n').map(s => s.trim()).filter(Boolean);
  saveDb();
}

// ───────── 내보내기 / 가져오기 / 초기화 ─────────
function resetDb() {
  if (!confirm('수정한 금액·세트·이미지·기본 문구를 모두 지우고 기준표(26.11.11)로 되돌릴까요?')) return;
  db = baseDb(); priceView.open = null;
  saveDb(); PAGES.price();
}
function exportDb() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
  a.download = `rental-db_${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importDb() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = () => input.files[0]?.text().then(text => {
    const d = JSON.parse(text);
    if (!Array.isArray(d.items) || !Array.isArray(d.sets)) throw new Error();
    const image = v => typeof v === 'string' && /^\/img\/(lib\/[\w.-]+|u\/[\w-]+)$/.test(v) ? v : '';
    db = upgradeDb({
      v: d.v,
      items: d.items.map((r, i) => ({
        id: Number(r.id) || i + 1, name: String(r.name ?? ''), category: String(r.category ?? ''),
        price: Number(r.price) || 0, sale: Number(r.sale) || 0, tbd: !!r.tbd, memo: String(r.memo ?? ''), image: image(r.image),
        unit: String(r.unit || '대').slice(0, 10), max: Math.max(0, Math.floor(Number(r.max) || 0)),
      })),
      sets: d.sets.map((r, i) => ({
        id: Number(r.id) || i + 1, group: String(r.group ?? ''), name: String(r.name ?? ''),
        type: r.type === '무상렌탈' ? '무상렌탈' : '유료렌탈',
        price: Number(r.price) || 0, sale: r.sale === null || r.sale === '' || r.sale === undefined ? null : Number(r.sale) || 0,
        cond: String(r.cond ?? ''), check: String(r.check ?? ''), memo: String(r.memo ?? ''), image: image(r.image),
        comp: Object.fromEntries(Object.entries(r.comp || {}).map(([k, v]) => [Number(k), Number(v) || 0]).filter(([k, v]) => k && v > 0)),
      })),
      settings: d.settings && typeof d.settings === 'object' ? {
        notes: (Array.isArray(d.settings.notes) ? d.settings.notes : BASE_SETTINGS.notes).map(String),
        staff: (Array.isArray(d.settings.staff) ? d.settings.staff : []).map(String),
        message: typeof d.settings.message === 'string' ? d.settings.message : BASE_SETTINGS.message,
      } : undefined,
    });
    priceView.open = null;
    saveDb(); PAGES.price(); toast('금액표를 가져왔습니다.');
  }).catch(() => toast('파일을 읽을 수 없습니다. 내보내기로 만든 JSON 파일인지 확인해주세요.', true));
  input.click();
}
