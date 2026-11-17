// 이미지 리스트: 단품·세트 이미지 등록 / 변경 / 삭제
// 등록 방법: 버튼으로 파일 고르기 · 카드에 끌어다 놓기 · 카드에 마우스를 올리고 붙여넣기(Ctrl+V)

let hoverCard = null;   // 붙여넣기를 받을 카드 { kind, id }

PAGES.images = function renderImagesPage() {
  hoverCard = null;
  const card = (kind, x, name, hint) => `
    <div class="img-card" onmouseenter="hoverCard = { kind: '${kind}', id: ${x.id} }" onmouseleave="hoverCard = null"
      ${dropAttrs(`uploadFor('${kind}', ${x.id}, imageFiles(event.dataTransfer)[0])`)}>
      <div class="pic" ${bg(x.image)}>${x.image ? '' : hint}</div>
      <b>${esc(name)}</b>
      <div class="row">
        <button class="btn" onclick="uploadFor('${kind}', ${x.id})">${x.image ? '변경' : '등록'}</button>
        ${x.image ? `<button class="btn danger" onclick="setImage('${kind}', ${x.id}, '')">삭제</button>` : ''}
      </div>
    </div>`;
  $('page-images').innerHTML = `
    <div class="page-head">
      <div><p class="title">이미지 리스트</p>
        <p class="sub" style="margin-top:8px; line-height:1.6">여기 등록한 사진이 장비 선택 화면과 견적서의 제품 사진에 자동으로 들어갑니다.<br>
        사진 파일을 카드 위로 끌어다 놓거나, 카드에 마우스를 올린 채 복사한 이미지를 붙여넣기(Ctrl+V)해도 등록됩니다.</p></div>
      <span class="save-state sub"></span>
    </div>
    <p class="title">개별 상품</p>
    <div class="img-grid" style="margin-top:12px">${db.items.map(p => card('item', p, p.name || '(이름 없음)', '사진 없음')).join('')}</div>
    <div class="section">
      <p class="title">세트 상품</p>
      <p class="sub" style="margin:8px 0 12px">세트 사진을 등록하면 견적서에 세트 사진 한 장이 들어가고, 없으면 구성품 사진이 각각 들어갑니다.</p>
      <div class="img-grid">${db.sets.map((s, i) => card('set', s, `${i + 1}. ${s.name}${s.type === '무상렌탈' ? ' (무상)' : ''}`, '구성품 사진<br>자동 사용')).join('')}</div>
    </div>`;
};

function setImage(kind, id, url) {
  const x = (kind === 'item' ? db.items : db.sets).find(v => v.id === id);
  if (!x) return;
  x.image = url;
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
function pasteToImageCard(file) {
  if (!hoverCard) return toast('사진을 넣을 상품 카드 위에 마우스를 올린 뒤 붙여넣어 주세요.', true);
  uploadFor(hoverCard.kind, hoverCard.id, file);
}
