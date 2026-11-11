# Quote upload implementation and rollout

One submission is one quote containing 1–5 PDF/JPG/PNG attachments (20 MiB each). SQLite stores users, quotes, attachments, consent and verification state on the existing encrypted EBS data disk. Original documents are private, encrypted S3 objects. Nothing automatically sends a quote to a contractor; `queued` is the matching/review queue for a future administration tool.

## Local preview

```sh
npm ci
npm run dev
```

Open http://localhost:8000. Dev uploads to the private `haveaguru-quotes-dev` bucket, staging to `haveaguru-quotes-staging`, and prod to `haveaguru-quotes-prod`, all in us-east-2. Existing object prefixes (`quotes-dev/`, `quotes-staging/`, `quotes-prod/`) are retained within their respective buckets. Existing files were migrated to the corresponding environment buckets. Local databases are separate under `data/dev/`, `data/staging/`, and `data/prod/`. The development-only verification code is **123456**. This shortcut is ignored in production. Do not use real customer documents for local testing. Set GURU_DEV_OTP=0 in dev to use real SMS. Staging and prod always require real verification and the AWS configuration below; the app never silently pretends SMS was sent.

## Database

| Table | Purpose and important fields |
| --- | --- |
| `users` | `id`, unique `phone_e164`, permanent `phone_verified_at`, `created_at` |
| `quotes` | `id`, `user_id`, phone snapshot, legacy compatibility fields (`submission_key`, `request_hash`), hashed verification token, consent version/text, `created_at`, `uploaded_at`, `phone_verified_at`, `verification_method`, `matching_status`, `expires_at` |
| `quote_files` | `id`, `quote_id`, unique position within quote, original name, MIME, size, stable unique `s3_key`, SHA-256, `storage_status`, `stored_at`, `last_error` |
| `phone_verifications` | `id`, `quote_id`, provider reference, status, send/attempt counters, last-send time, expiry, verified timestamp |
| `rate_counters` | scope + hashed subject + time window primary key, durable count |
| `submissions`, `files` | Original legacy records; preserved along with their original local attachments |

Existing submissions are migrated into users/quotes/file metadata at startup, with `legacy_unverified` and `legacy_local` statuses. Their old attachments remain intact on EBS. They are not falsely marked phone verified, queued, or S3-backed. A separate migration of those historical files to S3 is needed if desired; ordinary new uploads all use S3 in production.

```
uploading → awaiting_verification → queued
          ↘ queued (phone previously verified)
```

Uploads are all-or-nothing. The phone and quote rows are committed before writing to S3. If any attachment fails, all objects for that new quote (including object versions and uncertain PUT acknowledgements) are removed, then its quote/file records are deleted. A newly created, unverified user is also removed if they have no other quotes. Existing users, verified-phone status and earlier successful quotes are preserved. If S3 cleanup is temporarily unavailable, the attempt is hidden as `cleanup_pending` and retried in the background and after restart. It can never enter matching.

Lifetime verification bypass is deliberately based on the phone record, including new browsers, as requested. This does not authenticate the submitter as the phone's owner. A future profile/history screen must independently verify ownership and restrict results to the most recent 60 days; that screen is not implemented here.

## Upload and verification API

1. `POST /api/quotes`: one multipart request containing phone, consent, consentVersion, and 1–5 `quotes` attachments. Every request is a new quote. On any file failure, the form is cleared and asks the user to select and upload all files again.
2. A successful upload returns its receipt and a short-lived verification token. The token is kept only in the current page's memory to authorize the SMS step; no upload state is stored in browser storage.
3. `POST /api/quotes/:id/verification/send`: sends a managed AWS Notify code, authorized by that verification token.
4. `POST /api/quotes/:id/verification/check`: validates the code and queues the quote; previously verified numbers bypass this step.

There are no upload-resume, per-file retry, status-recovery or completion endpoints. Refreshing starts a fresh form. Existing incomplete uploads from the previous implementation are cleaned up after restart. Successfully saved quotes awaiting phone verification remain saved, as before; an SMS failure does not delete successfully uploaded documents.

## Abuse controls

