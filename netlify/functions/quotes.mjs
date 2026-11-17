// 견적 저장 / 목록(대시보드) / 불러오기 / 수정 / 삭제 - 직원만
import { randomBytes } from 'node:crypto';
import { json, denied, store, parseDataUrl, updateIndex, pushSheet, QUOTE_ID, INDEX_KEY } from '../lib/common.mjs';

const text = (v, max) => String(v ?? '').slice(0, max);
const num = v => Number(v) || 0;
const IMAGE_URL = /^\/img\/(lib\/[\w.-]+|u\/[\w-]+)$/;   // 우리 사이트에 있는 이미지만 허용

// 고객에게 보이는 견적 내용. 정해진 항목만 골라 담는다.
function cleanQuote(q) {
  if (!q || typeof q !== 'object' || !Array.isArray(q.lines) || !q.lines.length || q.lines.length > 60) return null;
  return {
    customer: text(q.customer, 60), phone: text(q.phone, 40), date: text(q.date, 10), staff: text(q.staff, 30),
    months: num(q.months),
    lines: q.lines.map(l => ({
      kind: l.kind === 'set' ? 'set' : 'item', name: text(l.name, 120), qty: num(l.qty),
      unit: num(l.unit), list: num(l.list), setDisc: num(l.setDisc), eventDisc: num(l.eventDisc), final: num(l.final),
    })),
    list: num(q.list), setDisc: num(q.setDisc), eventDisc: num(q.eventDisc), special: num(q.special),
    supply: num(q.supply), vatAmount: num(q.vatAmount), final: num(q.final), total: num(q.total),
    notes: (Array.isArray(q.notes) ? q.notes : []).slice(0, 12).map(n => text(n, 200)),
    conds: (Array.isArray(q.conds) ? q.conds : []).slice(0, 10).map(n => text(n, 300)),
    images: (Array.isArray(q.images) ? q.images : []).filter(i => i && IMAGE_URL.test(i.url)).slice(0, 27)
      .map(i => ({ url: i.url, name: text(i.name, 60) })),
  };
}
const summary = (id, q, times) => ({
  id, ...times, date: q.date, customer: q.customer, phone: q.phone, staff: q.staff, months: q.months,
  items: q.lines.map(l => l.name + (l.qty > 1 ? ' ×' + l.qty : '')).join(' / '),
  supply: q.supply, final: q.final,
});
const sheetRow = (action, origin, s, q) => ({
  action, id: s.id, 저장일시: s.updatedAt || s.createdAt, 견적일: s.date, 담당자: s.staff, 고객명: s.customer, 연락처: s.phone,
  구성: s.items, 정상가합계: q?.list, 세트할인: q?.setDisc, 이벤트할인: q?.eventDisc, 특별할인: q?.special,
  월렌탈료_VAT별도: s.supply, 월렌탈료_VAT포함: s.final, 약정개월: s.months, 링크: `${origin}/q/${s.id}`,
});

export default async (req, context) => {
  const no = denied(req);
  if (no) return no;
  const quotes = store('quotes');
  const id = context.params.id;
  const origin = new URL(req.url).origin;

  try {
    if (!id) {
      if (req.method === 'GET') return json({ quotes: (await quotes.get(INDEX_KEY, { type: 'json' })) || [] });
      if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    } else if (!QUOTE_ID.test(id)) {
      return json({ error: '견적을 찾을 수 없습니다.' }, 404);
    }

    if (req.method === 'GET') {
      const rec = await quotes.get(id, { type: 'json' });
      return rec ? json({ id, quote: rec.public || rec, state: rec.state || null }) : json({ error: '견적을 찾을 수 없습니다.' }, 404);
    }

    if (req.method === 'DELETE') {
      await updateIndex(list => list.filter(s => s.id !== id));
      await quotes.delete(id);
      await quotes.delete(id + '.png');
      await pushSheet({ action: 'delete', id });
      return json({ ok: true });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const raw = await req.text();
      if (raw.length > 3_500_000) return json({ error: '데이터가 너무 큽니다.' }, 413);
      let body;
      try { body = JSON.parse(raw); } catch { return json({ error: '잘못된 형식입니다.' }, 400); }
      const q = cleanQuote(body?.quote);
      if (!q) return json({ error: '견적 내용이 올바르지 않습니다.' }, 400);
      const image = parseDataUrl(body.image, ['image/png'], 3_000_000);
      if (!image) return json({ error: '미리보기 이미지가 올바르지 않습니다.' }, 400);
      const state = body.state && typeof body.state === 'object' && JSON.stringify(body.state).length < 20_000 ? body.state : null;

      const now = new Date().toISOString();
      let key = id, createdAt = now;
      if (req.method === 'PUT') {
        const old = await quotes.get(id, { type: 'json' });
        if (!old) return json({ error: '견적을 찾을 수 없습니다.' }, 404);
        createdAt = old.createdAt || now;
      } else {
        key = randomBytes(9).toString('base64url');
        if (key.startsWith('_')) key = 'q' + key.slice(1);
      }
      const times = { createdAt, updatedAt: now };
      await quotes.set(key + '.png', image.bytes);
      await quotes.setJSON(key, { public: q, state, ...times });
      const s = summary(key, q, times);
      await updateIndex(list => [s, ...list.filter(x => x.id !== key)]);
      await pushSheet(sheetRow('upsert', origin, s, q));
      return json({ id: key });
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: e.message || '서버 오류' }, 500);
  }
};

export const config = { path: ['/api/quotes', '/api/quotes/:id'] };
