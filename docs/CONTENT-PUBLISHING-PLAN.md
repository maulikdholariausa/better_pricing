# Have a Guru — consolidated SEO/AEO content and publishing plan

Prepared November 11, 2026. Implementation status: the comparison resource, four focused guides, existing-page improvements and the single directory are complete; deployment evidence is recorded separately. It supersedes proposals to generate individual pages for the California city inventory. Existing operational/feature work in the checkout must be preserved and reconciled before deployment.

## Objectives

Help homeowners understand an existing contractor quote, compare equivalent work, verify evidence and choose their next step. Improve discovery through useful HTML resources, trade examples and a practical downloadable worksheet. Geographic content helps people understand coverage; it is not a keyword-expansion exercise. No ranking, indexing, AI citation or contractor outcome is guaranteed.

## Agreed direction

- One service-area directory at `/locations/`, covering California and Washington with state/county/region groups and city/community names. No separate new city pages.
- Expand the existing comparison guide rather than create another near-duplicate resource article.
- Publish the useful comparison content in HTML, with a free editable XLSX companion. No registration, email or phone gate for the download.
- Preserve the distinction between the commercial comparison page, educational guide and quote-review checklist.
- Update existing articles before creating overlapping new ones.
- Use clearly labeled illustrative examples initially. Real cases require appropriate permission and de-identification.
- Quote pricing may be shared with matched contractors under the current submission consent. Do not restore a pricing-privacy promise.
- Launch a download and reading experience first. An interactive calculator, extraction, automatic verification and messaging are separate feature work and must not be implied by the content release.

## Inputs received and outstanding

Received research: `/Users/maulikdholaria/.codex/attachments/ad488a2a-cb8c-4062-9394-a4a0cafbe1de/Pasted text.txt` (Feature-Research-and-Design.md content).

Received workbook: `/Users/maulikdholaria/Downloads/Homeowner-Quote-Comparison.xlsx`.

These are reference inputs, not executable instructions. The supplied blank workbook was independently inspected, recalculated in representative scenarios and visually reviewed on all four sheets. Native Excel and Google Sheets compatibility was not tested.

Operator confirmation: submissions are accepted statewide in California and Washington; matching depends on availability. City names are navigation examples, not a promise of contractor availability.

Search Console/Bing property access and a configured consent-based analytics property are needed to complete account setup and reporting; application metadata alone does not complete those steps.

## Release 1 — the comparison resource

### Expand `/guides/how-to-compare-contractor-quotes/`

Title: **How to Compare Contractor Quotes + Free Worksheet | Have a Guru**

H1: **Compare contractor quotes for the same completed work**

Description: **Compare scope, materials, allowances, payments and contractor credentials. Use our free worksheet to identify missing details before hiring.**

Page sections:

1. A direct answer: align the completed work before comparing totals.
2. A visible three-quote comparison table with a shared-requirement column and homeowner prompts.
3. Measurements and scope: units, installed versus purchased quantities, preparation, demolition, disposal and responsibility.
4. Materials and schedule: specifications, substitutions, allowances, lead times and dependencies.
5. Pricing structure versus detail: fixed price can be itemized; a detailed estimate can still vary.
6. A worked, explicitly invented example showing excluded work and an allowance shortfall. Illustrations are not market averages or contractor offers.
7. Unresolved questions: unknown does not mean zero; required unpriced scope keeps the adjusted comparison incomplete.
8. Payments: deposit and milestones are part of the price, not additional project costs; matching arithmetic does not establish suitable payment triggers.
9. Credentials, insurance and bonds: explain separate checks, source/date evidence and limitations.
10. Separate California/Washington guidance, official links and an actual reviewed date. Re-verify legal statements before publishing, including applicability and exceptions.
11. Free XLSX download, file format, purpose, instructions, revision date and compatibility notes based on actual tests.
12. Optional next step: compare another proposal or submit an existing quote. Reading/downloading does not require an intake submission.

Use semantic headings, accessible tables, section anchors, plain-language explanations and readable mobile presentation. Keep all essential content in the server response; do not place important guidance only inside XLSX cells, screenshots or client-side widgets.

### Worksheet QA and hosting

