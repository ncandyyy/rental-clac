// 직원용 화면: 계산기 + 금액 관리
// won / disc / esc / renderSheet 등은 sheet.js, 기준 데이터는 data.js

// ───────── 상태 ─────────
const PW_KEY = 'rental-pw', QUOTE_KEY = 'rental-quote-v3';
let pw = localStorage.getItem(PW_KEY) || '';
let db = null;          // { items, sets } - 서버에 저장되는 공용 금액표
let openComp = null;    // 구성 수정 중인 세트 id
const emptyQuote = () => ({ customer: '', phone: '', date: '', months: 36, staff: '', special: 0, specialMemo: '', showPrice: true, qty: {}, setChoice: 'auto' });
let quote = (() => { try { return { ...emptyQuote(), ...JSON.parse(localStorage.getItem(QUOTE_KEY)) }; } catch { return emptyQuote(); } })();

const $ = id => document.getElementById(id);
const nextId = list => list.reduce((m, x) => Math.max(m, x.id), 0) + 1;
const itemById = id => db.items.find(x => x.id === Number(id));

// ───────── 서버 통신 / 로그인 ─────────
async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { 'x-password': encodeURIComponent(pw), 'content-type': 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { showLogin(pw ? data.error : ''); throw new Error('unauthorized'); }
  if (!res.ok) throw new Error(data.error || `서버 오류 (${res.status})`);
  return data;
}
function showLogin(message) {
  $('login').hidden = false; $('app').hidden = true;
  $('loginMsg').textContent = message || '';
}
async function login(e) {
  e.preventDefault();
  pw = $('loginPw').value;
  await boot();
}
function logout() {
  pw = ''; localStorage.removeItem(PW_KEY); $('loginPw').value = '';
  showLogin('');
}
async function boot() {
  if (!pw) return showLogin('');
  try {
    db = (await api('/api/db')).db || baseDb();   // 저장된 금액표가 없으면 기준표로 시작
  } catch (e) {
    if (e.message !== 'unauthorized') showLogin(e.message);
    return;
  }
  localStorage.setItem(PW_KEY, pw);
  $('login').hidden = true; $('app').hidden = false;
  fillQuoteForm();
  showPage('calc');
}

// 금액표 저장: 수정이 멈추면 0.6초 뒤 서버에 저장
let saveTimer = null;
function saveDb() {
  $('saveState').textContent = '저장 중…'; $('saveState').className = 'note';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await api('/api/db', { method: 'PUT', body: JSON.stringify(db) });
      $('saveState').textContent = '저장됨 ✓';
    } catch (e) {
      $('saveState').textContent = '저장 실패: ' + e.message; $('saveState').className = 'err';
    }
  }, 600);
}

// ───────── 계산 (엑셀 '세트가' 시트와 같은 식) ─────────
function calcSet(s) {
  const list = Object.entries(s.comp).reduce((sum, [id, qty]) => sum + (itemById(id)?.price || 0) * qty, 0);
  const hasSale = s.sale !== null && s.sale !== '';
  const final = hasSale ? Number(s.sale) : s.price;
  return {
    list,                                        // 단품가 합계(정상가)
    setDisc: list - s.price,                     // 세트 할인
    eventDisc: hasSale ? s.price - final : 0,    // 이벤트 할인
    total: list - final,                         // 총 할인
    final,                                       // 최종 월렌탈료 (VAT 별도)
    vat: Math.round(final * 1.1),
  };
}
const compText = s => Object.entries(s.comp).map(([id, qty]) =>
  (itemById(id)?.name || '?') + (qty > 1 ? '×' + qty : '')).join(', ') || '(없음)';

// ───────── 화면 전환 ─────────
function showPage(name) {
  for (const p of ['calc', 'db']) {
    $('page-' + p).hidden = p !== name;
    $('tab-' + p).classList.toggle('on', p === name);
  }
  if (name === 'calc') renderCalc(); else renderDb();
}

