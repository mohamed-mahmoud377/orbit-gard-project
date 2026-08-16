/**
 * Minimal stand-in for the Orbit banking API, used only by the storefront
 * e2e run. It speaks the two endpoints the shop calls server-to-server
 * (CONTRACT §8) and lets a test pick an outcome via the wallet username.
 *
 *   node e2e/orbit-stub.mjs [port]
 *
 * | username        | verify                | pay                          |
 * | --------------- | --------------------- | ---------------------------- |
 * | orbit.good      | ok                    | approved                     |
 * | orbit.badpass   | 401 INVALID_CREDENTIALS| —                           |
 * | orbit.broke     | ok                    | 402 INSUFFICIENT_BALANCE     |
 * | orbit.daily     | ok                    | 422 DAILY_LIMIT_EXCEEDED     |
 * | orbit.ghost     | ok                    | never answers → ORBIT_UNCERTAIN |
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.argv[2] ?? 8080);

/** token -> username, so /external/pay knows which script to follow. */
const sessions = new Map();

const problem = (res, status, code, detail) => {
  res.writeHead(status, { 'content-type': 'application/problem+json' });
  res.end(JSON.stringify({ type: 'about:blank', title: code, status, code, detail }));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
  });

const server = http.createServer(async (req, res) => {
  const body = await readBody(req);

  if (req.url === '/api/v1/external/verify') {
    const username = String(body.username ?? '');
    if (username === 'orbit.badpass') return problem(res, 401, 'INVALID_CREDENTIALS', 'bad creds');
    if (username === 'orbit.suspended') return problem(res, 403, 'ACCOUNT_SUSPENDED', 'suspended');

    const verificationToken = randomUUID();
    sessions.set(verificationToken, username);
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(
      JSON.stringify({
        verificationToken,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      }),
    );
  }

  if (req.url === '/api/v1/external/pay') {
    const username = sessions.get(body.verificationToken);
    if (!username) return problem(res, 400, 'TOKEN_INVALID', 'unknown token');

    if (username === 'orbit.broke') return problem(res, 402, 'INSUFFICIENT_BALANCE', 'no funds');
    if (username === 'orbit.daily') return problem(res, 422, 'DAILY_LIMIT_EXCEEDED', 'daily cap');

    // The uncertain path: the request is received and then never answered, so
    // the shop's AbortSignal.timeout fires *after* attempted_at was stamped.
    if (username === 'orbit.ghost') return;

    sessions.delete(body.verificationToken);
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(
      JSON.stringify({
        transactionId: Math.floor(Math.random() * 1_000_000),
        reference: `ORB-${randomUUID().slice(0, 8).toUpperCase()}`,
        status: 'COMPLETED',
        cashAmount: body.cashAmount,
        createdAt: new Date().toISOString(),
      }),
    );
  }

  problem(res, 404, 'NOT_FOUND', req.url);
});

server.listen(PORT, () => console.log(`orbit stub listening on ${PORT}`));
