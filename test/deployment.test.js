import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

for (const failure of ['', 'build', 'switch', 'health']) {
  test(`deployment orchestration: ${failure || 'success'}`, async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'deploy-test-'));
    const old = 'a'.repeat(40), next = 'b'.repeat(40);
    try {
      for (const dir of ['bin', 'git/repository.git', 'data', 'backups', `releases/${old}`, `releases/${next}`]) await mkdir(path.join(temp, dir), { recursive: true });
      await writeFile(path.join(temp, 'active-release'), old);
      await writeFile(path.join(temp, `releases/${old}/.env`), 'DOMAIN=example.com');
      await writeFile(path.join(temp, 'config'), 'DOMAIN=example.com\nGITHUB_REPOSITORY=test/repo\n');
      const mock = `#!/bin/bash\nprintf '%s %s\\n' "$(basename "$0")" "$*" >> "$TEST_LOG"\ncase "$(basename "$0")" in\ndocker)\n if [[ "$FAIL_STAGE" == build && "$*" == *'build app'* ]]; then exit 1; fi\n if [[ "$FAIL_STAGE" == switch && "$*" == *"$NEXT_SHA"* && "$*" == *'up -d'* ]]; then exit 1; fi;;\ncurl) if [[ "$FAIL_STAGE" == health ]]; then exit 1; fi;;\nesac\nexit 0\n`;
      for (const name of ['git', 'docker', 'curl', 'mountpoint', 'flock']) await writeFile(path.join(temp, 'bin', name), mock, { mode: 0o755 });
      let script = await readFile('infra/scripts/deploy-app.sh', 'utf8');
      script = script.replace(/^\[\[ \$EUID.*$/m, '')
        .replace('source /etc/contract-negotiations.env', `source '${temp}/config'`)
        .replace('base=/srv/contract-negotiations', `base='${temp}'`)
        .replace('/run/contract-negotiations-deploy.lock', `${temp}/lock`);
      const target = path.join(temp, 'deploy.sh');
      await writeFile(target, script);
      const result = spawnSync('bash', [target, next], { encoding: 'utf8', env: { ...process.env, PATH: `${temp}/bin:${process.env.PATH}`, TEST_LOG: `${temp}/commands`, FAIL_STAGE: failure, NEXT_SHA: next } });
      const log = await readFile(`${temp}/commands`, 'utf8');
      assert.equal(result.status, failure ? 1 : 0, result.stderr);
      assert.equal((await readFile(`${temp}/active-release`, 'utf8')).trim(), failure ? old : next);
      if (failure === 'build') assert.ok(!log.includes('stop app'), 'Build failure must leave the running app untouched');
      if (['switch', 'health'].includes(failure)) assert.ok(log.split('\n').some(line => line.includes(old) && line.includes('up -d')), 'Switch failures must restore previous release');
    } finally { await rm(temp, { recursive: true, force: true }); }
  });
}