// ───────── 데이터베이스: 단품가 ─────────
function renderDb() { renderItems(); renderSets(); }

function renderItems() {
  document.getElementById('itemBody').innerHTML = db.items.map(p => `
    <tr id="item-${p.id}" class="${p.tbd ? 'tbd' : ''}">
      <td><input class="name" value="${esc(p.name)}" oninput="editItem(${p.id}, 'name', this)"></td>
      <td><input value="${esc(p.category)}" oninput="editItem(${p.id}, 'category', this)"></td>
      <td><input class="num" type="number" min="0" step="1000" value="${p.price}" oninput="editItem(${p.id}, 'price', this)"></td>
      <td><input class="num" type="number" min="0" step="1000" value="${p.sale}" oninput="editItem(${p.id}, 'sale', this)"></td>
      <td class="num calc" id="item-disc-${p.id}">${won(p.price - p.sale)}</td>
      <td><input type="checkbox" ${p.tbd ? 'checked' : ''} onchange="editItem(${p.id}, 'tbd', this)"></td>
      <td><input class="txt" value="${esc(p.memo)}" oninput="editItem(${p.id}, 'memo', this)"></td>
      <td><button onclick="removeItem(${p.id})">삭제</button></td>
    </tr>`).join('');
}
function editItem(id, field, el) {
  const p = itemById(id);
  if (field === 'tbd') { p.tbd = el.checked; document.getElementById('item-' + id).className = p.tbd ? 'tbd' : ''; }
  else if (field === 'price' || field === 'sale') p[field] = Number(el.value) || 0;
  else p[field] = el.value;
  document.getElementById('item-disc-' + id).textContent = won(p.price - p.sale);
  saveDb();
  if (field === 'name') renderSets(); else refreshSetCalc();
}
function addItem() {
  db.items.push({ id: nextId(db.items), name: '', category: '', price: 0, sale: 0, tbd: false, memo: '' });
  saveDb(); renderDb();
}
function removeItem(id) {
  const used = db.sets.filter(s => s.comp[id]).length;
  if (!confirm(used ? `이 단품은 세트 ${used}개의 구성에 들어 있습니다. 삭제하면 구성에서도 빠집니다. 삭제할까요?` : '이 단품을 삭제할까요?')) return;
  db.items = db.items.filter(p => p.id !== id);
  db.sets.forEach(s => delete s.comp[id]);
  delete quote.qty[id];
  saveDb(); renderDb();
}

