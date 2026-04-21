export function createLogger({ sink = console.log } = {}) {
  return {
    info(event, fields = {}) {
      sink(formatEntry('info', event, fields));
    },
    warn(event, fields = {}) {
      sink(formatEntry('warn', event, fields));
    },
    error(event, fields = {}) {
      sink(formatEntry('error', event, fields));
    }
  };
}

export function createMemoryLogger() {
  const entries = [];
  const logger = createLogger({
    sink(entry) {
      entries.push(entry);
    }
  });
  logger.entries = entries;
  return logger;
}

function formatEntry(level, event, fields) {
  return {
    level,
    event,
    at: new Date().toISOString(),
    ...fields
  };
}
