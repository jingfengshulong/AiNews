import { resolve } from 'node:path';

import { createApiServer } from '../src/api/server.ts';
import { loadConfigFromEnvFile } from '../src/config/env.ts';
import { createDemoRuntime } from '../src/demo/demo-runtime.ts';
import { createLogger } from '../src/logging/logger.ts';

const runtime = await createDemoRuntime();
const config = await loadConfigFromEnvFile();
const server = createApiServer({
  config,
  logger: createLogger(),
  servingService: runtime.servingService,
  staticRoot: resolve('.')
});

await new Promise((resolveListen) => server.listen(0, resolveListen));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const homeResponse = await fetch(`${baseUrl}/api/home`);
  const home = await homeResponse.json();
  const pageResponse = await fetch(`${baseUrl}/`);
  const page = await pageResponse.text();

  if (homeResponse.status !== 200 || !home.leadSignal?.id) {
    throw new Error('Demo API did not return a lead signal');
  }
  if (pageResponse.status !== 200 || !page.includes('data-page="home"')) {
    throw new Error('Demo frontend did not serve the homepage');
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    leadSignal: home.leadSignal.title,
    visibleSignals: home.stats.visibleSignals,
    staticHomepage: 'served'
  }, null, 2));
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
