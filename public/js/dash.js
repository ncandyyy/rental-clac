// 담당자 대시보드: 저장된 견적 목록, 담당자별 보기, 검색

const PER_PAGE = 20;
let dashQuotes = [];
const dashFilter = { staff: '', status: '', text: '', from: '', to: '', page: 1 };
const STATUS = { draft: ['작성중', 'yellow'], done: ['작성완료', ''], sent: ['전달', 'green'] };
const statusOf = s => s.status || 'done';   // 상태가 없던 예전 견적은 작성완료

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
      <div class="tabs" id="dashTabs"></div>
      <input class="input" style="width:260px" id="dashText" placeholder="상호 · 성함 · 연락처 · 상품 구성 검색" value="${esc(dashFilter.text)}" oninput="setDash('text', this.value)">
      <label class="field">기간 <input type="date" value="${dashFilter.from}" oninput="setDash('from', this.value)"> ~ <input type="date" value="${dashFilter.to}" oninput="setDash('to', this.value)"></label>
      <button class="btn white" onclick="Object.assign(dashFilter, { staff: '', status: '', text: '', from: '', to: '', page: 1 }); PAGES.dash()">검색 초기화</button>
    </div>
    <div class="table-card">
      <table class="list">
        <thead><tr><th>상태</th><th>견적일</th><th>상호 / 고객 성함</th><th>연락처</th><th>담당자</th><th>상품 구성</th><th class="num">월 렌탈료(VAT 포함)</th><th></th></tr></thead>
        <tbody id="dashBody"><tr><td colspan="8" class="sub">불러오는 중…</td></tr></tbody>
      </table>
      <div class="pager" id="dashPager"></div>
    </div>`;
  try { dashQuotes = (await api('/api/quotes')).quotes; }
  catch (e) { if (e.message !== 'unauthorized') $('dashBody').innerHTML = `<tr><td colspan="8" class="err">불러오기 실패: ${esc(e.message)}</td></tr>`; return; }
  renderDash();
};

function setDash(field, value) { dashFilter[field] = value; dashFilter.page = 1; renderDash(); }

// 검색·기간 조건에 맞는 견적 (담당자 조건은 따로)
function dashMatches() {
  const text = dashFilter.text.trim().toLowerCase();
  return dashQuotes.filter(s =>
    (!text || [s.customer, s.name, s.phone, s.items, s.staff].some(v => String(v || '').toLowerCase().includes(text))) &&
    (!dashFilter.from || s.date >= dashFilter.from) && (!dashFilter.to || s.date <= dashFilter.to));
}

// 묶음 띠 색 [띠, 바탕]
const BANDS = [['#3182f6', '#f4f8ff'], ['#8b5cf6', '#f8f5ff'], ['#10b981', '#f1fbf7'], ['#f59e0b', '#fffaf0'], ['#ec4899', '#fff5fa'], ['#06b6d4', '#f0fbfd'], ['#ef4444', '#fff5f5'], ['#84cc16', '#f7fcee']];
const groupSize = g => dashQuotes.filter(x => x.groupId === g).length;
// 같은 묶음 견적은 처음 나온 자리에 모아서 붙인다
function groupTogether(list) {
  const out = [], placed = new Set();
  for (const s of list) {
    if (placed.has(s)) continue;
    const members = s.groupId ? list.filter(x => x.groupId === s.groupId).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))) : [s];
    for (const m of members) { out.push(m); placed.add(m); }
  }
  return out;
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

  const count = k => matched.filter(s => !k || statusOf(s) === k).length;
  $('dashTabs').innerHTML = [['', '전체'], ['draft', '작성중'], ['done', '작성완료'], ['sent', '전달']].map(([k, label]) =>
    `<button class="${dashFilter.status === k ? 'on' : ''}" onclick="setDash('status', '${k}')">${label} ${count(k)}</button>`).join('');
  const rows = groupTogether(matched.filter(s => (!dashFilter.staff || (s.staff || COMPANY.name) === dashFilter.staff) && (!dashFilter.status || statusOf(s) === dashFilter.status)));
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  dashFilter.page = Math.min(dashFilter.page, pages);
  const shown = rows.slice((dashFilter.page - 1) * PER_PAGE, dashFilter.page * PER_PAGE);
  // 묶음 견적은 왼쪽 띠로 이어서 보여준다. 색은 묶음마다 정해지고(새로고침해도 같은 색), 바로 위 묶음과는 겹치지 않게
  let prevColor = -1;
  const bandOf = shown.map((s, i) => {
    if (!(s.groupId && groupSize(s.groupId) > 1)) return null;
    const startsGroup = shown[i - 1]?.groupId !== s.groupId;
    if (startsGroup) {
      let c = [...s.groupId].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % BANDS.length;
      if (c === prevColor) c = (c + 1) % BANDS.length;
      prevColor = c;
    }
    const [line, fill] = BANDS[prevColor];
    return { cls: `grp${startsGroup ? ' grp-start' : ''}${shown[i + 1]?.groupId !== s.groupId ? ' grp-end' : ''}`, style: `--band:${line};--band-bg:${fill}` };
  });
  $('dashBody').innerHTML = shown.map((s, i) => `
    <tr class="${bandOf[i]?.cls || ''}" style="${bandOf[i]?.style || ''}">
      <td><span class="badge ${STATUS[statusOf(s)][1]}">${STATUS[statusOf(s)][0]}</span></td>
      <td>${esc(s.date)}</td>
      <td><b>${esc(s.customer || s.name || '(이름 없음)')}</b>${s.customer && s.name ? `<small class="sub" style="display:block">${esc(s.name)}</small>` : ''}</td>
      <td>${esc(s.phone)}</td>
      <td>${esc(s.staff || COMPANY.name)}</td>
      <td>${esc(s.items)}</td>
      <td class="num"><b>${won(s.final)}</b></td>
      <td class="acts">
        ${statusOf(s) === 'draft' ? `<button class="btn dark" onclick="loadQuote('${s.id}')">이어서 작성</button>` : `
        <button class="btn" onclick="viewQuote('${s.id}')">보기</button>
        <button class="btn" onclick="copyText(location.origin + '/q/${s.id}').then(() => { toast('링크를 복사했습니다.'); markSent('${s.id}'); })">링크</button>
        <button class="btn" onclick="editFromDash('${s.id}')">수정</button>`}
        <button class="btn danger" onclick="deleteQuote('${s.id}')">삭제</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="8" class="sub" style="padding:32px 8px; text-align:center">${dashQuotes.length ? '조건에 맞는 견적이 없습니다.' : '저장된 견적이 없습니다. 견적서 관리에서 견적을 저장하면 여기에 쌓입니다.'}</td></tr>`;
  $('dashPager').innerHTML = pages < 2 ? '' : `
    <button class="btn" ${dashFilter.page <= 1 ? 'disabled' : ''} onclick="dashFilter.page--; renderDash()">이전</button>
    <span>${dashFilter.page} / ${pages} (총 ${rows.length}건)</span>
    <button class="btn" ${dashFilter.page >= pages ? 'disabled' : ''} onclick="dashFilter.page++; renderDash()">다음</button>`;
}

// 묶음 견적이면 같은 묶음을 함께 띄우고 누른 견적의 탭을 연다
async function viewQuote(id) {
  try {
    const s = dashQuotes.find(x => x.id === id);
    const ids = s?.groupId ? groupTogether(dashQuotes).filter(x => x.groupId === s.groupId && statusOf(x) !== 'draft').map(x => x.id) : [id];
    const list = await Promise.all(ids.map(async x => ({ id: x, q: (await api('/api/quotes/' + x)).quote })));
    const { q } = list.find(x => x.id === id);
    showQuoteModal(list, list.length > 1 ? `묶음 견적서 ${list.length}건` : `${whoLabel(q) || '고객'} 견적서`, `${q.date} · 담당자 ${q.staff || COMPANY.name}`, ids.indexOf(id));
  } catch (e) { if (e.message !== 'unauthorized') toast('불러오기 실패: ' + e.message, true); }
}
// 묶음 견적의 수정: 묶음 전체를 같이 고칠지, 이 견적만 사본으로 따로 고칠지 묻는다
function editFromDash(id) {
  const s = dashQuotes.find(x => x.id === id);
  const size = s?.groupId ? groupTogether(dashQuotes).filter(x => x.groupId === s.groupId && statusOf(x) !== 'draft').length : 1;
  if (size < 2) return loadQuote(id);
  openModal(`
    <h2 style="font-size:20px">묶음 견적서입니다</h2>
    <p>이 견적서는 ${size}건이 한 묶음입니다. 어떻게 수정할까요?</p>
    <div class="choice-list">
      <button class="choice" onclick="loadGroup('${id}', '${esc(s.groupId)}')">
        <b>묶음 전체 일괄 수정</b><span class="sub">${size}건을 함께 고치고, 각 견적서의 원래 링크에 덮어씁니다.</span></button>
      <button class="choice" onclick="loadQuote('${id}', 'copy')">
        <b>이 견적만 따로 수정</b><span class="sub">묶음에서 빠진 사본으로 따로 저장됩니다. 원래 묶음 견적서는 그대로 남습니다.</span></button>
    </div>
    <div class="row" style="justify-content:flex-end; margin-top:16px"><button class="btn" onclick="closeModal()">취소</button></div>`, true);
}
async function deleteQuote(id) {
  const s = dashQuotes.find(x => x.id === id);
  if (s?.groupId && groupSize(s.groupId) > 1) {
    if (!confirm('묶음 견적서 입니다. 하나를 삭제하시겠습니까?')) return;
  } else if (!confirm(`${s ? whoLabel(s) || '이' : '이'} 견적을 삭제할까요?${s && statusOf(s) !== 'draft' ? ' 고객에게 보낸 링크도 더 이상 열리지 않습니다.' : ''}`)) return;
  try {
    await api('/api/quotes/' + id, { method: 'DELETE' });
    dashQuotes = dashQuotes.filter(x => x.id !== id);
    if (quote.editingId === id) { quote.editingId = null; quote.editingStatus = null; }
    renderDash(); toast('삭제했습니다.');
  } catch (e) { if (e.message !== 'unauthorized') toast('삭제 실패: ' + e.message, true); }
}
// 지금 검색 조건에 맞는 견적을 엑셀에서 열 수 있는 CSV로 저장
function exportCsv() {
  const rows = dashMatches().filter(s => (!dashFilter.staff || (s.staff || COMPANY.name) === dashFilter.staff) && (!dashFilter.status || statusOf(s) === dashFilter.status));
  if (!rows.length) return toast('내보낼 견적이 없습니다.', true);
  const cell = v => { let t = String(v ?? ''); if (/^[=+\-@]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
  const lines = [['상태', '견적일', '상호', '고객 성함', '연락처', '담당자', '상품 구성', '월 렌탈료(VAT 별도)', '월 렌탈료(VAT 포함)', '약정(개월)', '저장일시', '링크'],
    ...rows.map(s => [STATUS[statusOf(s)][0], s.date, s.customer, s.name, s.phone, s.staff || COMPANY.name, s.items, s.supply, s.final, s.months, s.updatedAt || s.createdAt, `${location.origin}/q/${s.id}`])];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `견적목록_${today()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
