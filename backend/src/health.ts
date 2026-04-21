export function createHealthSnapshot({ service, config, checks = {} }) {
  const normalizedChecks = {};
  for (const [name, ok] of Object.entries(checks)) {
    normalizedChecks[name] = ok ? 'ok' : 'unavailable';
  }

  const status = Object.values(normalizedChecks).every((value) => value === 'ok') ? 'ok' : 'degraded';

  return {
    status,
    service,
    runtimeMode: config.runtimeMode,
    checkedAt: new Date().toISOString(),
    checks: normalizedChecks
  };
}
