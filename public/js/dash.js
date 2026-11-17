// 담당자 대시보드: 저장된 견적 목록, 담당자별 보기, 검색

const PER_PAGE = 20;
let dashQuotes = [];
const dashFilter = { staff: '', text: '', from: '', to: '', page: 1 };

PAGES.dash = async function renderDashPage() {
  $('page-dash').innerHTML = `
    <div class="page-head">
      <p class="title">담당자 대시보드</p>
      <div class="row">
        <button class="btn white" onclick="PAGES.dash()">새로고침</button>
        <button class="btn white" onclick="exportCsv()">엑셀(CSV)로 내보내기</button>
      </div>
    </div>
    <div class="stat-row" id="dashStats"></div>
    <div class="row" style="margin-bottom:12px">
      <input class="input" style="width:260px" id="dashText" placeholder="고객명 · 연락처 · 상품 구성 검색" value="${esc(dashFilter.text)}" oninput="setDash('text', this.value)">
      <label class="field">기간 <input type="date" value="${dashFilter.from}" oninput="setDash('from', this.value)"> ~ <input type="date" value="${dashFilter.to}" oninput="setDash('to', this.value)"></label>
      <button class="btn white" onclick="Object.assign(dashFilter, { staff: '', text: '', from: '', to: '', page: 1 }); PAGES.dash()">검색 초기화</button>
    </div>
    <div class="table-card">
      <table class="list">
        <thead><tr><th>견적일</th><th>고객명(상호)</th><th>연락처</th><th>담당자</th><th>상품 구성</th><th class="num">월 렌탈료(VAT 포함)</th><th></th></tr></thead>
        <tbody id="dashBody"><tr><td colspan="7" class="sub">불러오는 중…</td></tr></tbody>
      </table>
      <div class="pager" id="dashPager"></div>
    </div>`;
  try { dashQuotes = (await api('/api/quotes')).quotes; }
  catch (e) { if (e.message !== 'unauthorized') $('dashBody').innerHTML = `<tr><td colspan="7" class="err">불러오기 실패: ${esc(e.message)}</td></tr>`; return; }
  renderDash();
};

function setDash(field, value) { dashFilter[field] = value; dashFilter.page = 1; renderDash(); }

// 검색·기간 조건에 맞는 견적 (담당자 조건은 따로)
function dashMatches() {
  const text = dashFilter.text.trim().toLowerCase();
  return dashQuotes.filter(s =>
    (!text || [s.customer, s.phone, s.items, s.staff].some(v => String(v || '').toLowerCase().includes(text))) &&
    (!dashFilter.from || s.date >= dashFilter.from) && (!dashFilter.to || s.date <= dashFilter.to));
}

