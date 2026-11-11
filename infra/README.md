# Infrastructure and Git deployments

For the new S3 upload, AWS SMS verification and CloudFront/WAF rollout, follow [the staged quote-upload guide](../docs/QUOTE-UPLOAD.md) before applying changes. It includes the required Squarespace DNS steps and explains the EC2 replacement.

Terraform manages the VPC, public subnet, EC2, Elastic IP, web security group, SSM role and separate encrypted EBS disk. It does not bundle application files or deploy code. Default instance: Ubuntu 24.04 amd64, t3.small. Only inbound TCP 80/443 is open; administration and deployments use SSM.

## AWS access and configuration

Install Terraform >=1.7 and AWS CLI v2. Authenticate with a local profile (do not put keys in this repository), then:

```sh
export AWS_PROFILE=better-pricing
aws sts get-caller-identity
cd infra
# For a new checkout only: copy terraform.tfvars.example to terraform.tfvars, then edit it.
terraform init
terraform validate
terraform test
terraform plan -out=deployment.tfplan
```

The existing local tfvars uses us-east-2, haveaguru.com, t3.small and a 20 GiB data disk. The checked-in example is generic. Keep your current account, region and AZ for migration. An Organizations SCP previously blocked us-west-2.

Review the plan before applying. EC2, EBS and public IPv4 are billable. Source edits under dist/ or backend/ no longer change the infrastructure plan. Bootstrap/deployment-tooling edits in infra/ can still replace the instance. A new regional Ubuntu AMI can also cause replacement; pin ami_id if you want to control OS upgrades.

## Migration from the bundled Terraform deployment

1. Commit and push the migration code to GitHub main. The remote deployment checks out only a commit reachable from main.
2. Before replacing the old server, back up its data:

```sh
# From the project root. Old Terraform state lacks the region output, so set it explicitly.
AWS_REGION=us-east-2 npm run server:backup
```

Copy the resulting archive off the instance or take an EBS snapshot of the data volume. The local backup alone does not protect against volume loss. For an application-consistent snapshot, stop the app before requesting the snapshot, then start it once AWS has initiated the snapshot. Wait for the snapshot to complete before migration.

3. Generate/show the GitHub public deploy key before replacement:

```sh
AWS_REGION=us-east-2 npm run server:key
```

Add the printed ssh-ed25519 PUBLIC key at GitHub repository Settings > Deploy keys > Add deploy key. Leave **Allow write access unchecked**. The private key stays on the encrypted data disk. Do not use a personal access token on EC2.

4. Run terraform init, validate, test and a fresh plan from infra/. Expected changes: one EC2 replacement, data-volume and Elastic-IP reattachment, deletion of the old application S3 object/bucket and S3 read policy, plus new outputs. The data EBS volume, Elastic IP, VPC and security group must remain. Stop if the plan replaces the data disk or changes region/AZ unexpectedly. Do not run terraform destroy.
5. Apply the reviewed plan. The old site goes offline until the first Git deployment:

```sh
terraform apply deployment.tfplan
```

6. Wait for bootstrap to finish, then deploy the pushed commit from the project root:

```sh
npm run deploy
npm run server:status
```

Terraform apply finishing does not mean cloud-init is finished. If the command reports the readiness marker is missing, inspect `/var/log/contract-negotiations-bootstrap.log` through Session Manager and retry after setup completes.

The Elastic IP and data disk are retained. Existing SQLite and uploads stay in `/srv/contract-negotiations/data`. Old Docker certificate volumes were on the root disk; certificates may need to be reissued during this first migration. Subsequent certificates are stored on EBS and survive instance replacement.

## New environment

Apply the reviewed Terraform plan. It installs Docker/Git, mounts the data disk, creates the repository deploy key and installs `/usr/local/sbin/deploy-contract-negotiations`. It deliberately waits for an explicit application deployment. Set DNS, run npm run server:key, add the read-only GitHub key, then run npm run deploy.

## Routine app updates — no Terraform apply

```sh
# From the project root
npm test
npm run check
git add <changed-files>
git commit -m "Describe your change"
git push origin main
npm run deploy
```

By default deployment uses local HEAD. Local changes must be committed/stashed and the commit pushed to main. To deploy a prior pushed commit (code rollback):

```sh
npm run deploy -- FULL_40_CHARACTER_COMMIT_SHA
```

The script fetches main into a private bare Git repo, verifies commit ancestry, extracts into an immutable release directory, builds a SHA-tagged Docker image, stops writes for a consistent data backup, starts the app/proxy and checks container/API health and the public HTTPS route. Failed builds leave the old app running; failures during switching attempt to restart the previous release. Code rollback does not reverse DB schema/data changes. First-deployment failures have no previous app to restore. Restarts cause brief downtime; this is not a zero-downtime deployment.

SSM commands require ssm:SendCommand for AWS-RunShellScript and the target EC2 instance, and ssm:GetCommandInvocation to poll status. Deployment callers effectively have root control of that instance, so restrict those permissions to trusted operators. GitHub access is only read access to this repository. `npm run server:status` shows deployed commit and timestamps. Commands use Terraform outputs to select the instance and region; run on the checkout with its current Terraform state. If Terraform is not on PATH, set TERRAFORM_BIN to its executable path. AWS_PROFILE is honored.

## Persistence and recovery

Everything under `/srv/contract-negotiations` is on the protected encrypted disk: `data/` (SQLite and uploads), `git/` (read-only deploy credentials and Git objects), `releases/`, `backups/`, `active-release`, `deployments.log`, `caddy-data/` and `caddy-config/`. No HTTP route exposes these directories.

On a future instance replacement, bootstrap rebuilds and starts the last successful release from this disk. It does not silently deploy the newest main. To install newer code, run npm run deploy explicitly.

The data volume has prevent_destroy=true. Do not remove that protection without a verified backup and a retention/deletion plan. Keep the volume in the same AZ. Resizing EBS requires expanding its ext4 filesystem. Automated off-instance backups, snapshot schedules, retention and disk alerts are not configured. Release directories, images and backups currently accumulate; monitor storage and retain the previous release for rollback when cleaning up.

Terraform state stays local and is excluded from Git. Back it up securely; use an encrypted remote backend with locking before multiple operators/CI manage infrastructure. Commit .terraform.lock.hcl. Do not remove the old archive provider from the lock file until Terraform has migrated state successfully; init will manage requirements.

## DNS and verification

Squarespace: A record `@` -> terraform output public_ip; CNAME `www` -> haveaguru.com. Preserve mail records. Optional route53_zone_id manages these records in an existing public Route 53 zone instead. Caddy obtains/renews HTTPS for both hostnames after DNS resolves and the proxy is running.

```sh
curl --fail https://haveaguru.com/api/health
curl --fail https://www.haveaguru.com/api/health
```

Use EC2 Console > Connect > Session Manager, or the command from terraform output ssm_command. Diagnostics:

```sh
sudo tail -n 100 /var/log/contract-negotiations-bootstrap.log
sudo cat /srv/contract-negotiations/active-release
sudo cat /srv/contract-negotiations/deployments.log
sudo docker ps
```
