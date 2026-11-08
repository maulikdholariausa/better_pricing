# Have a Guru

A quote intake app: static frontend in dist/, Node.js API in backend/, and SQLite/private documents on persistent disk. The backend stores phone numbers, timestamped consent and file metadata. Contractor matching, redaction, notifications, accounts and admin UI are not implemented; nothing is automatically shared with contractors.

## Local development

Install Node.js 24 or newer:

```sh
npm ci
npm test
npm start
```

Open http://127.0.0.1:8000. Data is created in data/ (excluded from Git). `npm run check` checks syntax. Intake accepts five PDF/JPG/PNG files up to 20 MB each; validates file signatures, phone and consent. Signature checks are not malware scanning.

## Public content, search and analytics

The Node app server-renders the sitemap's content pages from `content/pages.js`. See [SEO and measurement plan](docs/SEO-PLAN.md) for the complete link structure, page inventory, crawler settings, editorial gates and analytics funnel. `dist/` alone is not the full site.

Local indexing defaults off. Production Compose derives SITE_URL from DOMAIN and defaults SEO_INDEXABLE to true; explicitly set SEO_INDEXABLE=false for staging. Draft legal/contact and unconfirmed location pages remain noindex. Optional GA4 uses `GA_MEASUREMENT_ID` and a visitor opt-in; no external analytics is active by default. `npm start` does not load `.env` automatically.

## Infrastructure vs application deployment

[Infrastructure setup and migration guide](infra/README.md)

- Terraform provisions EC2, networking, Elastic IP and protected encrypted EBS storage, installs deployment tools, and generates an EC2 GitHub deploy key.
- Add that PUBLIC key to this repository as a read-only deploy key once.
- Push application commits to main, then `npm run deploy` deploys local HEAD through Systems Manager. It fetches from GitHub, builds Docker images and restarts the app without replacing EC2.
- `npm run server:key` prints the public deploy key. `npm run server:status` shows the current commit, deployment history and container state. `npm run server:backup` creates a consistent DB/files archive on the data disk; copy backups off-instance.

Use `AWS_PROFILE=better-pricing` in your terminal. Run Terraform separately only when changing infrastructure. The deployment guide explains the one-time migration from the old bundled deployment; do not use an old saved Terraform plan.

The default remote deployment target is the instance/region in the local Terraform outputs. No AWS credentials, personal GitHub tokens, SQLite files, upload documents, Terraform state or local tfvars belong in Git. The private GitHub deploy key remains on EC2's encrypted data disk.

Single-instance restarts cause brief downtime. Automatic app rollback preserves the previous code but does not undo DB migrations. Off-instance backup scheduling, malware scanning, disk alerts, multi-instance availability and CI/CD automation are not yet configured.
