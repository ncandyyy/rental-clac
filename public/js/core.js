// 공통: 상태, 서버 통신, 로그인, 화면 전환, 금액 계산
// (num / won / minus / esc / renderSheet 등은 sheet.js, 기준 데이터는 data.js)

const PW_KEY = 'rental-pw', PAGE_KEY = 'rental-page';
localStorage.removeItem('rental-quote-v4');   // 예전 버전이 브라우저에 남겨 둔 작성 중 견적 정리
let pw = localStorage.getItem(PW_KEY) || '';
let db = null;          // { items, sets, settings } - 서버에 저장되는 공용 금액표
let role = 'staff';     // admin(관리자) / staff(직원)
const ADMIN_PAGES = ['price', 'images'];   // 관리자만 보는 화면
const PAGES = {};       // 화면 이름 → 그리는 함수 (각 화면 파일에서 등록)

const $ = id => document.getElementById(id);
const nextId = list => list.reduce((m, x) => Math.max(m, x.id), 0) + 1;
const itemById = id => db.items.find(x => x.id === Number(id));
const today = () => new Date().toLocaleDateString('sv-SE');   // YYYY-MM-DD
const bg = url => url ? `style="background-image:url('${esc(url)}')"` : '';

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
    const res = await api('/api/db');
    db = res.db ? upgradeDb(res.db) : baseDb();   // 저장된 금액표가 없으면 기준표로 시작
    role = res.role === 'admin' ? 'admin' : 'staff';
  } catch (e) {
    if (e.message !== 'unauthorized') showLogin(e.message);
    return;
  }
  localStorage.setItem(PW_KEY, pw);
  $('login').hidden = true; $('app').hidden = false;
  for (const b of document.querySelectorAll('.nav [data-page]')) b.hidden = role !== 'admin' && ADMIN_PAGES.includes(b.dataset.page);
  $('roleBadge').textContent = role === 'admin' ? '관리자' : '직원';
  const last = localStorage.getItem(PAGE_KEY);
  showPage(PAGES[last] && (role === 'admin' || !ADMIN_PAGES.includes(last)) ? last : 'quote');
}

// 금액표 저장: 수정이 멈추면 0.6초 뒤 서버에 저장
let saveTimer = null;
function saveDb() {
  setSaveState('저장 중…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await api('/api/db', { method: 'PUT', body: JSON.stringify(db) });
      setSaveState('저장됨 ✓');
    } catch (e) {
      setSaveState('저장 실패: ' + e.message, true);
    }
  }, 600);
}
function setSaveState(text, isError) {
  for (const el of document.querySelectorAll('.save-state')) { el.textContent = text; el.className = 'save-state ' + (isError ? 'err' : 'sub'); }
}

// 연락처: 숫자만 넣어도 010-0000-0000 / 02-000-0000 / 1577-0000 모양으로 나눈다
function formatPhone(value) {
  const d = String(value).replace(/\D/g, '').slice(0, 11);
  if (d.startsWith('02')) {   // 서울 지역번호
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  if (/^1[5-9]/.test(d) && d.length <= 8) return d.length <= 4 ? d : `${d.slice(0, 4)}-${d.slice(4)}`;   // 1577-0000 같은 대표번호
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

// ───────── 화면 전환 / 알림 / 모달 ─────────
function showPage(name) {
  if (role !== 'admin' && ADMIN_PAGES.includes(name)) name = 'quote';
  localStorage.setItem(PAGE_KEY, name);
  for (const b of document.querySelectorAll('.nav [data-page]')) b.classList.toggle('on', b.dataset.page === name);
  for (const p of Object.keys(PAGES)) $('page-' + p).hidden = p !== name;
  PAGES[name]();
  scrollTo(0, 0);
}
let toastTimer = null;
function toast(message, isError) {
  const t = $('toast');
  t.textContent = message; t.className = 'toast' + (isError ? ' err' : ''); t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 5000 : 2500);
}
function openModal(html, small) {
  $('modalRoot').innerHTML = `
    <div class="overlay" onmousedown="if (event.target === this) closeModal()">
      <div class="modal ${small ? 'small' : ''}"><button class="close" onclick="closeModal()" aria-label="닫기">✕</button>${html}</div>
    </div>`;
  document.body.style.overflow = 'hidden';
}
function closeModal() { $('modalRoot').innerHTML = ''; document.body.style.overflow = ''; }
addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {   // 구형 브라우저 / 권한 없음
    const t = document.createElement('textarea');
    t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
  }
}

// ───────── 이미지 올리기 ─────────
// 파일을 고르면 브라우저에서 줄인 뒤(긴 변 1000px, WEBP) 서버에 올리고 주소를 돌려준다
function pickFile() {
  return new Promise(resolve => {
    const input = $('filePick');
    input.value = '';
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}
async function uploadImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let image = canvas.toDataURL('image/webp', 0.88);
  if (!image.startsWith('data:image/webp')) image = canvas.toDataURL('image/png');   // WEBP 저장을 못 하는 브라우저
  return (await api('/api/images', { method: 'POST', body: JSON.stringify({ image }) })).url;
}
// 끌어다 놓기·붙여넣기로 들어온 것 중 이미지 파일만 고른다
const imageFiles = data => [...(data?.files || [])].filter(f => /^image\/(png|jpeg|webp)$/.test(f.type));
// 끌어다 놓을 수 있는 영역 표시 (onDrop은 이미지 파일 배열을 받는다)
function dropAttrs(handler) {
  return `ondragover="event.preventDefault(); this.classList.add('drag')" ondragleave="if (!this.contains(event.relatedTarget)) this.classList.remove('drag')" ` +
    `ondrop="event.preventDefault(); this.classList.remove('drag'); ${handler}"`;
}
// 복사한 이미지 붙여넣기(Ctrl+V): 지금 보고 있는 화면이 받는다
addEventListener('paste', e => {
  const files = imageFiles(e.clipboardData);
  if (!files.length || $('app').hidden) return;
  const page = localStorage.getItem(PAGE_KEY);
  if (page === 'quote') { e.preventDefault(); addQuoteFiles(files); }
  else if (page === 'images') { e.preventDefault(); pasteToImageCard(files[0]); }
});
// 영역 밖에 떨어뜨려도 브라우저가 이미지 파일을 열어버리지 않게 한다
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => e.preventDefault());

// ───────── 금액 계산 (엑셀 '세트가' 시트와 같은 식) ─────────
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
  };
}
const compText = s => Object.entries(s.comp).map(([id, qty]) =>
  (itemById(id)?.name || '?') + (qty > 1 ? '×' + qty : '')).join(', ') || '(없음)';

// 분류별로 묶은 단품 목록 [[분류, [단품...]], ...]
function itemsByCategory() {
  const groups = new Map(CATEGORY_ORDER.map(c => [c, []]));
  for (const p of db.items) {
    const c = p.category || '기타';
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(p);
  }
  return [...groups].filter(([, list]) => list.length);
}
