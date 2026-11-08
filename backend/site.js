import { readFile } from 'node:fs/promises';
import { pages, services, guides, costs, locations, sources, updated } from '../content/pages.js';

const brand = 'Have a Guru';
export const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const link = (url, label) => `<a href="${escape(url)}">${escape(label)}</a>`;
const nav = `<a class="skip-link" href="#main-content">Skip to content</a><header class="site-header"><a class="brand" href="/" aria-label="Have a Guru home"><span class="brand-icon" aria-hidden="true">⌂</span><span>Have a<span class="brand-light">Guru</span></span></a><nav aria-label="Main navigation">${link('/how-it-works/', 'How it works')}${link('/services/', 'Services')}${link('/guides/', 'Guides')}<a class="nav-cta" href="/upload-quote/" data-track="upload_cta_clicked">Upload a quote <span aria-hidden="true">↗</span></a></nav></header>`;
const footer = `<footer class="site-footer"><div><strong>${brand}</strong><p>A clearer quote. A more informed choice.</p></div><nav aria-label="Footer navigation">${[['/compare-contractor-quotes/', 'Compare quotes'], ['/costs/', 'Cost factors'], ['/locations/', 'Locations'], ['/for-contractors/', 'For contractors'], ['/about/', 'About'], ['/contact/', 'Contact'], ['/privacy/', 'Privacy draft'], ['/terms/', 'Terms draft']].map(([u,t]) => link(u,t)).join('')}</nav><small>© ${new Date().getFullYear()} ${brand}. No savings or contractor availability guaranteed.</small></footer>`;
const card = page => `<a class="resource-card" href="${page.path}"><span class="card-category">${escape(page.label || (page.type === 'cost' ? 'Cost factors' : page.type === 'service' ? 'Project checklist' : 'Homeowner guide'))}</span><h3>${escape(page.title)}</h3><p>${escape(page.description)}</p><span class="card-arrow" aria-hidden="true">Read more ↗</span></a>`;
const cta = `<aside class="content-cta"><div><p class="eyebrow">Ready for the next step?</p><h2>Start with the quote you have.</h2><p>Submit your existing estimate. Review the current service details and consent before uploading.</p></div><a class="button" href="/upload-quote/" data-track="upload_cta_clicked">Upload your quote →</a></aside>`;

export const hubs = [
  { path: '/services/', title: 'Compare Quotes by Home Improvement Project', description: 'Find trade-specific scope checklists for flooring, painting, roofing, kitchens, bathrooms and whole-project renovations.', children: services },
  { path: '/guides/', title: 'Make Sense of Your Contractor Quote', description: 'Practical answers to your questions about estimates, competing bids, negotiation and hiring.', children: guides },
  { path: '/costs/', title: 'Understand What Drives Your Project Cost', description: 'Explore the assumptions behind flooring, painting, roofing and bathroom estimates. No invented market averages.', children: costs },
  { path: '/locations/', title: 'Local Contractor Quote Resources', description: 'Official licensing resources and local questions to ask before hiring.', children: locations, noindex: true },
];
export const uploadPage = { path: '/upload-quote/', title: 'Upload Your Contractor Quote for Free', description: 'Submit up to five PDF, JPG or PNG contractor estimates with your phone number and explicit consent for review and potential contractor contact.' };
export const homePage = { path: '/', title: 'Compare Contractor Quotes & Explore Better Offers', description: 'Already have a contractor quote? Understand your estimate, compare equivalent work and submit your quote to Have a Guru.' };
export const publicPages = [homePage, uploadPage, ...hubs, ...pages];

