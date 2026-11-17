// 이미지 리스트: 단품·세트 이미지 등록 / 변경 / 삭제

PAGES.images = function renderImagesPage() {
  const card = (kind, x, name, hint) => `
    <div class="img-card">
      <div class="pic" ${bg(x.image)}>${x.image ? '' : hint}</div>
      <b>${esc(name)}</b>
      <div class="row">
        <button class="btn" onclick="changeImage('${kind}', ${x.id})">${x.image ? '변경' : '등록'}</button>
        ${x.image ? `<button class="btn danger" onclick="setImage('${kind}', ${x.id}, '')">삭제</button>` : ''}
      </div>
    </div>`;
  $('page-images').innerHTML = `
    <div class="page-head">
      <div><p class="title">이미지 리스트</p><p class="sub" style="margin-top:8px">여기 등록한 사진이 장비 선택 화면과 견적서의 제품 사진에 자동으로 들어갑니다.</p></div>
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
  saveDb(); closeModal(); PAGES.images();
}
// 기본 제공 사진에서 고르거나 새 파일을 올린다
function changeImage(kind, id) {
  const x = (kind === 'item' ? db.items : db.sets).find(v => v.id === id);
  openModal(`
    <h2 style="font-size:18px">${esc(x.name)}</h2>
    <p>아래 사진 중에서 고르거나, 새 사진 파일을 올려주세요.</p>
    <div class="row" style="margin-top:16px"><button class="btn dark" onclick="uploadFor('${kind}', ${id})">내 컴퓨터에서 사진 올리기</button></div>
    <div class="lib-grid">${LIB.map(l => `
      <button onclick="setImage('${kind}', ${id}, '${l.url}')" title="${esc(l.name)}"><div ${bg(l.url)}></div><span>${esc(l.name)}</span></button>`).join('')}</div>`, true);
}
async function uploadFor(kind, id) {
  const url = await pickAndUpload();
  if (url) setImage(kind, id, url);
}
