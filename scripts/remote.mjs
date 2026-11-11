import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
async function run(binary, args) {
  const { stdout } = await execute(binary, args, { cwd: root, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, AWS_PAGER: '' } });
  return stdout.trim();
}
async function main() {
  const action = process.argv[2];
  const supported = ['deploy', 'key', 'status', 'backup'];
  if (!supported.includes(action)) throw new Error(`Use: node scripts/remote.mjs ${supported.join('|')} [commit SHA]`);
  const outputs = JSON.parse(await run(process.env.TERRAFORM_BIN || 'terraform', ['-chdir=infra', 'output', '-json']));
  const instance = outputs.instance_id?.value;
  // Old infrastructure has no aws_region output; an explicit env var supports migration backup.
  const region = outputs.aws_region?.value || process.env.AWS_REGION;
  if (!/^i-[a-f0-9]+$/.test(instance || '') || !/^[a-z]{2}-[a-z]+-\d$/.test(region || '')) throw new Error('Apply infrastructure first, or supply AWS_REGION for migration of the old stack.');
  let command;
  if (action === 'deploy') {
    const sha = process.argv[3] || await run('git', ['rev-parse', 'HEAD']);
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Deploy requires a full 40-character commit SHA.');
    if (!process.argv[3] && await run('git', ['status', '--porcelain'])) throw new Error('Commit/stash local changes or pass an explicit pushed commit SHA.');
    command = `test -f /var/lib/contract-negotiations-ready && /usr/local/sbin/deploy-contract-negotiations ${sha}`;
    console.log(`Deploying ${sha} to ${instance}`);
  } else if (action === 'key') {
    command = `set -eu
base=/srv/contract-negotiations
mountpoint -q "$base"
install -d -m 0700 "$base/git"
if [ ! -f "$base/git/id_ed25519" ]; then ssh-keygen -q -t ed25519 -N '' -C 'better_pricing EC2 read-only deployment' -f "$base/git/id_ed25519"; fi
cat "$base/git/id_ed25519.pub"`;
  } else if (action === 'status') {
    command = 'test -f /var/lib/contract-negotiations-ready; cat /srv/contract-negotiations/active-release 2>/dev/null || true; tail -n 10 /srv/contract-negotiations/deployments.log 2>/dev/null || true; docker ps --format "table {{.Names}}\\t{{.Status}}"';
  } else {
    command = `set -eu
base=/srv/contract-negotiations
mountpoint -q "$base"
if [ -f "$base/active-release" ]; then
  exec 9>/run/contract-negotiations-deploy.lock
  flock -n 9
  sha=$(cat "$base/active-release")
  case "$sha" in *[!a-f0-9]*|'') exit 1;; esac
  cd "$base/releases/$sha"
  docker compose -p contract-negotiations stop app
  trap 'docker compose -p contract-negotiations start app' EXIT
  mkdir -p "$base/backups"
  archive="$base/backups/manual-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
  tar -czf "$archive" -C "$base/data" .
  echo "$archive"
else
  cd /opt/contract-negotiations
  bash deploy/backup.sh
fi`;
  }
  const aws = async args => JSON.parse(await run('aws', [...args, '--region', region, '--output', 'json']));
  const sent = await aws(['ssm', 'send-command', '--document-name', 'AWS-RunShellScript', '--instance-ids', instance, '--timeout-seconds', '600', '--parameters', JSON.stringify({ commands: [command], executionTimeout: ['1800'] }), '--comment', `Have a Guru ${action}`]);
  const commandId = sent.Command.CommandId;
  console.log(`SSM command ${commandId}`);
  const deadline = Date.now() + 32 * 60 * 1000;
  while (Date.now() < deadline) {
    await delay(3000);
    let result;
    try { result = await aws(['ssm', 'get-command-invocation', '--command-id', commandId, '--instance-id', instance]); }
    catch (error) { if (error.stderr?.includes('InvocationDoesNotExist')) continue; throw error; }
    if (['Pending', 'InProgress', 'Delayed'].includes(result.Status)) continue;
    if (result.StandardOutputContent) console.log(result.StandardOutputContent);
    if (result.StandardErrorContent) console.error(result.StandardErrorContent);
    if (result.Status === 'Success' && action === 'deploy' && outputs.cloudfront_distribution_id?.value) {
      const invalidation = await aws(['cloudfront', 'create-invalidation', '--distribution-id', outputs.cloudfront_distribution_id.value, '--paths', '/*']);
      console.log(`Public cache invalidation ${invalidation.Invalidation.Id} requested.`);
    }
    if (result.Status !== 'Success') throw new Error(`Remote command ${result.Status}. Inspect command ${commandId} in Systems Manager Run Command.`);
    return;
  }
  throw new Error(`Stopped waiting; remote command ${commandId} may still be running. Inspect its status before retrying.`);
}
main().catch(error => { console.error(error.stderr || error.message); process.exitCode = 1; });
