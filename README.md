# Contract Negotiations

A single-instance quote intake application. The frontend lives in `dist/`, the Node.js API in `backend/`, and `server.js` starts both under one origin. SQLite stores phone numbers, timestamped consent and file metadata; original documents are stored privately on disk. Contractor matching, document redaction, notifications, contractor accounts and an admin dashboard are not implemented. Nothing is automatically shared with contractors.

## Local development

Install Node.js 24 or newer, then run:

```sh
npm ci
npm test
npm start
```

Open http://127.0.0.1:8000. Local data is created in `data/` and excluded from Git and Docker builds. `npm run check` checks JavaScript syntax. Up to five PDF/JPG/PNG files of 20 MB each can be submitted. The server validates basic file signatures, phone and consent. Signature checks are not malware scanning.

## Deploy on EC2

This deployment targets **Ubuntu Server 24.04 LTS**, x86_64 or ARM64. Everything runs on the instance: Caddy HTTPS proxy, Node application, SQLite and uploaded files. No host installation of Node or npm is necessary; Docker provides Node 24.

1. Launch an Ubuntu 24.04 EC2 instance with an encrypted EBS volume. Use an Elastic IP and point your domain's A record at it. Remove an AAAA record unless IPv6 is configured correctly. Leave enough disk space for uploads and Docker images.
2. Configure the EC2 security group: allow inbound TCP 80 and 443; restrict SSH (22) to your IP. Do not expose 8000 or a database port.
3. From your Mac, package the application (no customer files or secrets):

```sh
cd /Users/maulikdholaria/Documents/ChatGPT/better_pricing
tar -czf /tmp/contract-negotiations.tar.gz package.json package-lock.json server.js backend dist Dockerfile compose.yaml deploy
scp -i /path/to/key.pem /tmp/contract-negotiations.tar.gz ubuntu@YOUR_EC2_IP:/home/ubuntu/
ssh -i /path/to/key.pem ubuntu@YOUR_EC2_IP
```

4. On EC2, unpack and run the startup script, substituting your actual domain:

```sh
sudo mkdir -p /opt/contract-negotiations
sudo tar -xzf /home/ubuntu/contract-negotiations.tar.gz -C /opt/contract-negotiations
cd /opt/contract-negotiations
sudo DOMAIN=quotes.example.com bash deploy/ec2-startup.sh
```

The script installs Docker from its official Ubuntu repository, enables Docker on boot, prepares private storage, builds the app and starts Compose services. Caddy obtains and renews HTTPS certificates once DNS and ports are correct. Containers restart automatically after reboot. This is a post-copy bootstrap script, not a standalone EC2 user-data script: it requires the application files to already exist.

5. Verify your deployment:

```sh
sudo docker compose ps
sudo docker compose logs --tail=100
curl --fail https://quotes.example.com/api/health
```

Submit a test quote through the browser and confirm a receipt. If setup fails, inspect the logs and rerun the same startup command after resolving the problem. No AWS resources have been created by this repository.

## Persistence, updates and backups

`/srv/contract-negotiations/data/quotes.sqlite` holds the database; `/srv/contract-negotiations/data/uploads/` holds UUID-named private documents. The API exposes no download or listing route. The app container runs as UID 1000 and only its data directory is writable. Application logs omit customer phone numbers and file contents.

For an application update, copy the new source files to `/opt/contract-negotiations` and run `sudo docker compose up -d --build --wait`. Preserve `.env` and `/srv/contract-negotiations/data`. Changing the domain requires updating `.env` and DNS. Do not delete or overwrite the data directory.

Create a consistent backup with `sudo bash deploy/backup.sh`. This briefly stops the app while archiving the DB and files to `/srv/contract-negotiations/backups`. Copy backups off the instance or configure EBS snapshots; a backup on the same disk does not protect against disk or instance loss. Define retention and monitor disk usage before collecting real documents.

To restore a backup, stop the app (`sudo docker compose stop app`), extract the archive into a new, empty directory, set owner UID/GID 1000 and directory mode 0700, set `DATA_PATH` in `.env` to that directory, then run `sudo docker compose up -d --force-recreate app`. Keep the old directory until the restored data is verified. Restoring rolls submissions back to the backup timestamp.

## Operational scope

This is an intake MVP for one instance, with per-IP upload rate limits and bounded upload sizes. A single instance remains a single point of failure; local SQLite is not shared across replicas. Review retention and privacy disclosures, set up off-instance backups and disk alerts, and decide on malware scanning before launch. No automated calls, texts, payments, user authentication or contractor access are enabled.

## Terraform

For an automated AWS deployment instead of copying files manually, follow [infra/README.md](infra/README.md). Terraform provisions networking, EC2, an Elastic IP, private release storage, and a separate encrypted data volume, then bootstraps the application. Configure your real domain and authenticate locally before planning. Applying is a separate step that creates billable AWS resources.
