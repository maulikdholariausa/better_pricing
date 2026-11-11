import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadEnvironment, quotePrefix } from "../backend/environment.js";

for (const name of ["dev", "staging", "prod"]) {
  test(`${name} selects its own S3 folder, database and verification mode`, () => {
    const env = {};
    const config = loadEnvironment({ env, requested: name, root: os.tmpdir() });
    assert.equal(config.prefix, `quotes-${name}`);
    assert.equal(env.QUOTES_BUCKET, `haveaguru-quotes-${name}`);
    assert.equal(env.DATA_DIR, `./data/${name}`);
    assert.equal(env.NODE_ENV, name === "dev" ? "development" : "production");
    assert.equal(env.GURU_DEV_OTP, name === "dev" ? "1" : "0");
    assert.equal(env.SEO_INDEXABLE, "false");
    assert.match(env.PUBLIC_ORIGINS, /localhost/);
  });
}
test("environment file overrides common settings; shell settings have highest priority", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "guru-environments-"));
  try {
    await writeFile(
      path.join(root, ".env"),
      "QUOTES_BUCKET=shared-bucket\nAWS_REGION=us-east-1\n",
    );
    await writeFile(
      path.join(root, ".env.staging"),
      "QUOTES_BUCKET=staging-bucket\nGURU_DEV_OTP=1\n",
    );
    const env = { AWS_REGION: "us-east-2" };
    loadEnvironment({ env, requested: "staging", root });
    assert.equal(env.QUOTES_BUCKET, "staging-bucket");
    assert.equal(env.AWS_REGION, "us-east-2");
    assert.equal(env.GURU_DEV_OTP, "0");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("reject unknown environments and mismatched upload prefixes", () => {
  assert.throws(
    () => quotePrefix({ APP_ENV: "staging", QUOTES_PREFIX: "quotes-prod" }),
    /quotes-staging/,
  );
  assert.throws(
    () => loadEnvironment({ env: {}, requested: "production" }),
    /dev, staging or prod/,
  );
});

for (const name of ["dev", "staging", "prod"]) {
  test(
    `${name} starts locally with its environment configuration`,
    { timeout: 10000 },
    async () => {
      const { spawn } = await import("node:child_process");
      const { once } = await import("node:events");
      const { DatabaseSync } = await import("node:sqlite");
      const { randomUUID, randomBytes } = await import("node:crypto");
      const { CONSENT_VERSION } = await import("../backend/app.js");
      const root = await mkdtemp(path.join(os.tmpdir(), "guru-startup-"));
      const child = spawn(process.execPath, ["server.js", name], {
        env: {
          ...process.env,
          PORT: "0",
          HOST: "127.0.0.1",
          DATA_DIR: root,
          APP_ENV: name,
          QUOTES_PREFIX: `quotes-${name}`,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      try {
        const port = await new Promise((resolve, reject) => {
          let output = "";
          child.stdout.on("data", (chunk) => {
            output += chunk;
            const match = output.match(/running on http:\/\/localhost:(\d+)/);
            if (match) resolve(Number(match[1]));
          });
          child.once("error", reject);
          child.once("exit", (code) => reject(Error(`Server exited: ${code}`)));
        });
        const response = await fetch(`http://127.0.0.1:${port}/api/health`);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).status, "ok");
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, "exit");
          child.kill("SIGTERM");
          await exited;
        }
        await rm(root, { recursive: true, force: true });
      }
    },
  );
}
