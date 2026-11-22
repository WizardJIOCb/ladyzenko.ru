import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { db } from '../lib/commerce.ts';
import { newsletterVersion, subscribers, subscriberCsv, removeSubscriber } from '../lib/newsletter.ts';
import { POST as contact } from '../app/api/site/contact/route.ts';
import { GET } from '../app/api/admin/[action]/route.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lady-newsletter-'));
process.env.COMMERCE_STATE = dir;
after(() => { db().close(); fs.rmSync(dir, {recursive:true, force:true}); });
const origin = 'https://new.ladyzenko.ru';
function submit(fields: Record<string, unknown>) {
  return contact(new NextRequest(origin + '/api/site/contact', {
    method: 'POST', headers: {origin, 'Content-Type':'application/json'},
    body: JSON.stringify({newsletter:newsletterVersion, email:'Test@Example.test', consent:true, mailConsent:true, ...fields})
  }));
}
test('mailing list requires both consents, deduplicates addresses and excludes legacy requests', async () => {
  for (const invalid of [{consent:false}, {mailConsent:false}, {newsletter:'unknown'}, {email:'missing-at'}])
    assert.equal((await submit(invalid)).status, 400);
  assert.equal((await submit({newsletter:undefined, email:'legacy@example.test'})).status, 200);
  assert.equal(subscribers().length, 0);
  assert.equal((await submit({})).status, 200);
  assert.equal((await submit({email:' test@example.test '})).status, 200);
  assert.deepEqual(subscribers().map(s => s.email), ['test@example.test']);
  assert.match(subscriberCsv(), /"test@example.test"/);
  assert.doesNotMatch(subscriberCsv(), /legacy/);
  for (const action of ['subscribers','subscribers-csv'])
    assert.equal((await GET(new NextRequest(origin + '/api/admin/' + action), {params:Promise.resolve({action})})).status, 401);
  removeSubscriber('test@example.test');
  assert.equal(subscribers().length, 0);
});
