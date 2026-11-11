# Content release — November 11, 2026

Content-only release based on the active production version 22bb03f. The newer backend and concurrent analytics work are deliberately excluded. The corresponding content changes are also committed on main; an ancestry-only merge records this independently deployable release without replacing main’s backend.

## Published coverage

- Enhanced existing quote-comparison guide, free blank XLSX, and four focused guides covering allowances/exclusions, pricing structures, payments, and insurance/bonds.
- Contextual examples and links on existing trade, cost and hiring pages.
- One server-rendered California/Washington directory with optional local filtering. Operator confirms statewide submissions in both states; matching depends on availability. No new city URLs or local office claims.
- Indexable HTML, canonical titles/descriptions, existing structured data, contextual links and the existing sitemap. The XLSX is downloadable without registration, carries noindex, and is excluded from the sitemap.

## Verification

- Exact production dependency installation: no reported vulnerabilities; syntax checks and all 12 release tests pass.
- Main checkout: 26 tests previously passed, including newer backend checks.
- Workbook: inspected four visible sheets, ZIP/XML metadata and external dependencies; no macros or external workbook links found. Tested blank/unknown scope, included/excluded scope, allowance shortfalls, payment reconciliation and state-specific screens. Example adjusted total: $21,800. Reimported the unchanged original and visually reviewed four sheet renders. Native Excel/Google Sheets editing was not tested.
- Browser checks: guide, directory filtering, narrow-screen layout and horizontal table containment passed.
- Official California CSLB and Washington L&I sources were reviewed for the dated guidance. Illustrative examples are labeled; they are not market pricing or hiring recommendations.

The submitted sitemap address remains https://haveaguru.com/sitemap.xml. Search Console/Bing account changes and guaranteed search/AI inclusion are outside this release.