// ───────── 데이터베이스: 세트가 ─────────
function setCalcCells(s) {
  const c = calcSet(s);
  return `
    <td class="num calc">${won(c.list)}</td>
    <td><input class="num" type="number" min="0" step="1000" value="${s.price}" oninput="editSet(${s.id}, 'price', this)"></td>
    <td><input class="num" type="number" min="0" step="1000" value="${s.sale ?? ''}" placeholder="없음" oninput="editSet(${s.id}, 'sale', this)"></td>
    <td class="num calc ${c.setDisc < 0 ? 'bad' : ''}" data-k="setDisc">${won(c.setDisc)}</td>
    <td class="num calc" data-k="eventDisc">${won(c.eventDisc)}</td>
    <td class="num calc" data-k="total">${won(c.total)}</td>
    <td class="num calc" data-k="final"><b>${won(c.final)}</b></td>
    <td class="num calc" data-k="vat">${won(c.vat)}</td>`;
}
function renderSets() {
  document.getElementById('setBody').innerHTML = db.sets.map((s, i) => `
    <tr id="set-${s.id}">
      <td>${i + 1}</td>
      <td><input value="${esc(s.group)}" style="min-width:80px" oninput="editSet(${s.id}, 'group', this)"></td>
      <td><input class="name" value="${esc(s.name)}" oninput="editSet(${s.id}, 'name', this)"></td>
      <td><select style="min-width:90px" onchange="editSet(${s.id}, 'type', this)">
        ${['유료렌탈', '무상렌탈'].map(t => `<option ${t === s.type ? 'selected' : ''}>${t}</option>`).join('')}
      </select></td>
      <td style="min-width:200px">${esc(compText(s))} <button onclick="toggleComp(${s.id})">${openComp === s.id ? '닫기' : '수정'}</button></td>
      ${setCalcCells(s)}
      <td><input class="txt" value="${esc(s.cond)}" oninput="editSet(${s.id}, 'cond', this)"></td>
      <td><input class="txt" value="${esc(s.check)}" oninput="editSet(${s.id}, 'check', this)"></td>
      <td><input class="txt" value="${esc(s.memo)}" oninput="editSet(${s.id}, 'memo', this)"></td>
      <td><button onclick="removeSet(${s.id})">삭제</button></td>
    </tr>
    ${openComp === s.id ? `
    <tr><td colspan="17" class="calc">
      <b>구성 수량</b> <span class="note">(세트에 들어가는 장비 대수 · 0이면 미포함)</span>
      <div class="comp-edit">
        ${db.items.map(p => `<label>${esc(p.name || '(이름 없음)')}
          <input type="number" min="0" value="${s.comp[p.id] || 0}" onchange="editComp(${s.id}, ${p.id}, this)"></label>`).join('')}
      </div>
    </td></tr>` : ''}`).join('');
}
// 금액 입력 중에는 포커스를 유지하도록 계산 칸만 다시 그림
function refreshSetCalc() {
  for (const s of db.sets) {
    const row = document.getElementById('set-' + s.id);
    if (!row) continue;
    const c = calcSet(s);
    row.children[5].textContent = won(c.list);
    for (const k of ['setDisc', 'eventDisc', 'total', 'vat']) row.querySelector(`[data-k=${k}]`).textContent = won(c[k]);
    row.querySelector('[data-k=final]').innerHTML = `<b>${won(c.final)}</b>`;
    row.querySelector('[data-k=setDisc]').classList.toggle('bad', c.setDisc < 0);
  }
}
function editSet(id, field, el) {
  const s = db.sets.find(x => x.id === id);
  if (field === 'price') s.price = Number(el.value) || 0;
  else if (field === 'sale') s.sale = el.value === '' ? null : Number(el.value) || 0;
  else s[field] = el.value;
  saveDb(); refreshSetCalc();
}
function toggleComp(id) { openComp = openComp === id ? null : id; renderSets(); }
function editComp(setId, itemId, el) {
  const s = db.sets.find(x => x.id === setId);
  const qty = Math.max(0, Math.floor(Number(el.value)) || 0);
  if (qty) s.comp[itemId] = qty; else delete s.comp[itemId];
  saveDb(); renderSets();
}
function addSet() {
  const id = nextId(db.sets);
  db.sets.push({ id, group: '', name: '', type: '유료렌탈', price: 0, sale: null, cond: '', check: PAID, memo: '', comp: {} });
  openComp = id;
  saveDb(); renderSets();
}
function removeSet(id) {
  if (!confirm('이 세트를 삭제할까요?')) return;
  db.sets = db.sets.filter(s => s.id !== id);
  saveDb(); renderSets();
}

// ───────── 데이터베이스: 내보내기 / 가져오기 / 초기화 ─────────
function resetDb() {
  if (!confirm('수정한 내용을 지우고 기준표 금액으로 되돌릴까요?')) return;
  db = baseDb(); openComp = null;
  saveDb(); renderDb();
}
function exportDb() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
  a.download = 'rental-db.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
