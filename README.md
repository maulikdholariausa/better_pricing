# Have a Guru

A quote intake app: static frontend in dist/, Node.js API in backend/, and SQLite on persistent disk and private quote documents in S3 in production. The backend stores phone numbers, timestamped consent and file metadata. File uploads are all-or-nothing: any failed file clears the attempt and requires a fresh upload. The quote upload flow includes AWS SMS verification and lifetime verified-phone bypass. Automatic contractor matching, redaction, history/profile and admin UI are not implemented; nothing is automatically shared with contractors. See [quote upload and rollout](docs/QUOTE-UPLOAD.md).

## Local development

Install Node.js 24 or newer, then run from this project directory:

```sh
npm ci
npm run dev
```

| Command | Environment | Local URL | S3 bucket | Database |
| --- | --- | --- | --- | --- |
| `npm run dev` (live reload) or `npm start` | dev | http://localhost:8000 | `haveaguru-quotes-dev` | `data/dev/quotes.sqlite` |
| `npm run staging` | staging | http://localhost:8001 | `haveaguru-quotes-staging` | `data/staging/quotes.sqlite` |
| `npm run prod` | prod | http://localhost:8002 | `haveaguru-quotes-prod` | `data/prod/quotes.sqlite` |

Stop any old process using the same port before starting. Dev verification uses code **123456** by default. Staging/prod require real AWS SMS configuration. All three environments upload documents to S3; none silently falls back to local document storage. Each environment has a separate private bucket in `us-east-2`. Existing environment files were migrated into their respective buckets. Existing object key prefixes are preserved.

Settings load from the checked-in environment defaults, then `.env`, then `.env.dev` / `.env.staging` / `.env.prod`. Exported shell settings take priority. Defaults select `haveaguru-quotes-dev`, `haveaguru-quotes-staging`, or `haveaguru-quotes-prod`. Set `QUOTES_BUCKET` only in the matching local environment file if an override is needed; avoid a shared `.env` bucket override. Set `AWS_REGION` and `AWS_PROFILE` there if needed. Dev/staging default to your existing `better-pricing` AWS profile; production on EC2 uses its instance role. Do not put access keys in checked-in files. The corresponding S3 prefix is enforced for each environment.

For local staging or prod, configure `NOTIFY_CONFIGURATION_ID` and `NOTIFY_CODE_CONFIGURATION_ID`; set `AWS_PROFILE=better-pricing` for local prod if needed. These commands serve the selected environment locally and do not deploy it. Local pages are noindex by default. EC2 Compose sets the public domain, port 8000 and production indexing separately.

`npm run check` checks syntax and `npm test` runs integration checks. See [quote upload configuration and rollout](docs/QUOTE-UPLOAD.md) for AWS provisioning.

## Public content, search and analytics

The Node app server-renders the sitemap's content pages from `content/pages.js`. See [SEO and measurement plan](docs/SEO-PLAN.md) for the complete link structure, page inventory, crawler settings, editorial gates and analytics funnel. `dist/` alone is not the full site.

Local indexing defaults off. Production Compose derives SITE_URL from DOMAIN and defaults SEO_INDEXABLE to true; explicitly set SEO_INDEXABLE=false for staging. Draft legal/contact and unconfirmed location pages remain noindex. Google Tag Manager uses container `GTM-5V25KW4H` and loads after the visitor allows optional analytics. Override `GTM_CONTAINER_ID` to change it or set it empty to disable GTM. GTM takes priority over the direct `GA_MEASUREMENT_ID` integration to avoid loading both tracking setups; publish your desired tags in the GTM container. `npm start` loads `.env` and `.env.dev` automatically.

## Infrastructure vs application deployment

[Infrastructure setup and migration guide](infra/README.md)

- Terraform provisions EC2, networking, Elastic IP and protected encrypted EBS storage, installs deployment tools, and generates an EC2 GitHub deploy key.
- Add that PUBLIC key to this repository as a read-only deploy key once.
- Push application commits to main, then `npm run deploy` deploys local HEAD through Systems Manager. It fetches from GitHub, builds Docker images and restarts the app without replacing EC2.
- `npm run server:key` prints the public deploy key. `npm run server:status` shows the current commit, deployment history and container state. `npm run server:backup` creates a consistent DB/files archive on the data disk; copy backups off-instance.

Use `AWS_PROFILE=better-pricing` in your terminal. Run Terraform separately only when changing infrastructure. The deployment guide explains the one-time migration from the old bundled deployment; do not use an old saved Terraform plan.

The default remote deployment target is the instance/region in the local Terraform outputs. No AWS credentials, personal GitHub tokens, SQLite files, upload documents, Terraform state or local tfvars belong in Git. The private GitHub deploy key remains on EC2's encrypted data disk.

Single-instance restarts cause brief downtime. Automatic app rollback preserves the previous code but does not undo DB migrations. Off-instance backup scheduling, malware scanning, disk alerts, multi-instance availability and CI/CD automation are not yet configured.

Content sections use descriptive heading anchors (for example, #get-written-clarifications). Old #section-N targets remain available for existing links. These anchors stay on the same article; they do not create duplicate pages.
