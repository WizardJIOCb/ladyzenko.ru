/* Local adapters for the published Tilda page. No dependency on Tilda feeds/forms. */
(function () {
  'use strict';
  function readableHash() {
    var hash = location.hash.slice(1);
    if (!hash) return;
    var anchor = Array.from(document.querySelectorAll('[data-legacy-anchors]')).find(function (node) {
      return node.getAttribute('data-legacy-anchors').split(' ').indexOf(hash) >= 0;
    });
    if (!anchor) return;
    history.replaceState(history.state, '', location.pathname + location.search + '#' + anchor.id);
    anchor.scrollIntoView();
  }
  document.addEventListener('DOMContentLoaded', readableHash);
  window.addEventListener('hashchange', readableHash);
  window.addEventListener('popstate', readableHash);
  // Legacy Tilda menu scrolling assumes record IDs. Handle readable anchors
  // before those handlers so a menu click reaches the actual section.
  document.addEventListener('click', function (event) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    if (location.pathname.indexOf('/tpost/') === 0 && link.matches('.t-feed__post-popup__close-wrapper a.t-popup__close')) {
      event.preventDefault(); event.stopImmediatePropagation();
      location.assign('/articles');
      return;
    }
    var url; try { url = new URL(link.href, location.href); } catch (_) { return; }
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return;
    var anchor = document.getElementById(url.hash.slice(1));
    if (!anchor || !anchor.hasAttribute('data-legacy-anchors')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (location.hash !== url.hash) history.pushState(history.state, '', url.hash);
    var menu = document.querySelector('#rec967078711 button[aria-expanded="true"]');
    if (menu) menu.click();
    window.scrollTo(0, Math.max(0, anchor.getBoundingClientRect().top + window.scrollY));
  }, true);
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
    if (!form.matches('form[data-local-form], form[data-newsletter]')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    var button = form.querySelector('[type=submit]');
    if (button.disabled) return;
    var email = (form.querySelector('[name=email]') || {}).value || '';
    var box = form.querySelector('.signup-status, .js-successbox') || document.createElement('p');
    if (!box.parentNode) form.appendChild(box);
    box.setAttribute('role', 'status'); box.textContent = ''; box.style.display = 'block';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { box.textContent = 'Укажите корректный email.'; return; }
    var consent = form.querySelector('[name=localConsent]');
    if (!consent || !consent.checked) { box.textContent = 'Подтвердите согласие на обработку данных.'; return; }
    button.disabled = true;
    try {
      var payload = { email: email, consent: true, page: location.pathname };
      if (form.dataset.newsletter) {
        payload.newsletter = form.dataset.newsletter;
        payload.mailConsent = form.elements.mailConsent.checked;
      }
      var response = await fetch('/api/site/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось сохранить заявку.');
      box.textContent = form.dataset.newsletter ? 'Спасибо! Вы подписались на рассылку.' : 'Заявка сохранена. Спасибо!'; form.reset();
      document.dispatchEvent(new Event('site:subscription'));
    } catch (error) { box.textContent = error instanceof TypeError ? 'Не удалось подключиться. Попробуйте ещё раз.' : error.message; }
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
