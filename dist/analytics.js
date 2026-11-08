// Intentionally never send form values, document names, IDs, URLs with query
// strings, or free-form error messages to analytics.
(() => {
  const allowed = new Set(['upload_cta_clicked', 'quote_files_selected', 'quote_upload_started', 'quote_upload_failed', 'quote_uploaded', 'consent_recorded']);
  let enabled = false;
  let measurementId = '';
  const safePath = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const pagePath = safePath ? new URL(safePath).pathname : '/';
  window.trackSiteEvent = name => {
    if (!allowed.has(name)) return;
    const detail = { event: name, page_path: pagePath };
    window.dispatchEvent(new CustomEvent('site:analytics', { detail }));
    if (enabled) window.gtag('event', name, { page_path: pagePath });
  };
  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('[data-track]');
    if (anchor) window.trackSiteEvent(anchor.dataset.track);
  });
  const preference = value => {
    try { if (value) localStorage.setItem('analytics-consent', value); return localStorage.getItem('analytics-consent'); }
    catch { return null; }
  };
  const enable = () => {
    if (enabled || !measurementId) return;
    enabled = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    // Manual page view avoids query strings, fragments, and referrer PII.
    window.gtag('config', measurementId, { send_page_view: false, page_location: new URL(pagePath, location.origin).href, page_referrer: '' });
    window.gtag('event', 'page_view', { page_location: new URL(pagePath, location.origin).href, page_referrer: '', page_title: document.title });
    const script = document.createElement('script');
    script.async = true; script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.append(script);
  };
  fetch('/analytics-config').then(r => r.json()).then(config => {
    measurementId = config.measurementId;
    if (!measurementId) return;
    const controls = document.createElement('div');
    controls.className = 'analytics-controls';
    const message = document.createElement('span');
    message.textContent = 'Optional analytics helps us improve these resources.';
    const accept = document.createElement('button'); accept.textContent = 'Allow analytics';
    const decline = document.createElement('button'); decline.textContent = 'Decline analytics';
    const update = () => {
      const consent = preference();
      message.textContent = consent === 'granted' ? 'Optional analytics is enabled.' : consent === 'denied' ? 'Optional analytics is disabled.' : 'Optional analytics helps us improve these resources.';
      accept.hidden = consent === 'granted';
      decline.textContent = consent === 'granted' ? 'Turn off analytics' : 'Decline analytics';
    };
    accept.onclick = () => { preference('granted'); enable(); update(); };
    decline.onclick = () => { preference('denied'); if (enabled) location.reload(); else update(); };
    controls.append(message, accept, decline); document.querySelector('footer')?.append(controls);
    if (preference() === 'granted') enable(); update();
  }).catch(() => { /* Analytics failure never blocks the site or submission. */ });
})();
