import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { installSite, publicPages } from '../backend/site.js';

test('public pages are rendered, linked and described; drafts stay outside the sitemap', async () => {
  const previous = { SITE_URL: process.env.SITE_URL, SEO_INDEXABLE: process.env.SEO_INDEXABLE };
  process.env.SITE_URL = 'https://test-domain.com';
  process.env.SEO_INDEXABLE = 'true';
  const app = express();
  await installSite(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const titles = new Set();
  const links = new Set();
  try {
    for (const page of publicPages) {
      const response = await fetch(base + page.path);
      assert.equal(response.status, 200, page.path);
      const html = await response.text();
      assert.equal((html.match(/<h1\b/g) || []).length, 1, page.path);
      assert.ok(html.includes(`rel="canonical" href="https://test-domain.com${page.path}"`), page.path);
      assert.match(html, /<meta name="description" content="[^"]+">/);
      assert.equal(response.headers.get('x-robots-tag'), page.noindex ? 'noindex, follow' : 'index, follow');
      const title = html.match(/<title>(.*?)<\/title>/)[1];
      assert.ok(!titles.has(title), `Duplicate title ${title}`); titles.add(title);
      const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
      assert.equal(schema['@context'], 'https://schema.org');
      for (const match of html.matchAll(/href="(\/[^"#?]*)"/g)) links.add(match[1]);
      if (page.path !== '/' && !page.children) assert.match(html, /aria-label="Breadcrumb"|id="quote-form"/);
    }
    const known = new Set([...publicPages.map(p => p.path), '/styles.css', '/content.css', '/favicon.svg']);
    for (const href of links) assert.ok(known.has(href), `Broken internal link ${href}`);
    for (const page of publicPages) assert.ok(page.path === '/' || links.has(page.path), `Orphan page ${page.path}`);
    const sitemap = await (await fetch(base + '/sitemap.xml')).text();
    for (const page of publicPages) assert.equal(sitemap.includes(`<loc>https://test-domain.com${page.path}</loc>`), !page.noindex, page.path);
    assert.match(await (await fetch(base + '/robots.txt')).text(), /Allow: \/\n/);
    assert.equal((await fetch(base + '/not-a-real-page/')).status, 404);
    assert.equal((await fetch(base + '/guides', { redirect: 'manual' })).status, 301);
    assert.equal((await fetch(base + '/index.html', { redirect: 'manual' })).status, 301);
    assert.deepEqual(await (await fetch(base + '/analytics-config')).json(), { measurementId: '' });
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const [key,value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test('local and staging pages default to noindex with no sitemap entries', async () => {
  const previous = process.env.SEO_INDEXABLE;
  delete process.env.SEO_INDEXABLE;
  const app = express(); await installSite(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/')).headers.get('x-robots-tag'), 'noindex, follow');
    assert.match(await (await fetch(base + '/robots.txt')).text(), /Disallow: \/\n/);
    assert.ok(!(await (await fetch(base + '/sitemap.xml')).text()).includes('<loc>'));
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.SEO_INDEXABLE; else process.env.SEO_INDEXABLE = previous;
  }
});
