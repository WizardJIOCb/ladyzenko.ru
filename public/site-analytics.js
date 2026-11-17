/* One optional counter. Never attach a tracker to an order/admin/private page. */
(function(){
  'use strict';
  if(window.ladyAnalytics)return;
  var counter=106094504,key='ladyzenko-analytics-v1',started=false,last='',choice='';
  function excluded(){return /^\/(admin|api|orders|commerce-private|commerce-remote)(\/|$)/.test(location.pathname)||new URLSearchParams(location.search).has('preview');}
  function read(){try{return localStorage.getItem(key)||'';}catch(_){return choice;}}
  function cleanUrl(value){try{var u=new URL(value,location.origin);if(u.origin===location.origin&&/^\/(orders|admin|api)(\/|$)/.test(u.pathname))return '';return u.origin+u.pathname;}catch(_){return '';}}
  function goal(name){if(!excluded()&&read()==='accepted'&&started)window.ym(counter,'reachGoal',name);}
  function pageview(){
    if(excluded()||read()!=='accepted')return;
    if(!started){
      started=true;
      window.ym=window.ym||function(){(window.ym.a=window.ym.a||[]).push(arguments);};window.ym.l=Date.now();
      var script=document.createElement('script');script.async=true;script.src='https://mc.yandex.ru/metrika/tag.js';document.head.appendChild(script);
      window.ym(counter,'init',{defer:true,clickmap:false,trackLinks:false,trackHash:false,webvisor:false,accurateTrackBounce:false,disableYtm:true});
    }
    var url=cleanUrl(location.href);if(url===last)return;last=url;
    var source=new URLSearchParams(location.search).get('utm_source')||'';
    var params={};if(/^(chatgpt\.com|perplexity(?:\.ai)?|claude(?:\.ai)?|yandex|google|telegram|vk)$/i.test(source))params.source=source;
    window.ym(counter,'hit',url,{title:document.title,referer:cleanUrl(document.referrer),params:params});
    if(/^\/checkout\//.test(location.pathname))goal('checkout_view');
  }
  function banner(){
    if(excluded()||document.getElementById('site-analytics-consent'))return;
    var box=document.createElement('section');box.id='site-analytics-consent';box.className='site-consent t-descr';box.setAttribute('aria-label','Аналитика сайта');
    box.innerHTML='<p>Разрешить Яндекс Метрику? Она помогает понять, какие материалы полезны посетителям. Можно пользоваться сайтом без неё. <a href="/privacy#analytics">Об аналитике</a>.</p><div class="site-consent-actions"><button type="button" data-choice="accepted">Разрешить</button><button type="button" data-choice="declined">Без аналитики</button></div>';
    box.addEventListener('click',function(e){var value=e.target.getAttribute('data-choice');if(!value)return;choice=value;try{localStorage.setItem(key,value);}catch(_){}box.remove();
      if(value==='accepted')pageview();else if(started){window.ym(counter,'destruct');location.reload();}
    });document.body.appendChild(box);
  }
  window.ladyAnalytics={goal:goal,pageview:pageview};
  document.addEventListener('site:pageview',pageview);
  document.addEventListener('site:subscription',function(){goal('subscription_success');});
  document.addEventListener('site:checkout',function(){goal('checkout_created');});
  document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href],button[data-analytics-settings]');if(!a)return;if(a.hasAttribute('data-analytics-settings')){banner();return;}var href=a.getAttribute('href')||'';
    if(/^\/checkout\//.test(href))goal('purchase_click');
    else if(/^https:\/\/t\.me\//.test(href))goal('contact_telegram');
    else if(/^mailto:/.test(href))goal('contact_email');
    else if(/^tel:/.test(href))goal('contact_phone');
  },true);
  if(!excluded()){if(read()==='accepted')pageview();else if(!read())banner();}
})();
