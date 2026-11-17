// 금액표(단품가·세트가)와 기본 문구 읽기 / 저장
import { json, denied, store } from '../lib/common.mjs';

export default async req => {
  const no = denied(req);
  if (no) return no;

  if (req.method === 'GET') {
    return json({ db: await store('pricing').get('db', { type: 'json' }) });   // 저장된 적 없으면 null
  }
  if (req.method === 'PUT') {
    const text = await req.text();
    if (text.length > 800_000) return json({ error: '데이터가 너무 큽니다.' }, 413);
    let db;
    try { db = JSON.parse(text); } catch { return json({ error: '잘못된 형식입니다.' }, 400); }
    if (!db || !Array.isArray(db.items) || !Array.isArray(db.sets)) return json({ error: '잘못된 형식입니다.' }, 400);
    await store('pricing').setJSON('db', { v: db.v, items: db.items, sets: db.sets, settings: db.settings || {}, savedAt: new Date().toISOString() });
    return json({ ok: true });
  }
  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/db' };
