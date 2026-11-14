/* Local adapters for the published Tilda page. No dependency on Tilda feeds/forms. */
(function () {
  'use strict';
  var open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var args = Array.prototype.slice.call(arguments);
    try {
      var u = new URL(String(url), location.href);
      if (/^feeds\./.test(u.hostname) && /\/api\/(getfeed|getpost)\//.test(u.pathname)) args[1] = '/api/site/feed' + u.search + '&action=' + (u.pathname.indexOf('getpost') >= 0 ? 'post' : 'list');
    } catch (_) {}
    return open.apply(this, args);
  };
  // Tilda attaches click handlers that can cancel submission before the submit event.
  document.addEventListener('click', function (e) {
    var button = e.target.closest && e.target.closest('form[data-local-form] button[type=submit]');
    if (!button) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!button.disabled) button.form.requestSubmit(button);
  }, true);
  document.addEventListener('submit', async function (e) {
    var form = e.target;
    if (!form.matches('form[data-local-form]')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    var button = form.querySelector('[type=submit]');
    if (button.disabled) return;
    var email = (form.querySelector('[name=email]') || {}).value || '';
    var box = form.querySelector('.js-successbox') || document.createElement('p');
    if (!box.parentNode) form.appendChild(box);
    box.setAttribute('role', 'status'); box.textContent = ''; box.style.display = 'block';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { box.textContent = 'Укажите корректный email.'; return; }
    var consent = form.querySelector('[name=localConsent]');
    if (!consent || !consent.checked) { box.textContent = 'Подтвердите согласие на обработку данных.'; return; }
    button.disabled = true;
    try {
      var response = await fetch('/api/site/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, consent: true, page: location.pathname }) });
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось сохранить заявку.');
      box.textContent = 'Заявка сохранена. Спасибо!'; form.reset();
    } catch (error) { box.textContent = error.message; }
    finally { button.disabled = false; }
  }, true);
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('form[data-local-form]').forEach(function (form) {
      var label = document.createElement('label');
      label.style.cssText = 'display:block;margin:12px 0;font:14px/1.5 Arial,sans-serif;color:inherit;';
      label.innerHTML = '<input type="checkbox" name="localConsent" required> Согласен с <a href="/consent">обработкой персональных данных</a> и <a href="/privacy">политикой конфиденциальности</a>';
      form.appendChild(label);
    });
  });
})();
