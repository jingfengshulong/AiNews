import { join } from 'node:path';
import { loadConfigFromEnvFile } from './env.ts';

export async function loadRuntimeConfig({ cwd = process.cwd(), envPath = '.env', baseEnv = process.env } = {}) {
  return loadConfigFromEnvFile({
    envPath: join(cwd, envPath),
    baseEnv
  });
}