function importDb(input) {
  const file = input.files[0];
  if (!file) return;
  file.text().then(text => {
    const d = JSON.parse(text);
    if (!Array.isArray(d.items) || !Array.isArray(d.sets)) throw new Error();
    db = {
      items: d.items.map((r, i) => ({
        id: Number(r.id) || i + 1, name: String(r.name ?? ''), category: String(r.category ?? ''),
        price: Number(r.price) || 0, sale: Number(r.sale) || 0, tbd: !!r.tbd, memo: String(r.memo ?? ''),
      })),
      sets: d.sets.map((r, i) => ({
        id: Number(r.id) || i + 1, group: String(r.group ?? ''), name: String(r.name ?? ''),
        type: r.type === '무상렌탈' ? '무상렌탈' : '유료렌탈',
        price: Number(r.price) || 0, sale: r.sale === null || r.sale === '' || r.sale === undefined ? null : Number(r.sale) || 0,
        cond: String(r.cond ?? ''), check: String(r.check ?? ''), memo: String(r.memo ?? ''),
        comp: Object.fromEntries(Object.entries(r.comp || {}).map(([k, v]) => [Number(k), Number(v) || 0]).filter(([k, v]) => k && v > 0)),
      })),
    };
    openComp = null;
    saveDb(); renderDb();
  }).catch(() => alert('파일을 읽을 수 없습니다. 내보내기로 만든 JSON 파일인지 확인해주세요.'));
  input.value = '';
}

// ───────── 계산기 ─────────
const FIELDS = { customer: 'qCustomer', phone: 'qPhone', date: 'qDate', months: 'qMonths', staff: 'qStaff', special: 'qSpecial', specialMemo: 'qSpecialMemo' };
const NUM_FIELDS = ['months', 'special'];

function saveQuote() {
  for (const [k, id] of Object.entries(FIELDS)) {
    quote[k] = NUM_FIELDS.includes(k) ? Math.max(0, Number($(id).value) || 0) : $(id).value;
  }
  quote.showPrice = $('qShowPrice').checked;
  localStorage.setItem(QUOTE_KEY, JSON.stringify(quote));
}
function fillQuoteForm() {
  if (!quote.date) quote.date = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
  for (const [k, id] of Object.entries(FIELDS)) $(id).value = k === 'special' ? (quote.special || '') : quote[k];
  $('qShowPrice').checked = quote.showPrice !== false;
}
function onInfo() { saveQuote(); renderResult(); }

function step(id, delta) {
  const n = Math.max(0, (quote.qty[id] || 0) + delta);
  if (n) quote.qty[id] = n; else delete quote.qty[id];
  saveQuote(); renderCalc();
}
function chooseSet(value) {
  quote.setChoice = value === 'auto' || value === 'none' ? value : Number(value);
  saveQuote(); renderCalc();
}
// 세트 구성을 그대로 담기
function loadSet(id) {
  const s = db.sets.find(x => x.id === Number(id));
  if (!s) return;
  quote.qty = { ...s.comp }; quote.setChoice = s.id;
  saveQuote(); renderCalc();
}
function clearQuote() {
  if (!confirm('견적 내용을 모두 지울까요?')) return;
  quote = emptyQuote();
  fillQuoteForm(); saveQuote(); renderCalc();
}

