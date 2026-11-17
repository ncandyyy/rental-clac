import { createHash, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const hash = s => createHash('sha256').update(s).digest();

// 직원 공용 비밀번호 확인. 통과하면 null, 아니면 에러 응답을 돌려준다.
export function denied(req) {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) return json({ error: 'Netlify 환경변수 SITE_PASSWORD가 설정되지 않았습니다.' }, 503);
  let given = '';
  try { given = decodeURIComponent(req.headers.get('x-password') || ''); } catch { /* 잘못된 인코딩 */ }
  if (!timingSafeEqual(hash(given), hash(expected))) return json({ error: '비밀번호가 올바르지 않습니다.' }, 401);
  return null;
}

// 저장 직후 바로 읽을 수 있도록 strong consistency 사용
export const store = name => getStore({ name, consistency: 'strong' });

export const QUOTE_ID = /^[A-Za-z0-9_-]{8,24}$/;
export const INDEX_KEY = '_index';   // 대시보드용 견적 목록 (QUOTE_ID 형식이 아니라 외부에서 조회 불가)

// data:image/...;base64 → { type, bytes }
export function parseDataUrl(dataUrl, types, maxLength) {
  if (typeof dataUrl !== 'string' || dataUrl.length > maxLength) return null;
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!m || !types.includes(m[1])) return null;
  const buf = Buffer.from(m[2], 'base64');
  return { type: m[1], bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
}

// 견적 목록을 안전하게 고쳐 쓰기. 동시에 두 명이 저장해도 서로 덮어쓰지 않도록 etag로 확인하고 다시 시도한다.
export async function updateIndex(change) {
  const quotes = store('quotes');
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await quotes.getWithMetadata(INDEX_KEY, { type: 'json' });
    const next = change(current?.data || []);
    const result = await quotes.setJSON(INDEX_KEY, next, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
    if (result.modified) return;
  }
  throw new Error('견적 목록 저장이 계속 충돌합니다. 잠시 후 다시 시도해주세요.');
}

// 구글 시트 연동(선택): SHEET_WEBHOOK_URL이 있으면 견적 요약 한 줄을 보낸다. 실패해도 저장은 계속된다.
export async function pushSheet(row) {
  const url = process.env.SHEET_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(row), signal: AbortSignal.timeout(6000) });
  } catch { /* 시트 기록 실패는 무시 */ }
}
