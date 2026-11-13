// 고객용 견적 링크 만들기: 견적 내용과 미리보기 이미지를 저장하고 id를 돌려준다
import { randomBytes } from 'node:crypto';
import { json, denied, store } from '../lib/common.mjs';

const PNG = 'data:image/png;base64,';

export default async req => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const no = denied(req);
  if (no) return no;

  let body;
  try { body = await req.json(); } catch { return json({ error: '잘못된 형식입니다.' }, 400); }
  const { quote, image } = body || {};
  if (!quote || typeof quote !== 'object' || !Array.isArray(quote.lines) || JSON.stringify(quote).length > 50_000) {
    return json({ error: '견적 내용이 올바르지 않습니다.' }, 400);
  }
  if (typeof image !== 'string' || !image.startsWith(PNG) || image.length > 3_000_000) {
    return json({ error: '미리보기 이미지가 올바르지 않습니다.' }, 400);
  }

  const id = randomBytes(9).toString('base64url');
  const quotes = store('quotes');
  const png = Buffer.from(image.slice(PNG.length), 'base64');
  await quotes.set(id + '.png', png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength));
  await quotes.setJSON(id, { ...quote, createdAt: new Date().toISOString() });
  return json({ id });
};

export const config = { path: '/api/share' };