// 고른 장비 안에 구성이 전부 들어가는 세트들. 많이 덮는 순.
function candidates() {
  const units = s => Object.values(s.comp).reduce((a, b) => a + b, 0);
  return db.sets
    .filter(s => units(s) > 0 && Object.entries(s.comp).every(([id, n]) => (quote.qty[id] || 0) >= n))
    .sort((a, b) => units(b) - units(a));
}
// 자동 선택: 가장 많이 덮는 세트 중 조건 없는 유료렌탈 우선 (무상·매출조건 세트는 직원이 직접 선택)
function autoSet(cands) {
  if (!cands.length) return null;
  const units = s => Object.values(s.comp).reduce((a, b) => a + b, 0);
  const top = cands.filter(s => units(s) === units(cands[0]));
  return top.find(s => s.type === '유료렌탈' && !s.cond) || top.find(s => s.type === '유료렌탈') || top[0];
}
// set(없으면 null)을 적용했을 때의 견적 계산. 세트에 안 들어간 장비는 추가 장비(단품 행사가).
function compute(set) {
  const lines = [];
  const conds = [];
  if (set) {
    const c = calcSet(set);
    lines.push({ kind: 'set', name: set.name, comp: compText(set), qty: 1, list: c.list, setDisc: c.setDisc, eventDisc: c.eventDisc, final: c.final });
    const note = [set.cond, set.check].filter(Boolean).join(' / ');
    if (note) conds.push(`${set.name} (${set.type}) — ${note}`);
  }
  for (const p of db.items) {
    const n = (quote.qty[p.id] || 0) - (set?.comp[p.id] || 0);
    if (n > 0) lines.push({ kind: 'item', name: p.name, qty: n, list: p.price * n, setDisc: 0, eventDisc: (p.price - p.sale) * n, final: p.sale * n });
  }
  const sum = k => lines.reduce((a, l) => a + l[k], 0);
  const final = sum('final');
  const special = Math.min(Number(quote.special) || 0, final);   // 특별 할인은 최종가 이하로만
  const monthly = final - special;
  const vat = Math.round(monthly * 1.1);
  const months = Number(quote.months) || 0;
  return { lines, conds, list: sum('list'), setDisc: sum('setDisc'), eventDisc: sum('eventDisc'), special, monthly, vat, months, total: vat * months };
}
function currentSet(cands) {
  if (quote.setChoice === 'none') return null;
  return cands.find(s => s.id === quote.setChoice) || autoSet(cands);
}
// 견적서·고객 링크에 들어가는 내용 (사유 메모 같은 내부 정보는 넣지 않는다)
function snapshot() {
  const r = compute(currentSet(candidates()));
  return { customer: quote.customer, phone: quote.phone, date: quote.date, staff: quote.staff, showPrice: quote.showPrice !== false, ...r };
}

function renderCalc() {
  // 세트로 바로 담기
  $('setLoader').innerHTML = '<option value="">세트 구성으로 바로 담기…</option>' + db.sets.map((s, i) =>
    `<option value="${s.id}">${esc(`${i + 1}. [${s.group}] ${s.name} · ${s.type} ${won(calcSet(s).final)}`)}</option>`).join('');

  // 장비 목록
  let html = '', group = null;
  for (const p of db.items) {
    if (p.category !== group) { group = p.category; html += `<div class="group">${esc(group || '기타')}</div>`; }
    const n = quote.qty[p.id] || 0;
    html += `
      <div class="pick ${n ? 'sel' : ''}">
        <div><b>${esc(p.name || '(이름 없음)')}</b>
          <div class="note">정상가 ${won(p.price)}${p.sale !== p.price ? ` · 행사가 ${won(p.sale)}` : ''}</div></div>
        <div class="stepper">
          <button onclick="step(${p.id}, -1)" ${n ? '' : 'disabled'}>−</button><b>${n}</b><button onclick="step(${p.id}, 1)">+</button>
        </div>
      </div>`;
  }
  $('pickList').innerHTML = html;
  renderResult();
}