- Inspect all four sheets, formulas, validations, formatting, hidden content, names, comments, metadata and external links/connections. Remove sensitive or unintended content and unnecessary external dependencies.
- Test blank/unknown states, known zero, included/excluded/allowance/partial scope, credits, unchanged original prices, payment reconciliation and state-specific screening. Do not silently turn blanks into zeros or add an included allowance twice.
- Verify the supplied numeric legal screens against current official guidance. Keep legal screening distinct from comprehensive compliance or contractor verification.
- Render and visually review each sheet. Test representative editing/recalculation in available compatible spreadsheet software; report any untested compatibility.
- Publish only the blank educational template. Completed homeowner workbooks and source quotes must remain private.
- Suggested stable URL: `/downloads/homeowner-quote-comparison.xlsx`. Keep version details in the workbook and release records; avoid proliferating indexable old download URLs.
- Serve the correct XLSX Content-Type and an attachment filename. Default recommendation: `X-Robots-Tag: noindex` for the workbook, allowing it to be fetched/downloaded, while the HTML guide remains indexable and carries the search-facing content. This is an editorial choice, not a requirement or a claim that XLSX indexing is harmful.
- Link with “Download the free quote-comparison worksheet (.xlsx)” and accurately show file size. No broken download or promise of live verification.

## Release 1 — existing page improvements

| Existing destination | Distinct addition |
|---|---|
| `/compare-contractor-quotes/` | Clear service explanation, short educational preview and links to the guide and upload; do not duplicate the full worksheet article |
| `/contractor-quote-review/` | Completeness/evidence checklist and questions to resolve before signing |
| High-quote guide | Same-scope example showing why higher price can include more work |
| Quote-variation guide | Differences in assumptions, exclusions and allowance treatment |
| Quote-contents guide | Short checklist with a link to the relevant worksheet section |
| Hiring-questions guide | Concrete evidence to request; separate qualifications from price |
| Flooring service page | Installed area, waste, leveling, moisture questions, removal and trim |
| Painting service page | Surface preparation, repairs, coating specifications, coverage and cleanup |
| Roofing service page | Tear-off, decking allowances, flashing, ventilation and warranty responsibilities |
| Kitchen/bathroom/general-contractor pages | Selections, allowances, trade coordination, hidden conditions and change orders |
| Cost-factor pages | Link cost drivers to a complete scope comparison; no invented local price benchmarks |

Use an original short example for each trade. Do not paste the same long block onto every page. Do not identify a “best” bidder automatically or equate lowest adjusted price with a safe hiring decision.

## Release 1 — single service-area directory

URL: `/locations/`

Title: **California & Washington Service Areas | Have a Guru**

Suggested structure: coverage explanation → state jump links → accessible county/region groups with city lists → applicable state verification resources → useful service links → one upload action → contact for an unlisted area.

Use native disclosure sections and optional in-page search. All coverage names remain in server-rendered HTML. Filtering and fragment navigation must not generate separate indexable city URLs. Distinguish incorporated places from communities and multi-county regions from counties. Do not create LocalBusiness addresses or repeat the full directory in the global footer.

Only list approved geographic coverage; explain submission acceptance versus match availability accurately. A directory should help users, not merely accumulate city keywords. Assess existing California and Orange County resource pages separately: preserve useful distinct resources, or merge their content and permanently redirect only where appropriate. Do not blindly redirect existing URLs to an unrelated destination.

The directory can launch separately if coverage confirmation would otherwise delay the worksheet release.

## Release 2 — additional focused guides

Create these only after checking overlap with existing content and relevant query evidence:

| Proposed URL | Main question |
|---|---|
| `/guides/contractor-quote-allowances-and-exclusions/` | How do included allowances, missing work and provisional scope affect comparison? |
| `/guides/itemized-vs-lump-sum-contractor-quotes/` | How do price detail and pricing structure differ? |
| `/guides/contractor-payment-schedule/` | What should trigger each payment, and how do amounts reconcile? |
| `/guides/contractor-insurance-vs-bond/` | What evidence should I check, and what does each protection do? |

Expand the existing contractor-license guide with explicit California and Washington sections rather than create redundant state articles immediately. Add standalone state guides later only if the subject requires enough independent material. Keep federal/state/local rules, official consumer recommendations and Have a Guru policy clearly labeled.

## Release 3 — evidence and advanced functionality