function siteConfig() {
  const raw = process.env.SITE_URL || '';
  let origin = 'http://localhost:8000';
  if (raw) {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('SITE_URL must be an origin, such as https://your-domain.com');
    origin = url.origin;
  }
  const live = process.env.SEO_INDEXABLE === 'true' && origin.startsWith('https://') && !new URL(origin).hostname.endsWith('.example');
  return { origin, live };
}
function breadcrumbs(page) {
  const crumbs = [{ name: 'Home', path: '/' }];
  const parts = page.path.split('/').filter(Boolean);
  if (parts.length > 1) {
    const hub = hubs.find(h => h.path === `/${parts[0]}/`);
    if (hub) crumbs.push({ name: hub.title, path: hub.path });
    if (parts.length > 2) crumbs.push({ name: 'California', path: '/locations/california/' });
  }
  if (page.path !== '/') crumbs.push({ name: page.label || page.title, path: page.path });
  return crumbs;
}
function head(page, config) {
  const canonical = config.origin + page.path;
  const indexable = config.live && !page.noindex;
  const crumbs = breadcrumbs(page);
  const graph = [
    { '@type': 'Organization', '@id': config.origin + '/#organization', name: brand, url: config.origin + '/' },
    { '@type': 'WebSite', '@id': config.origin + '/#website', name: brand, url: config.origin + '/' },
    { '@type': ['guide', 'cost'].includes(page.type) ? 'Article' : 'WebPage', '@id': canonical + '#page', url: canonical, name: page.title, headline: page.title, description: page.description, inLanguage: 'en-US', isPartOf: { '@id': config.origin + '/#website' }, ...(['guide', 'cost'].includes(page.type) ? { dateModified: updated, author: { '@type': 'Organization', name: brand, url: config.origin + '/about/' }, publisher: { '@id': config.origin + '/#organization' }, mainEntityOfPage: canonical } : {}) },
    ...(page.path === '/' ? [] : [{ '@type': 'BreadcrumbList', itemListElement: crumbs.map((c,i) => ({ '@type': 'ListItem', position: i+1, name: c.name, item: config.origin + c.path })) }]),
  ];
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(page.title)} | ${brand}</title><meta name="description" content="${escape(page.description)}"><meta name="robots" content="${indexable ? 'index,follow,max-image-preview:large' : 'noindex,follow'}"><link rel="canonical" href="${escape(canonical)}"><meta property="og:type" content="${['guide','cost'].includes(page.type) ? 'article' : 'website'}"><meta property="og:site_name" content="${brand}"><meta property="og:title" content="${escape(page.title)}"><meta property="og:description" content="${escape(page.description)}"><meta property="og:url" content="${escape(canonical)}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escape(page.title)}"><meta name="twitter:description" content="${escape(page.description)}"><meta name="theme-color" content="#294d3d"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/content.css"><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replaceAll('<', '\\u003c')}</script><script defer src="/analytics.js"></script>`;
}
function shell(page, body, config) {
  return `<!doctype html><html lang="en"><head>${head(page, config)}</head><body>${nav}${body}${footer}</body></html>`;
}
function contentPage(page, config) {
  const crumbs = breadcrumbs(page).map((c,i,a) => i === a.length - 1 ? `<span aria-current="page">${escape(c.name)}</span>` : link(c.path,c.name)).join('<span aria-hidden="true">/</span>');
  const children = page.children;
  const sections = page.sections || [];
  const related = [...new Set([...(page.related || []), '/guides/how-to-compare-contractor-quotes/', '/guides/what-should-a-contractor-quote-include/'])].filter(p => p !== page.path).map(p => publicPages.find(x => x.path === p)).filter(Boolean).slice(0,3);
  return shell(page, `<main id="main-content" class="content-main"><nav class="breadcrumbs" aria-label="Breadcrumb">${crumbs}</nav><section class="page-hero"><p class="eyebrow">${children ? 'The resource collection' : page.type === 'service' ? 'Compare the details' : 'A more informed decision'}</p><h1>${escape(page.title)}</h1><p class="page-deck">${escape(page.description)}</p>${page.type ? `<p class="byline">By ${link('/about/', brand)} · Updated <time datetime="${updated}">November 7, 2026</time></p>` : ''}</section>${children ? `<section class="resource-grid" aria-label="Browse resources">${children.map(card).join('')}</section>` : `<div class="article-layout"><aside class="on-this-page"><strong>On this page</strong>${sections.map(([t],i) => link(`#section-${i+1}`,t)).join('')}<a href="/upload-quote/" data-track="upload_cta_clicked">Upload your quote →</a></aside><article>${sections.map(([title,text],i) => `<section id="section-${i+1}" class="article-section${i === 0 ? ' quick-answer' : ''}"><h2>${escape(title)}</h2><p>${escape(text)}</p></section>`).join('')}${page.type === 'service' ? `<section class="article-section"><h2>A simple comparison worksheet</h2><p>Use a row for each item below. This is a worksheet, not a price estimate.</p><div class="table-scroll"><table><caption>Questions to resolve with each bidder</caption><thead><tr><th scope="col">Item</th><th scope="col">What to record</th></tr></thead><tbody><tr><th scope="row">Work and quantities</th><td>Measured area, tasks and preparation</td></tr><tr><th scope="row">Products</th><td>Named specifications and approved substitutions</td></tr><tr><th scope="row">Unknowns</th><td>Allowances, exclusions and change approval</td></tr><tr><th scope="row">Handover</th><td>Schedule, cleanup, warranty and responsibilities</td></tr></tbody></table></div><p>Before sending documents, read ${link('/guides/can-i-share-a-contractor-quote/', 'what to check before sharing a quote')}.</p></section>` : ''}${page.type || page.path.startsWith('/locations/') ? `<section class="sources"><h2>Further reading</h2><p>General comparison and hiring guidance: ${sources.map(([title,url]) => link(url,title)).join(' · ')}. Trade checklists are editorial questions to discuss with your contractor, not construction specifications.</p></section>` : ''}</article></div>`}${page.noindex ? '' : cta}<section class="related"><h2>Keep exploring</h2><div class="resource-grid">${related.map(card).join('')}</div></section></main>`, config);
}

