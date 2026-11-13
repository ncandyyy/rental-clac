// 링크 미리보기(카톡·톡톡)용 이미지
import { store, QUOTE_ID } from '../lib/common.mjs';

export default async (req, context) => {
  const id = context.params.id;
  const png = QUOTE_ID.test(id) ? await store('quotes').get(id + '.png', { type: 'arrayBuffer' }) : null;
  if (!png) return new Response('Not found', { status: 404 });
  return new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' } });
};

export const config = { path: '/og/:id' };
