// Read-only public deployment/indexing verification. No customer records are read.
import { publicPages } from '../backend/site.js';
const origin = new URL(process.argv[2] || 'https://haveaguru.com').origin;
let failed = 0;
const check = (ok, message) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`); if (!ok) failed++; };
const get = path => fetch(origin + path, { signal: AbortSignal.timeout(20000), redirect: 'manual' });
const robots = await (await get('/robots.txt')).text();
check(robots.includes('Allow: /') && !robots.includes('Disallow: /\n'), 'public crawling allowed');
check(robots.includes(`Sitemap: ${origin}/sitemap.xml`), 'canonical sitemap advertised');
const mapResponse = await get('/sitemap.xml');
const sitemap = await mapResponse.text();
check(mapResponse.status === 200 && /xml/.test(mapResponse.headers.get('content-type')), 'XML sitemap response');
for (const page of publicPages) {
  const response = await get(page.path);
  const html = await response.text();
  check(response.status === 200, `${page.path} HTTP 200`);
  check(html.includes(`rel="canonical" href="${origin}${page.path}"`), `${page.path} canonical`);
  check((html.match(/<h1\b/g) || []).length === 1 && /<title>[^<]+<\/title>/.test(html), `${page.path} heading/title`);
  check(html.includes('application/ld+json'), `${page.path} structured data`);
  check((response.headers.get('x-robots-tag') || '').includes(page.noindex ? 'noindex' : 'index') && (page.noindex || !(response.headers.get('x-robots-tag') || '').includes('noindex')), `${page.path} indexing header`);
  check(sitemap.includes(`<loc>${origin}${page.path}</loc>`) === !page.noindex, `${page.path} sitemap eligibility`);
}
for (const path of ['/uploads/not-a-file', '/data/quotes.sqlite', '/does-not-exist/']) check((await get(path)).status === 404, `${path} not publicly served`);
check((await get('/api/health')).status === 200, 'application/database health');
check((await get('/guides')).status === 301, 'trailing-slash redirect');
const alternate = new URL(origin); alternate.hostname = `www.${alternate.hostname}`;
const www = await fetch(alternate, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
check([301,308].includes(www.status) && www.headers.get('location') === origin + '/', 'www redirects to canonical host');
console.log(`\n${failed} checks failed`);
process.exitCode = failed ? 1 : 0;
