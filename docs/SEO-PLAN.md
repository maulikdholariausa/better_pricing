# Search, AI discovery and measurement plan

Implemented November 7, 2026. Public pages are rendered by `backend/site.js`; editorial content is in `content/pages.js`. Existing submission storage and API remain intact. Deploying this code is separate from completing a public launch.

## Information architecture and links

| Entry | Links onward | Purpose |
|---|---|---|
| Home `/` | Services, guides, cost factors, how it works, upload | Introduce quote comparison and expose useful resources |
| `/services/` | Six trade-specific comparison pages | Let visitors choose the right project checklist |
| Service detail | Sharing guide, comparison guides, upload | Resolve trade-specific questions and move to intake |
| `/guides/` | Twelve question-specific articles | Answer research-stage queries without requiring submission |
| Guide detail | Related guides, comparison/review pages, upload | Provide next steps in context |
| `/costs/` | Four cost-factor articles | Explain differences without fabricated market averages |
| Cost detail | Relevant service page, quote-variation guide, upload | Connect cost research to equivalent-scope comparison |
| Locations hub | California and Orange County resources | Educational location information; coverage unconfirmed |
| Every public page | Main navigation and footer | Keep hubs discoverable without JavaScript |
| Every detail page | Visible breadcrumbs and related resources | Connect back to hubs and avoid orphan pages |

All navigation is standard HTML `<a href>` links. Each page has one H1, ordered H2/H3 content and a distinct search intent. The commercial comparison page explains the product; the comparison guide explains a worksheet. Keep those roles distinct to avoid competing duplicate content.

## Page inventory

- Core: `/`, `/upload-quote/`, `/how-it-works/`, `/compare-contractor-quotes/`, `/contractor-quote-review/`, `/for-contractors/`, `/about/`, `/contact/`, `/privacy/`, `/terms/`.
- Hubs: `/services/`, `/guides/`, `/costs/`, `/locations/`.
- Services: flooring, painting, roofing, kitchen-remodel, bathroom-remodel and general-contractor under `/services/{trade}-quote-comparison/`.
- Twelve guides: high quote, comparing, negotiating, number of estimates, quote contents, estimate vs contract, quote variation, sharing, lowest bid, hiring questions, second quote and license checks.
- Four costs: flooring installation, interior painting, roof replacement and bathroom remodel.
- Location resources: `/locations/california/` and `/locations/california/orange-county/`.

Contact, legal drafts and locations are built and linked but always `noindex` and excluded from the sitemap. Finalize operator contact, privacy/retention/rights handling and legal terms; establish actual contractor coverage before removing those flags. No city-name doorway pages or fictional local offices are created.

## Rendering and search metadata

The Node server sends complete HTML, including body text and links. Public content does not depend on client-side rendering or hydration. The existing upload form uses JavaScript only for interaction and submission. Deploy the Node application; uploading only `dist` to S3 would omit the rendered content routes.

Each page has a unique title and description, absolute canonical, `lang=en`, viewport, Open Graph, Twitter summary metadata, theme color and SVG favicon. Organization/WebSite/WebPage and BreadcrumbList JSON-LD describe visible facts. Guide/cost pages use Article with organization authorship and an honest editorial update date. No fake named experts, ratings, prices, reviews, business addresses or operating Service schema are supplied. Structured data does not guarantee enhanced results. Add a real 1200×630 social image later if desired; none is falsely referenced.

System sans-serif fonts render without downloads. Georgia provides the existing hero accent. Type scales responsively, body copy has comfortable line spacing, cards and tables adapt to small screens, focus styles and a skip link support keyboard use. No font-rendering dependency on Google Fonts remains.

## Crawl and publication configuration

1. Set `SITE_URL=https://the-real-canonical-domain.com` (origin only) and `SEO_INDEXABLE=true` on the production application. Docker Compose derives SITE_URL from DOMAIN; it reads SEO_INDEXABLE from `.env`, defaulting to true in production Compose. Local `npm start` does not load `.env` automatically: export values in the shell. For local npm start, a missing flag leaves all pages noindex and robots disallowed. Use `SEO_INDEXABLE=false` on staging regardless of domain.
2. Redirect the alternate hostname to the canonical hostname at the proxy/CDN. Canonical tags consolidate signals but are not a replacement for the redirect. Choose the existing deployed domain; do not use the illustrative domain from the strategy without owning it.
3. Confirm HTTPS, DNS, public 200 responses, reachable CSS/JS, redirects and real 404s. Do not put a login or bot challenge in front of public resources. Preserve access controls around uploads and personal records.
4. Verify the domain via DNS in Google Search Console and Bing Webmaster Tools. Submit `/sitemap.xml` and inspect representative home, guide and service URLs. Crawlability and a sitemap permit discovery; neither guarantees indexing or ranking.
5. Production robots allows public crawling, including search/AI crawlers under the wildcard rule, and disallows API/private route families. Noindex headers cover those route families. Robots is not authentication. Private quote documents remain outside the static web root.
6. Sitemap includes only indexable canonical routes; draft/legal/location pages are omitted. No automated `lastmod` is emitted because deployment time is not an editorial change date.
7. Run `npm run check` and `npm test`, then validate selected pages in Google's Rich Results Test/Schema.org validator, Search Console URL Inspection and Lighthouse/PageSpeed Insights. Check mobile reading, keyboard navigation and real upload behavior separately.

