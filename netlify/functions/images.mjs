// 제품·세트 이미지 업로드(직원만) / 보기(누구나 - 고객용 견적 페이지에서 사용)
import { randomBytes } from 'node:crypto';
import { json, denied, store, parseDataUrl, QUOTE_ID } from '../lib/common.mjs';

export default async (req, context) => {
  const id = context.params.id;

  if (req.method === 'GET' && id) {
    const found = QUOTE_ID.test(id) ? await store('images').getWithMetadata(id, { type: 'arrayBuffer' }) : null;
    if (!found) return new Response('Not found', { status: 404 });
    return new Response(found.data, { headers: { 'content-type': found.metadata?.type || 'image/webp', 'cache-control': 'public, max-age=31536000, immutable' } });
  }
  if (req.method === 'POST' && !id) {
    const no = denied(req);
    if (no) return no;
    let body;
    try { body = await req.json(); } catch { return json({ error: '잘못된 형식입니다.' }, 400); }
    const image = parseDataUrl(body?.image, ['image/png', 'image/jpeg', 'image/webp'], 2_800_000);
    if (!image) return json({ error: '이미지는 PNG·JPG·WEBP, 2MB 이하만 올릴 수 있습니다.' }, 400);
    const newId = randomBytes(9).toString('base64url');
    await store('images').set(newId, image.bytes, { metadata: { type: image.type } });
    return json({ url: `/img/u/${newId}` });
  }
  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: ['/api/images', '/img/u/:id'] };
