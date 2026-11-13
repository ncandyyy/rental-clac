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