function renderDash() {
  const matched = dashMatches();
  const byStaff = new Map();
  for (const s of matched) {
    const k = s.staff || COMPANY.name;
    const v = byStaff.get(k) || { count: 0, sum: 0 };
    v.count++; v.sum += s.final || 0;
    byStaff.set(k, v);
  }
  const stat = (key, label, v) => `
    <button class="stat ${dashFilter.staff === key ? 'on' : ''}" onclick="setDash('staff', '${esc(key).replace(/'/g, '&#39;')}')">
      <span>${esc(label)}</span><b>${v.count}건</b><small>월 ${won(v.sum)}</small></button>`;
  $('dashStats').innerHTML =
    stat('', '전체', { count: matched.length, sum: matched.reduce((a, s) => a + (s.final || 0), 0) }) +
    [...byStaff].sort((a, b) => b[1].count - a[1].count).map(([k, v]) => stat(k, k, v)).join('');

  const rows = matched.filter(s => !dashFilter.staff || (s.staff || COMPANY.name) === dashFilter.staff);
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  dashFilter.page = Math.min(dashFilter.page, pages);
  const shown = rows.slice((dashFilter.page - 1) * PER_PAGE, dashFilter.page * PER_PAGE);
  $('dashBody').innerHTML = shown.map(s => `
    <tr>
      <td>${esc(s.date)}</td>
      <td><b>${esc(s.customer || '(이름 없음)')}</b></td>
      <td>${esc(s.phone)}</td>
      <td>${esc(s.staff || COMPANY.name)}</td>
      <td>${esc(s.items)}</td>
      <td class="num"><b>${won(s.final)}</b></td>
      <td class="acts">
        <button class="btn" onclick="viewQuote('${s.id}')">보기</button>
        <button class="btn" onclick="copyText(location.origin + '/q/${s.id}').then(() => toast('링크를 복사했습니다.'))">링크</button>
        <button class="btn" onclick="editQuote('${s.id}')">수정</button>
        <button class="btn danger" onclick="deleteQuote('${s.id}')">삭제</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="7" class="sub" style="padding:32px 8px; text-align:center">${dashQuotes.length ? '조건에 맞는 견적이 없습니다.' : '저장된 견적이 없습니다. 견적서 관리에서 견적을 저장하면 여기에 쌓입니다.'}</td></tr>`;
  $('dashPager').innerHTML = pages < 2 ? '' : `
    <button class="btn" ${dashFilter.page <= 1 ? 'disabled' : ''} onclick="dashFilter.page--; renderDash()">이전</button>
    <span>${dashFilter.page} / ${pages} (총 ${rows.length}건)</span>
    <button class="btn" ${dashFilter.page >= pages ? 'disabled' : ''} onclick="dashFilter.page++; renderDash()">다음</button>`;
}

async function viewQuote(id) {
  try {
    const { quote: q } = await api('/api/quotes/' + id);
    showQuoteModal(id, q, `${q.customer || '고객'}님 견적서`, `${q.date} · 담당자 ${q.staff || COMPANY.name}`);
  } catch (e) { if (e.message !== 'unauthorized') toast('불러오기 실패: ' + e.message, true); }
}
// 저장된 견적을 견적서 관리 화면으로 불러와 고친다 (저장하면 같은 링크에 덮어씀)
async function editQuote(id) {
  try {
    const { quote: q, state } = await api('/api/quotes/' + id);
    if (!state) return toast('이 견적은 예전 방식으로 저장되어 수정할 수 없습니다. 보기만 가능합니다.', true);
    quote = { ...emptyQuote(), ...state, customer: q.customer, phone: q.phone, date: q.date, staff: q.staff === COMPANY.name ? '' : q.staff, editingId: id };
    saveQuote(); showPage('quote');
    toast('견적을 불러왔습니다. 금액은 현재 금액표 기준으로 다시 계산됩니다.');
  } catch (e) { if (e.message !== 'unauthorized') toast('불러오기 실패: ' + e.message, true); }
}
async function deleteQuote(id) {
  const s = dashQuotes.find(x => x.id === id);
  if (!confirm(`${s?.customer || '이'} 견적을 삭제할까요? 고객에게 보낸 링크도 더 이상 열리지 않습니다.`)) return;
  try {
    await api('/api/quotes/' + id, { method: 'DELETE' });
    dashQuotes = dashQuotes.filter(x => x.id !== id);
    if (quote.editingId === id) { quote.editingId = null; saveQuote(); }
    renderDash(); toast('삭제했습니다.');
  } catch (e) { if (e.message !== 'unauthorized') toast('삭제 실패: ' + e.message, true); }
}
// 지금 검색 조건에 맞는 견적을 엑셀에서 열 수 있는 CSV로 저장
function exportCsv() {
  const rows = dashMatches().filter(s => !dashFilter.staff || (s.staff || COMPANY.name) === dashFilter.staff);
  if (!rows.length) return toast('내보낼 견적이 없습니다.', true);
  const cell = v => { let t = String(v ?? ''); if (/^[=+\-@]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
  const lines = [['견적일', '고객명', '연락처', '담당자', '상품 구성', '월 렌탈료(VAT 별도)', '월 렌탈료(VAT 포함)', '약정(개월)', '저장일시', '링크'],
    ...rows.map(s => [s.date, s.customer, s.phone, s.staff || COMPANY.name, s.items, s.supply, s.final, s.months, s.updatedAt || s.createdAt, `${location.origin}/q/${s.id}`])];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `견적목록_${today()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
