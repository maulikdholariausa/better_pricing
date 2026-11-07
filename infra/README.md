# Terraform deployment

This creates a new VPC and public subnet, Ubuntu 24.04 amd64 EC2 instance (`t3.small` by default), Elastic IP, encrypted 20 GiB root disk, separate encrypted 30 GiB gp3 data disk, web-only security group, SSM instance role, and a private encrypted S3 bucket containing the app bundle. SQLite and customer uploads remain on EC2, under `/srv/contract-negotiations` on the separate disk. No NAT gateway, RDS, or load balancer is needed for this single-instance setup.

## Before running

Install [Terraform](https://developer.hashicorp.com/terraform/install), [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), and (for terminal sessions) the [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html). AWS Console Session Manager also works without the terminal plugin.

Authenticate to your AWS account locally, preferably through IAM Identity Center:

```sh
aws configure sso --profile better-pricing
aws sso login --profile better-pricing
export AWS_PROFILE=better-pricing
aws sts get-caller-identity
```

Your deployment identity needs permissions to manage VPC/networking, EC2, EBS, Elastic IPs, IAM roles and instance profiles, S3 releases, and to read the Canonical public AMI SSM parameter. Optional DNS automation also needs access to the selected Route 53 zone. It must be allowed to pass the EC2 role. Do not put access keys in tfvars, source files, or chat.

## Configure and preview

From your project folder:

```sh
cd infra
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`: set your real `domain`, desired `aws_region`, and optionally an existing public `route53_zone_id`. Without a zone ID, Terraform prints an IP for you to use in an A record at your DNS provider. This does not register or purchase a domain. Remove conflicting AAAA records unless you configure IPv6 separately.

```sh
terraform init
terraform fmt -check
terraform validate
terraform test
terraform plan -out=deployment.tfplan
```

Review the plan. When ready to incur AWS charges and deploy:

```sh
terraform apply deployment.tfplan
terraform output
```

EC2, EBS, public IPv4 and S3 incur charges; no free-tier eligibility is assumed. No resources are created by `init`, `validate`, or `plan`. Applying creates IAM access and publicly exposes only ports 80 and 443. No SSH key or inbound SSH is configured.

Terraform packages only explicitly selected app/deploy files, excluding `data`, `node_modules`, credentials and Terraform state. The instance downloads the private release using its role, verifies its SHA256, mounts the data disk, installs Docker, and starts the app. Bootstrap may take several minutes after `apply` finishes. HTTPS requires DNS to point to the printed IP.

## Verify and administer

```sh
terraform output -raw ssm_command
# Run the printed command, or connect from EC2 Console > Connect > Session Manager.
```

In the instance session:

```sh
sudo tail -n 100 /var/log/contract-negotiations-bootstrap.log
sudo tail -n 100 /var/log/cloud-init-output.log
cd /opt/contract-negotiations
sudo docker compose ps
sudo docker compose logs --tail=100
```

Once DNS resolves, check `https://YOUR_DOMAIN/api/health`, then submit a test quote in the browser. `terraform apply` confirms provisioning, not application readiness or successful certificate issuance.

If initial bootstrap fails, use Session Manager to inspect its log. Fix the underlying network or package issue, then `sudo cloud-init single --name scripts-user --frequency always` reruns user data. The script preserves an existing ext4 data filesystem and refuses unknown layouts.

## Updates and data safety

This intentionally uses an immutable EC2 deployment: changed application source, bootstrap, domain, or resolved AMI changes user data/instance configuration and can replace EC2 at the next apply. Review every plan. Replacement causes downtime; the Elastic IP and separate data disk reattach. Do not enable `create_before_destroy` on this instance: only one instance can use this disk at a time. You can pin `ami_id` to avoid automatic replacement when Canonical publishes a new image.

After editing the app, repeat `terraform plan -out=deployment.tfplan` and review before `terraform apply deployment.tfplan`. Recreate saved plans after any source changes; they refer to the generated local `.build/app.zip`. Plan and apply on the same checkout with the same bundle. Do not modify source between them.

The data disk has `prevent_destroy = true`; Terraform refuses a full destroy or an AZ change requiring its replacement. This is intentional. Take a verified backup before any teardown and explicitly plan retention or deletion; do not casually remove that protection. Root disk and Docker certificate volumes are replaced with EC2; customer DB/files are on the separate disk. Increased EBS size requires filesystem expansion (`sudo resize2fs DEVICE`) after identifying the mounted data device with `findmnt /srv/contract-negotiations`; shrinking is unsupported.

Run `sudo bash deploy/backup.sh` from `/opt/contract-negotiations` before updates and copy backups off-instance. Daily off-instance backups/snapshots and disk alerts are not yet automated. A single instance and local SQLite remain a single point of failure.

Terraform initially uses local state. Keep `terraform.tfstate` secure and backed up; it is excluded from Git. Commit `.terraform.lock.hcl` so collaborators use the same provider versions. Move state to an encrypted, access-controlled remote backend with locking before multiple people or CI manage this deployment. The release bucket is for application code, not Terraform state or customer backups.

## Root domain and www

The proxy serves both the configured domain and `www.` plus that domain, with automatic HTTPS for each. With Squarespace DNS, keep the root A record pointing to `terraform output -raw public_ip` and add a CNAME with host `www` and data `haveaguru.com` (substitute your configured domain). Replace any conflicting `www` website record. With `route53_zone_id` configured, Terraform creates both records instead. The API accepts same-origin submissions from both addresses.

The first app deployment happens during EC2 user-data execution after `terraform apply`. Bootstrap logs show the source download and Docker launch; `sudo docker inspect --format '{{.State.StartedAt}}' "$(sudo docker compose ps -q app)"` from the app directory shows the current app container start time, which may be later than initial deployment after a restart.