export async function installSite(app) {
  const template = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const config = siteConfig();
  app.use((req,res,next) => {
    if (/^\/(api|uploads|admin|account|dashboard|projects|quotes|checkout|confirmation)(\/|$)/.test(req.path)) res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  app.get('/robots.txt', (_req,res) => res.type('text/plain').send(config.live ? `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /uploads/\nDisallow: /admin/\nDisallow: /account/\nDisallow: /dashboard/\nDisallow: /projects/\nDisallow: /quotes/\nDisallow: /checkout/\nDisallow: /confirmation/\n\nSitemap: ${config.origin}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n'));
  app.get('/sitemap.xml', (_req,res) => res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${config.live ? publicPages.filter(p => !p.noindex).map(p => `<url><loc>${escape(config.origin + p.path)}</loc></url>`).join('') : ''}</urlset>`));
  app.get('/analytics-config', (_req,res) => {
    const id = /^G-[A-Z0-9]+$/.test(process.env.GA_MEASUREMENT_ID || '') ? process.env.GA_MEASUREMENT_ID : '';
    res.set('Cache-Control', 'no-store').json({ measurementId: id });
  });
  app.get('/index.html', (_req,res) => res.redirect(301, '/'));
  for (const page of publicPages) {
    if (page.path !== '/') app.get(page.path.slice(0,-1), (req,res,next) => req.path.endsWith('/') ? next() : res.redirect(301, page.path));
    app.get(page.path, (_req,res) => {
      res.set('X-Robots-Tag', config.live && !page.noindex ? 'index, follow' : 'noindex, follow');
      if (page.path === '/' || page.path === '/upload-quote/') {
        const home = page.path === '/';
        let body = template.slice(template.indexOf('<main>'), template.indexOf('  <footer>'));
        body = body.replace('<main>', '<main id="main-content" class="upload-main">').replace('id="headline">Your home project.<br>A little more<br><em>possibility.</em>', `id="headline">${home ? 'Got a quote?<br>Compare with<br><em>confidence.</em>' : 'Your next step.<br>Start with<br><em>your quote.</em>'}`);
        body = body.replace('No commitment. Just the opportunity to compare.', 'Read our <a href="/privacy/">privacy draft</a> and <a href="/terms/">service terms draft</a>.');
        body = body.replace('We’re working on finding competitive offers that could save you money on your project.', 'Your files have been received. Keep your reference number for your records.');
        body = body.replace('<script src="app.js"></script>', '').replaceAll('src="app.js"','src="/app.js"');
        const extra = home ? `<section class="home-resources"><div class="section-heading"><p class="eyebrow">Before you decide</p><h2>A clearer view of your project.</h2><p>Check the scope, understand the differences, and ask better questions.</p></div><div class="resource-grid">${services.slice(0,3).map(card).join('')}</div><div class="home-links">${link('/services/', 'All project checklists →')}${link('/guides/', 'Browse homeowner guides →')}${link('/costs/', 'Understand cost factors →')}</div><h2>Start with the right questions.</h2><div class="resource-grid">${guides.slice(0,3).map(card).join('')}</div></section>` : '';
        return res.type('html').send(shell(page, body + extra + '<script defer src="/app.js"></script>', config));
      }
      res.type('html').send(contentPage(page, config));
    });
  }
  // Unknown routes remain real 404s. Never serve the homepage as a catch-all.
}