function renderResult() {
  const cands = candidates();
  if (typeof quote.setChoice === 'number' && !cands.some(s => s.id === quote.setChoice)) quote.setChoice = 'auto';
  const auto = autoSet(cands);
  const set = currentSet(cands);
  const q = snapshot();

  // 적용 세트 선택
  const opt = (value, checked, label) =>
    `<label><input type="radio" name="setChoice" ${checked ? 'checked' : ''} onchange="chooseSet('${value}')"> ${label}</label>`;
  $('setOptions').innerHTML = !cands.length
    ? '<span class="note">고른 구성에 맞는 세트가 없어 단품 행사가로 계산합니다.</span>'
    : cands.map(s => opt(s.id, set === s,
        `${esc(s.name)} · ${s.type} <b>${won(compute(s).monthly)}</b>` +
        (s === auto ? ' <span class="note">(자동 추천)</span>' : '') +
        (s.cond ? ` <span class="note">· ${esc(s.cond)}</span>` : ''))).join('') +
      opt('none', !set, `세트 미적용 (단품 합계) <b>${won(compute(null).monthly)}</b>`);

  // 내역
  $('resultBody').innerHTML = q.lines.map(l => `
    <tr>
      <td>${l.kind === 'set' ? '세트' : '추가'}</td>
      <td>${esc(l.name)}${l.kind === 'item' && l.qty > 1 ? ' ×' + l.qty : ''}</td>
      <td class="num">${won(l.list)}</td>
      <td class="num">${disc(l.setDisc)}</td>
      <td class="num">${disc(l.eventDisc)}</td>
      <td class="num"><b>${won(l.final)}</b></td>
    </tr>`).join('') || '<tr><td colspan="6">왼쪽에서 장비를 선택하세요.</td></tr>';
  $('tList').textContent = won(q.list);
  $('tSet').textContent = disc(q.setDisc);
  $('tEvent').textContent = disc(q.eventDisc);
  $('tSpecial').textContent = disc(q.special);
  $('tFinal').textContent = won(q.monthly);
  $('tVat').textContent = won(q.vat);
  $('tTotal').textContent = `${won(q.total)} (${q.months}개월)`;
  $('condList').innerHTML = q.conds.map(c => `<li>${esc(c)}</li>`).join('');

  $('sheet').innerHTML = renderSheet(q);
}

// ───────── 내보내기: 복사 / 이미지 / 고객용 링크 ─────────
function flash(message, isError) {
  $('actionMsg').textContent = message; $('actionMsg').className = isError ? 'err' : 'note';
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {   // 구형 브라우저 / 권한 없음
    const t = document.createElement('textarea');
    t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
  }
}
function quoteText(q) {
  const lines = q.lines.map(l => l.kind === 'set'
    ? `- 세트: ${l.name} → 월 ${won(l.final)}`
    : `- 추가: ${l.name}${l.qty > 1 ? ' ×' + l.qty : ''} → 월 ${won(l.final)}`);
  return [
    `[렌탈 견적] ${q.customer || '고객'}님`,
    '', '■ 구성', ...lines,
    '', '■ 월 렌탈료',
    `정상가 합계 ${won(q.list)}`,
    `세트 할인 ${disc(q.setDisc)}`,
    `이벤트 할인 ${disc(q.eventDisc)}`,
    ...(q.special ? [`특별 할인 ${disc(q.special)}`] : []),
    `최종 ${won(q.monthly)} (VAT 별도) / ${won(q.vat)} (VAT 포함)`,
    ...(q.conds.length ? ['', '■ 적용 조건', ...q.conds.map(c => '- ' + c)] : []),
  ].join('\n');
}
function needLines(q) {
  if (q.lines.length) return true;
  flash('장비를 먼저 선택하세요.', true);
  return false;
}
async function copyQuote() {
  const q = snapshot();
  if (!needLines(q)) return;
  await copyText(quoteText(q));
  flash('견적 내용을 복사했습니다.');
}
async function downloadImage() {
  const q = snapshot();
  if (!needLines(q)) return;
  await saveSheetImage(document.querySelector('#sheet .sheet'), q);
  flash('견적서 이미지를 저장했습니다.');
}
async function makeLink() {
  const q = snapshot();
  if (!needLines(q)) return;
  flash('링크 만드는 중…');
  try {
    $('ogBox').innerHTML = renderOgCard(q);
    const image = await toPng($('ogBox').firstElementChild, 1);
    $('ogBox').innerHTML = '';
    const { id } = await api('/api/share', { method: 'POST', body: JSON.stringify({ quote: q, image }) });
    const url = `${location.origin}/q/${id}`;
    await copyText(url);
    $('linkOut').hidden = false; $('linkUrl').value = url; $('linkOpen').href = url;
    flash('고객용 링크를 만들어 복사했습니다. 카톡·톡톡에 붙여넣으면 미리보기가 함께 나갑니다.');
  } catch (e) {
    if (e.message !== 'unauthorized') flash('링크 만들기 실패: ' + e.message, true);
  }
}

boot();
