import { createDemoRuntime } from '../src/demo/demo-runtime.ts';

const runtime = await createDemoRuntime();

console.log(JSON.stringify({
  ok: true,
  summary: runtime.summary,
  home: {
    leadSignal: runtime.servingService.getHome().leadSignal,
    rankedSignals: runtime.servingService.getHome().rankedSignals.length
  }
}, null, 2));
