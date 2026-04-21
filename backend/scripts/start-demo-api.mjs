import { resolve } from 'node:path';

import { createApiServer } from '../src/api/server.ts';
import { loadConfigFromEnvFile } from '../src/config/env.ts';
import { createDemoRuntime } from '../src/demo/demo-runtime.ts';
import { createLogger } from '../src/logging/logger.ts';

const logger = createLogger();
const config = await loadConfigFromEnvFile();
const runtime = await createDemoRuntime();
const port = Number(process.env.PORT || 4100);

createApiServer({
  config,
  logger,
  servingService: runtime.servingService,
  staticRoot: resolve('.')
}).listen(port, () => {
  logger.info('demo_api_started', {
    port,
    url: `http://localhost:${port}/`,
    runtimeMode: config.runtimeMode,
    signals: runtime.summary.signals,
    articles: runtime.summary.articles
  });
});
