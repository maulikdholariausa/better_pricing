import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import path from 'node:path';

export const quotePrefixes = Object.freeze({ dev: 'quotes-dev', staging: 'quotes-staging', prod: 'quotes-prod' });
export function quotePrefix(env = process.env) {
  const name = env.APP_ENV || (env.NODE_ENV === 'production' ? 'prod' : 'dev');
  if (!Object.hasOwn(quotePrefixes, name)) throw new Error('APP_ENV must be dev, staging or prod.');
  const prefix = quotePrefixes[name];
  if (env.QUOTES_PREFIX && env.QUOTES_PREFIX !== prefix) throw new Error(`QUOTES_PREFIX must be ${prefix} for ${name}.`);
  return prefix;
}

export function loadEnvironment({ env = process.env, requested = process.argv[2], root = process.cwd() } = {}) {
  const name = requested || env.APP_ENV || (env.NODE_ENV === 'production' ? 'prod' : 'dev');
  if (!Object.hasOwn(quotePrefixes, name)) throw new Error('Choose dev, staging or prod.');
  const profiles = JSON.parse(readFileSync(new URL('../config/environments.json', import.meta.url), 'utf8'));
  const local = {};
  for (const file of ['.env', `.env.${name}`]) {
    try { Object.assign(local, parseEnv(readFileSync(path.join(root, file), 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const values = { AWS_REGION: 'us-east-2', ...profiles[name], ...local, ...env, APP_ENV: name };
  values.QUOTES_PREFIX = quotePrefix(values);
  // Staging and prod always use production protections and real SMS.
  values.NODE_ENV = name === 'dev' ? 'development' : 'production';
  if (name !== 'dev') values.GURU_DEV_OTP = '0';
  if (name !== 'prod') values.SEO_INDEXABLE = 'false';
  values.SITE_URL ||= `http://localhost:${values.PORT}`;
  values.PUBLIC_ORIGINS ||= `http://localhost:${values.PORT},http://127.0.0.1:${values.PORT}`;
  if (name !== 'prod') values.AWS_PROFILE ||= 'better-pricing';
  Object.assign(env, values);
  return { name, prefix: values.QUOTES_PREFIX };
}