## AEO / GEO / AI search

The strategy is focused answers in readable HTML, specific headings, meaningful comparison checklists, visible sources, documented limitations and original evidence when available. AEO/GEO is not a special submission protocol. No metadata setting guarantees that a model will recommend or cite the site.

- Google says standard SEO practices apply to AI features; no special AI schema is required. See https://developers.google.com/search/docs/appearance/ai-features . Review available generative-AI inclusion controls in Search Console before launch.
- OpenAI distinguishes search discovery (OAI-SearchBot) from training (GPTBot). The current wildcard policy permits public crawling; this does not create a separate training opt-out. A future explicit training preference can be added without blocking search, using https://developers.openai.com/api/docs/bots .
- Bing's guidelines cover Bing/Copilot discovery: https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a . Check available AI preferences and AI performance reporting in the verified account.
- A crawler user agent alone is not proof of identity. Verify claimed bots against official published IP/rDNS guidance when using access logs for reporting.
- `llms.txt` is not required for Google indexing or inclusion in AI answers. This implementation prioritizes HTML and sitemap rather than presenting a supplemental file as a ranking mechanism.
- Publish original, permissioned anonymized quote findings only after a sufficient dataset, methodology, time period and scope comparability review exist. Never expose uploaded source documents, customer PII or unsupported savings statistics.

## Measurement

External analytics is OFF by default. Set `GA_MEASUREMENT_ID=G-...` to show optional analytics controls in the footer. No Google tag loads before opt-in. Decline/withdrawal is available in the same controls. Review the completed privacy notice and applicable consent requirements before enabling a provider. Disable GA4 enhanced measurement, automatic form interactions and user-provided data collection in the property; keep application events free of PII. Check collection in DebugView and browser Network tools before launch.

| Layer | Metric | Cadence |
|---|---|---|
| Search Console | Index coverage, sitemap status, query/page impressions, clicks, CTR and available AI reporting | Weekly |
| Bing Webmaster Tools | Indexing, search traffic and available AI citation/grounding reports | Weekly |
| Web analytics | Landing-page traffic and upload funnel by page/source | Weekly |
| Intake database | Successfully persisted submissions and eventual qualified leads | Weekly |
| Performance | LCP, INP, CLS and mobile usability from field data when available | Monthly and after layout changes |
| AI answer audit | Same 20–30 prompts, exact date/engine, cited URL and factual accuracy | Monthly |

Browser events implemented: `upload_cta_clicked`, `quote_files_selected`, `quote_upload_started`, `quote_upload_failed`, `quote_uploaded`, `consent_recorded`. The last two fire only after a successful API receipt. They contain only an allowlisted event name and canonical page path. No phones, file names, quote text, reference IDs, query strings or free-form errors are sent. Events are also emitted locally as `site:analytics` for integration/debugging. Referrer and query parameters are intentionally suppressed for privacy; this limits attribution. Do not enable auto collection without reviewing it.

Mark `quote_uploaded` as a GA4 key event. Acknowledge browser analytics undercounts due to refusal, blockers and failed connections; use the submissions database as intake truth. `consent_recorded` is not phone verification. Do not report `phone_verified`, `qualified_lead` or `contractor_connected` until those backend states exist. Add sanitized server-side outcome reporting when implemented.

Funnel: upload CTA → files selected → valid upload attempt → successful intake → qualified project → contractor connection. Primary business metrics: qualified projects per organic landing page and acquisition cost per qualified project. AI mentions/citations are diagnostic, not equivalent to conversions. Manual AI prompt checks vary by time, geography and personalization and are not a representative market-share estimate.

## Content maintenance and launch gates

Publish the comparison, review, flooring/painting and strongest guides first if editorial review capacity is limited. All requested pages are built, but publishing everything at once is not necessary. Review cost/trade content with appropriate expertise, finalize real support/legal details and service claims, then enable production indexing. Keep update dates tied to substantive content revisions. Add real examples and diagrams when they improve understanding; do not generate repetitive location pages for keyword coverage.

Before public intake, complete privacy/terms/contact operations and data retention/rights processes. Current legal drafts describe implementation limits rather than inventing business policies. No external deployment, Search Console verification, analytics property creation or account changes were performed by this implementation.
