// 이미지 리스트: 단품·세트 이미지 등록 / 변경 / 삭제
// 등록 방법: 버튼으로 파일 고르기 · 카드에 끌어다 놓기 · 카드에 마우스를 올리고 붙여넣기(Ctrl+V)

let hoverCard = null;   // 마우스가 올라가 있는 카드 { kind, id }
let pickedCard = null;  // 클릭해서 선택한 카드 - 붙여넣기(Ctrl+V)를 받는다

// 구성이 같은 세트(무상·유상·매출조건 등)는 사진을 같이 쓴다
const compKey = s => Object.entries(s.comp).map(([id, n]) => `${id}x${n}`).sort().join(',');
const sameCompSets = s => db.sets.filter(x => compKey(x) === compKey(s));
// 이미지 리스트에 보여줄 세트 카드: 같은 구성끼리 하나로 묶는다
function setGroups() {
  const groups = new Map();
  for (const s of db.sets) {
    const g = groups.get(compKey(s)) || { id: s.id, name: s.name, image: '', types: new Set() };
    g.image = g.image || s.image;
    g.types.add(s.type === '무상렌탈' ? '무상' : '유상');
    groups.set(compKey(s), g);
  }
  return [...groups.values()];
}

PAGES.images = function renderImagesPage() {
  hoverCard = null;
  const picked = (kind, x) => pickedCard && pickedCard.kind === kind && pickedCard.id === x.id;
  const card = (kind, x, name, hint) => `
    <div class="img-card ${picked(kind, x) ? 'picked' : ''}" onclick="pickCard(this, '${kind}', ${x.id})" onmouseenter="hoverCard = { kind: '${kind}', id: ${x.id} }" onmouseleave="hoverCard = null"
      ${dropAttrs(`uploadFor('${kind}', ${x.id}, imageFiles(event.dataTransfer)[0])`)}>
      <div class="pic" ${bg(x.image)}>${x.image ? '' : hint}</div>
      <b>${esc(name)}</b>
      <div class="row">
        <button class="btn" onclick="event.stopPropagation(); uploadFor('${kind}', ${x.id})">${x.image ? '변경' : '등록'}</button>
        ${x.image ? `<button class="btn danger" onclick="event.stopPropagation(); setImage('${kind}', ${x.id}, '')">삭제</button>` : ''}
      </div>
    </div>`;
  $('page-images').innerHTML = `
    <div class="page-head">
      <div><p class="title">이미지 리스트</p>
        <p class="sub" style="margin-top:8px; line-height:1.6">여기 등록한 사진이 장비 선택 화면과 견적서의 제품 사진에 자동으로 들어갑니다.<br>
        사진 파일을 카드 위로 드래그 앤 드롭하거나, 카드를 클릭해 선택한 뒤 복사한 이미지를 붙여넣기(Ctrl+V)해도 등록됩니다.</p></div>
      <span class="save-state sub"></span>
    </div>
    <p class="title">개별 상품</p>
    <div class="img-grid" style="margin-top:12px">${db.items.map(p => card('item', p, p.name || '(이름 없음)', '사진 없음')).join('')}</div>
    <div class="section">
      <p class="title">세트 상품</p>
      <p class="sub" style="margin:8px 0 12px; line-height:1.6">세트 사진을 등록하면 견적서에 세트 사진 한 장이 들어가고, 없으면 구성품 사진이 각각 들어갑니다.<br>
      구성이 같은 세트(무상·유상)는 한 칸으로 묶여 있고, 등록한 사진이 함께 적용됩니다.</p>
      <div class="img-grid">${setGroups().map(g => card('set', g, `${g.name}${g.types.size > 1 ? ' (무상·유상 공통)' : g.types.has('무상') ? ' (무상)' : ''}`, '구성품 사진<br>자동 사용')).join('')}</div>
    </div>`;
};

function setImage(kind, id, url) {
  const x = (kind === 'item' ? db.items : db.sets).find(v => v.id === id);
  if (!x) return;
  if (kind === 'item') x.image = url;
  else for (const s of sameCompSets(x)) s.image = url;   // 같은 구성의 세트 전부에 적용
  const top = scrollY;
  saveDb(); PAGES.images(); scrollTo(0, top);
}
// file이 없으면 파일 선택 창을 연다
async function uploadFor(kind, id, file) {
  if (file === undefined) file = await pickFile();
  else if (!file) return toast('이미지 파일(PNG·JPG·WEBP)만 넣을 수 있습니다.', true);
  if (!file) return;
  try { toast('이미지 올리는 중…'); setImage(kind, id, await uploadImage(file)); toast('이미지를 등록했습니다.'); }
  catch (e) { if (e.message !== 'unauthorized') toast('이미지 올리기 실패: ' + e.message, true); }
}
// 카드를 클릭하면 선택(다시 클릭하면 해제). 선택된 카드가 붙여넣기를 받는다.
function pickCard(el, kind, id) {
  const same = pickedCard && pickedCard.kind === kind && pickedCard.id === id;
  pickedCard = same ? null : { kind, id };
  for (const c of document.querySelectorAll('.img-card.picked')) c.classList.remove('picked');
  if (!same) el.classList.add('picked');
}
function pasteToImageCard(file) {
  const target = pickedCard || hoverCard;
  if (!target) return toast('사진을 넣을 상품 카드를 먼저 클릭해 선택한 뒤 붙여넣어 주세요.', true);
  uploadFor(target.kind, target.id, file);
}
