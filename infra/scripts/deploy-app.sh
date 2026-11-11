#!/bin/bash
# Installed by Terraform. Run as root via SSM; only accepts a full commit SHA or --restore.
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Run as root' >&2; exit 1; }
source /etc/contract-negotiations.env
base=/srv/contract-negotiations
mountpoint -q "$base" || { echo 'Data volume is not mounted' >&2; exit 1; }
exec 9>/run/contract-negotiations-deploy.lock
flock -n 9 || { echo 'Another deployment or backup is running' >&2; exit 1; }
compose() { docker compose -p contract-negotiations --env-file "$1/.env" -f "$1/compose.yaml" "${@:2}"; }
previous=''
if [[ -f $base/active-release ]]; then previous=$(cat "$base/active-release"); fi
[[ -z $previous || $previous =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid active-release marker'; exit 1; }
if [[ ${1:-} == --restore ]]; then
  [[ -n $previous ]] || { echo 'No release to restore'; exit 1; }
  release="$base/releases/$previous"
  compose "$release" build app
  compose "$release" up -d --no-build --wait --wait-timeout 180
  echo "Restored $previous"
  exit 0
fi
sha=${1:-}
[[ $sha =~ ^[a-f0-9]{40}$ ]] || { echo 'Pass a full 40-character Git commit SHA'; exit 1; }
export GIT_SSH_COMMAND="ssh -i $base/git/id_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$base/git/known_hosts -p 443"
repo="$base/git/repository.git"
if [[ ! -d $repo ]]; then git init --bare "$repo"; fi
git --git-dir="$repo" config remote.origin.url "ssh://git@ssh.github.com:443/$GITHUB_REPOSITORY.git"
git --git-dir="$repo" fetch --prune origin '+refs/heads/main:refs/remotes/origin/main'
git --git-dir="$repo" cat-file -e "$sha^{commit}"
git --git-dir="$repo" merge-base --is-ancestor "$sha" refs/remotes/origin/main || { echo 'Commit must be pushed to main'; exit 1; }
release="$base/releases/$sha"
if [[ ! -d $release ]]; then
  temporary=$(mktemp -d "$base/releases/.pending-XXXXXX")
  git --git-dir="$repo" archive "$sha" | tar -x -C "$temporary"
  mv "$temporary" "$release"
fi
printf 'DOMAIN=%s\nDATA_PATH=%s/data\nPERSIST_PATH=%s\nAPP_IMAGE=contract-negotiations:%s\n' "$DOMAIN" "$base" "$base" "$sha" > "$release/.env"
# Fetch configuration through the instance role; never put AWS access keys in releases.
if [[ -n ${RUNTIME_PARAMETER:-} ]]; then
  runtime=$(docker run --rm --network host amazon/aws-cli:2.39.6 ssm get-parameter --region "$AWS_REGION" --name "$RUNTIME_PARAMETER" --with-decryption --query Parameter.Value --output text)
  printf '%s' "$runtime" | jq -er 'to_entries[] | select(.key | test("^[A-Z_]+$")) | "\(.key)=\(.value | tostring)"' >> "$release/.env"
fi
compose "$release" config --quiet
# Build before stopping the healthy app; failed builds leave it serving traffic.
compose "$release" build app
changing=0
rollback() {
  result=$?
  trap - ERR INT TERM
  if [[ $changing == 1 && -n $previous ]]; then
    echo "Deployment failed; restoring previous application $previous" >&2
    compose "$base/releases/$previous" up -d --no-build --wait --wait-timeout 180 || echo 'Rollback failed; inspect Docker logs' >&2
  elif [[ $changing == 1 ]]; then
    compose "$release" stop app || true
  fi
  exit "${result:-1}"
}
trap rollback ERR
trap 'false' INT TERM
# Stop writes briefly for a consistent DB/files backup before switching code.
changing=1
if [[ -n $previous ]]; then compose "$base/releases/$previous" stop app; fi
tar -czf "$base/backups/predeploy-$(date -u +%Y%m%dT%H%M%SZ)-$sha.tar.gz" -C "$base/data" .
compose "$release" up -d --no-build --wait --wait-timeout 180
# Container health checks verify API + DB. Also check the public reverse proxy route.
curl --fail --silent --show-error --retry 5 --retry-delay 3 --retry-all-errors "https://$DOMAIN/api/health"
printf '%s\n' "$sha" > "$base/active-release.new"
mv "$base/active-release.new" "$base/active-release"
printf '%s %s\n' "$(date -u +%FT%TZ)" "$sha" >> "$base/deployments.log"
trap - ERR INT TERM
echo "Deployed $sha to https://$DOMAIN"
