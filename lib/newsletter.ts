import { CommerceError, db } from './commerce.ts';

export const newsletterVersion = 'footer-2026-11-22';
const mailConsent = 'Хочу получать статьи и анонсы лекций Людмилы Ладыженко по электронной почте.';
const dataConsent = 'Даю согласие на обработку моего email для подписки.';
export const newsletterForm = `<form id="newsletter" class="footer-signup" data-newsletter="${newsletterVersion}" method="post" action="/api/site/contact" aria-label="Подписка на рассылку">
  <label class="signup-caption" for="newsletter-email">Электронная почта</label>
  <input id="newsletter-email" name="email" type="email" autocomplete="email" placeholder="name@example.ru" required maxlength="254">
  <label class="signup-choice"><input name="mailConsent" type="checkbox" required><span>${mailConsent}</span></label>
  <label class="signup-choice"><input name="localConsent" type="checkbox" required><span>Даю <a href="/privacy#newsletter">согласие на обработку моего email</a> для подписки.</span></label>
  <button type="submit">Подписаться <span aria-hidden="true">→</span></button>
  <p class="signup-status" role="status" aria-live="polite"></p>
</form>`;

export function subscribe(data: Record<string, unknown>) {
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f]+\.[^\s@\x00-\x1f\x7f]+$/.test(email))
    throw new CommerceError(400, 'Проверьте адрес электронной почты.');
  if (data.mailConsent !== true || data.consent !== true || data.newsletter !== newsletterVersion)
    throw new CommerceError(400, 'Обновите страницу и отметьте оба согласия.');
  db().prepare(`INSERT INTO newsletter_subscribers (email, created, version, mail_consent, data_consent)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING`).run(email, new Date().toISOString(), newsletterVersion, mailConsent, dataConsent);
}

export type Subscriber = { email: string; created: string };
export function removeSubscriber(email: unknown) {
  if (typeof email !== 'string') throw new CommerceError(400, 'Выберите подписчика.');
  db().prepare('DELETE FROM newsletter_subscribers WHERE email = ?').run(email);
}
export function subscribers(): Subscriber[] {
  return db().prepare('SELECT email, created FROM newsletter_subscribers ORDER BY created DESC, email').all() as Subscriber[];
}

export function subscriberCsv() {
  const quote = (value: string) => '"' + (/^[=+@-]/.test(value) ? "'" : '') + value.replaceAll('"', '""') + '"';
  return '\uFEFFEmail,Дата подписки\r\n' + subscribers().map(s => quote(s.email) + ',' + quote(s.created) + '\r\n').join('');
}