- US-only phone validation checks actual country, not merely +1. Notify also enables only US/SMS.
- 10 new quotes per phone/IP per UTC-sized day window; 200 globally per day.
- 30 attachment attempts per IP/hour; 300 MiB reserved per IP/day and 2 GiB globally/day. At most four concurrent attachment transfers per app process. Attempts count even if a connection/storage call fails.
- API 120 requests/IP/minute, backed by SQLite; edge WAF uses 100 API requests/IP/minute, 1,000 site requests/IP/5 minutes plus AWS common rules/IP reputation.
- SMS: 60-second cooldown, three sends/phone/day, ten/IP/day, 100 globally/day, 400 per fixed 32-day window, five code checks per quote challenge and five-minute expiry. Retry after a day starts a new challenge; resends do not reset incorrect-code attempts. Counters are reserved before AWS calls, including failures/timeouts.
- AWS Notify monthly spend limit defaults to $25. This is a service spending ceiling, not a guaranteed total AWS bill cap. Notify's managed fraud protection supplements application limits.
- API/profile/verification responses are not cached. Public CloudFront responses have a short cache and deployments request invalidation. CloudFront provides Shield Standard; WAF adds application filtering. These measures reduce abuse but cannot guarantee zero unwanted traffic or costs.
- Each private S3 bucket blocks public access and ACLs, requires TLS and uses encryption/versioning. IAM limits app object access to this bucket's production quote prefix. Neither S3 URLs nor phone numbers are returned by quote status APIs.
- MIME/extension and byte signatures are checked; this is not malware scanning. No public attachment-serving or download endpoint is exposed.

## AWS configuration

Terraform requires Node.js, AWS CLI v2 with Notify/endusermessaging commands, and the existing AWS profile. Notify currently has no native resource in this Terraform AWS provider. `terraform_data.notify` runs an idempotent AWS CLI setup, selects an active English verification template, enforces US/SMS only and sets the spend limit. The resources have AWS deletion protection; Terraform destruction intentionally does not delete them. Their IDs are discoverable in `/<project>/notify` in Parameter Store. The display name is Have a Guru.

Production settings are in the encrypted `/<project>/runtime` SSM parameter. Deployments fetch them using EC2's role; no AWS access keys are stored in the repository. The IMDSv2 hop limit is two so the Docker application can use that role. Runtime settings contain the bucket, region, Notify/code configuration IDs, SMS send ceiling and CloudFront origin secret.

IAM was checked with `uvx iam-policy-autopilot@latest generate-policies backend/quote-services.js --region us-east-2 --account 444958704871 --pretty`. The analyzer does not yet recognize the new EndUserMessaging SDK client. Its broad S3 baseline was narrowed to the two required operations and actual bucket prefix; Notify actions were checked against the AWS service authorization reference: https://docs.aws.amazon.com/service-authorization/latest/reference/list_endusermessaging.html .

## Staged rollout

The live site is not changed by editing these files or running plan. Back up before applying: this bootstrap change replaces EC2, retains the protected data volume/Elastic IP, and restores the previously deployed Git commit first.

```sh
export AWS_PROFILE=better-pricing
npm run server:backup
cd infra
terraform init
terraform plan -out=quote-upload.tfplan
terraform apply quote-upload.tfplan
terraform output -json certificate_dns_records
terraform output -json origin_dns_record
```

Add the certificate validation CNAMEs and the `origin` A record in Squarespace DNS. Retain certificate validation records for renewal. The first apply leaves CloudFront disabled and the current root/www DNS unchanged. Do not reuse a saved plan after changing code or variables.

Commit/push the application changes, then deploy the full pushed SHA with the ordinary `npm run deploy -- <sha>` command from the project root. Confirm an actual SMS and multi-file S3 upload before enabling edge-only traffic. Local tests use injected services and do not send real messages. Notify may require account/service eligibility steps; do not remove origin protections or widen sending countries to bypass an AWS rejection.

After Caddy has obtained HTTPS for `origin.haveaguru.com` and ACM is issued:

```sh
cd infra
terraform plan -var=enable_cloudfront=true -out=edge.tfplan
terraform apply edge.tfplan
terraform output cloudfront_domain
```

Persist `enable_cloudfront = true` in local terraform.tfvars. Point both public names to CloudFront using the DNS provider's supported alias/CNAME method. Do not put CloudFront's changing IP addresses in A records. If Squarespace cannot alias the root name to CloudFront, move authoritative DNS to Route 53, preserving every existing verification/mail record, and use Route 53 alias records. Domain registration can stay with Squarespace. `origin` must always point directly to the Elastic IP to avoid a proxy loop.

After checking root/www routes, public pages, API Origin and bearer forwarding, an actual upload/SMS and the canonical www redirect, set `restrict_origin_to_cloudfront = true`, re-plan/apply and re-deploy to refresh the app's runtime settings. This restricts HTTPS ingress to CloudFront's managed prefix list and requires the shared origin header. Port 80 stays open solely for Caddy's ACME certificate challenges and automatic HTTPS redirects; it does not serve the application over HTTP. Check direct HTTPS access is blocked. Never restrict HTTPS before DNS has moved and the edge is working.

Later code changes use `npm run deploy`; Terraform is only for infrastructure/configuration changes. Quote history/profile and automatic contractor matching remain separate future work.
