const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const active = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

/** Keys whose values must never reach a log line. */
const REDACT = new Set([
  'password',
  'cardnumber',
  'pan',
  'cvv',
  'cvc',
  'token',
  'verificationtoken',
  'authorization',
  'password_hash',
  'passwordhash',
]);

function scrub(value, depth = 0) {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = REDACT.has(k.toLowerCase()) ? '[redacted]' : scrub(v, depth + 1);
  }
  return out;
}

function emit(level, msg, meta) {
  if (LEVELS[level] > active) return;
  const line = { ts: new Date().toISOString(), level, msg };
  if (meta !== undefined) line.meta = scrub(meta);
  const text = JSON.stringify(line);
  if (level === 'error') process.stderr.write(text + '\n');
  else process.stdout.write(text + '\n');
}

export const logger = {
  error: (msg, meta) => emit('error', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  debug: (msg, meta) => emit('debug', msg, meta),
};