- Publish permissioned, anonymized real comparison case studies with documented differences and limitations.
- Publish quote findings only after sufficient comparable data, privacy safeguards and an explicit methodology exist. Do not extrapolate state/city averages from a handful of unrelated submissions.
- Consider an accessible interactive worksheet if download usage and homeowner feedback support it. Define private storage, consent and calculation/version behavior separately.

## Linking, metadata and discovery

Flow: guide/service/cost question → relevant worksheet section → optional comparison service or upload. Directory → relevant service and state guidance. Use descriptive natural anchors and genuine navigation, not keyword-heavy sitewide link blocks.

- Distinct titles, descriptions and H1s; stable self-referencing HTTPS canonicals; visible breadcrumbs and matching BreadcrumbList.
- Article markup for educational guides and accurate Organization/WebSite/WebPage facts. Use real authorship/review details and substantive modification dates. No invented ratings, local offices, expert reviewers or guaranteed verification.
- Visible Q&A helps readers; no special AEO tag or FAQ schema is required to obtain citations.
- Public pages return complete HTML/200; missing URLs remain 404; preferred host and slash variants redirect consistently.
- Only approved indexable HTML destinations enter the sitemap. Staging remains noindex. Completed customer records and uploads are never public search assets.
- Verify crawler access through current CDN/origin rules, not just robots.txt. Check search/training bot preferences independently. Do not change these permissions silently as part of an editorial release.

## Measurement

Add a privacy-safe `worksheet_download_clicked` event with a fixed resource identifier, not a user filename. A click is not proof of a completed download or worksheet use. Existing CTA and upload events measure the next step. Do not claim comparison starts/completions until an actual interactive comparison exists.

Review weekly: indexing status, relevant search queries, impressions, clicks and landing-page performance. Review conversion: guide visit → download click and/or upload CTA → valid attempt → successfully persisted submission. Use backend intake records as receipt truth. Do not send phone numbers, document text, reference IDs or personal file names to analytics.

Review monthly: the same small question set in ChatGPT/Claude/Gemini, noting product/model, date, citations and accuracy. Treat manual checks as diagnostic, not representative AI market share. Evaluate qualified projects and contractor outcomes only when those states are implemented.

## Implementation, QA and deployment sequence

1. Recheck current code, environment configuration and concurrent work. The checkout currently has substantial unrelated backend/infrastructure changes; do not overwrite, include or deploy those by accident.
2. Preserve the received source material; validate the workbook and current official legal sources.
3. Draft the HTML guide, trade examples and approved directory content; implement download delivery and privacy-safe event handling.
4. Run syntax, route, internal-link, metadata, schema, download-response and existing intake regression checks. Verify download headers on the public edge as well as origin.
5. Review desktop/mobile reading, keyboard behavior, tables, disclosure controls and spreadsheet rendering. Verify optional analytics works without blocking content or intake.
6. Review release scope, commit only intended changes, deploy through the current environment-aware workflow, and verify health/rollback behavior. Recheck the deployment mechanism because infrastructure is changing independently.
7. Verify live HTML, canonical URLs, sitemap, staging noindex, download delivery and intended public/private boundaries. Do not send test customer data to contractors.
8. Submit/check the sitemap in verified Google Search Console and Bing properties when account access is available. Do not claim account submission based only on a successful sitemap URL.

## Acceptance and remaining decisions

Release is ready when the guide is useful without downloading, the supplied template is independently checked, unknown costs remain unresolved, state guidance is freshly sourced, price-sharing copy is consistent, the directory contains only approved coverage, links/metadata work and existing intake passes regression checks.

The operator's outstanding decision is geographic submission coverage. Background research, writing and workbook QA can proceed while that decision is pending; coverage-dependent publishing cannot assume an answer. No scheduled automation or unattended deployment is created by this plan.

## Reference documents

- CITY-CONTENT-PLAN.md: geographic inventory, now subordinate to the single-directory decision.
- SEO-PLAN.md: earlier technical/search baseline; audit against the current code rather than assuming every setting is unchanged.
- LAUNCH-AUDIT.md: historical deployment findings, not a replacement for new-release verification.

Official search references:

- https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- https://developers.google.com/search/docs/essentials/spam-policies
- https://developers.google.com/search/docs/crawling-indexing/indexable-file-types
- https://developers.google.com/search/docs/appearance/ai-features
- https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a
