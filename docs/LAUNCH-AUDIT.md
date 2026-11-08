# Have A Guru launch audit — November 8, 2026

## Verified live

- Canonical domain: https://haveaguru.com . AWS EC2 in us-east-2, t3.small, Caddy HTTPS reverse proxy and healthy Node/SQLite application.
- Existing deployment performs a predeployment DB/files backup, builds before stopping the running app, checks health, and restores the previous release on failure. Backups are on the same persistent disk; off-instance recovery is not yet established by these checks.
- Instance requires IMDSv2. Persistent data volume is attached with DeleteOnTermination=false. Infrastructure code encrypts EBS and exposes only TCP 80/443; no public SSH or app/database port is declared. Container runs as a non-root user with read-only root filesystem and restricted capabilities.
- Public pages return rendered text, one H1, title, canonical metadata, JSON-LD and consistent index/noindex decisions. Robots advertises the canonical sitemap. Public routes are already indexable; no extra global indexing switch was required.
- Uploaded files and the SQLite path are not exposed through the web root. Unknown URLs return 404. This is not a penetration test or malware scan.
- Initial live audit's only failure was www serving duplicate pages. Commit 506864b fixes this; live verification confirms www → canonical 301 and HTTP → HTTPS 308.

## Policy facts supplied by operator

Have A Guru LLC; California, United States; reachtocontractguru@gmail.com. Intended matching is automated. Contractors pay for leads through Zelle. No street address, fixed retention period, Zelle recipient, prices or refund rules were supplied. The policies use the provided email/location and do not invent those facts. `content/legal.js` contains the substantive website policies; `docs/LEGAL-LAUNCH-DRAFT.md` is the earlier review worksheet, not the current published text.

## Work still required

1. Implement and test automated matching, an authorized contractor access/disclosure workflow, price/PII handling and contact routing. Intake alone does not perform these operations. Maintain disclosure records and stop future disclosures after withdrawal.
2. Establish a monitored email privacy/support workflow, retention/deletion and backup-expiry procedures. Review whether the paid-lead model requires sale/share disclosures, opt-out mechanisms and Global Privacy Control handling. The general sharing consent is not a substitute for applicable opt-out obligations. Current intake does not implement a sale/share preference system.
3. Define actual contractor pricing, payment recipient verification and purchase/refund terms before collecting Zelle lead payments. No payment processor or reconciliation integration is implemented by this audit.
4. Set up scheduled encrypted off-instance backups and test a restore; add disk-capacity and service-availability alerts and an appropriate upload malware-scanning process.
5. Verify ownership in Google Search Console and Bing Webmaster Tools and submit https://haveaguru.com/sitemap.xml . DNS verification values are account-issued and have not been provided; no verification or account submission is claimed complete.
6. Review final policies with counsel for the actual operator/jurisdictions. California-only location text does not establish that a street address is unnecessary for every obligation.

## Re-run technical checks

`node scripts/audit-site.mjs https://haveaguru.com`

This checks public routes and metadata, indexing headers, sitemap eligibility, private-path 404s, health and hostname redirection without retrieving customer records. Robots access does not guarantee ranking, indexing or AI citations.
