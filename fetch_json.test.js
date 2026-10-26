import test from 'node:test';
import assert from 'node:assert/strict';
import { getJsonWithRetry } from './fetch_json.js';

function fixture(results) {
  const delays = [];
  let calls = 0;
  return {
    delays,
    get calls() { return calls; },
    options: {
      wait: async ms => delays.push(ms),
      fetchImpl: async (url, options) => {
        assert.equal(options.headers.Authorization, 'Bearer test-key');
        assert.ok(options.signal instanceof AbortSignal);
        const result = results[calls++];
        if (result instanceof Error) throw result;
        return new Response(JSON.stringify(result.data ?? {}), { status: result.status });
      },
    },
  };
}

test('recovers from the observed trades HTTP 500 with backoff', async () => {
  const f = fixture([{ status: 500 }, { status: 502 }, { status: 200, data: { trades: [] } }]);
  assert.deepEqual(await getJsonWithRetry('https://example.test/trades', 'test-key', f.options), { trades: [] });
  assert.deepEqual(f.delays, [1000, 2000]);
  assert.equal(f.calls, 3);
});

test('persistent 500 remains a failure after three attempts', async () => {
  const f = fixture(Array(3).fill({ status: 500 }));
  await assert.rejects(getJsonWithRetry('https://example.test/trades', 'test-key', f.options), /HTTP 500/);
  assert.equal(f.calls, 3);
});

test('authentication errors fail immediately', async () => {
  const f = fixture([{ status: 401 }]);
  await assert.rejects(getJsonWithRetry('https://example.test/trades', 'test-key', f.options), /HTTP 401/);
  assert.equal(f.calls, 1);
  assert.deepEqual(f.delays, []);
});

test('temporary network failures and rate limits recover', async () => {
  const f = fixture([new TypeError('fetch failed'), { status: 429 }, { status: 200, data: [] }]);
  assert.deepEqual(await getJsonWithRetry('https://example.test/trades', 'test-key', f.options), []);
  assert.equal(f.calls, 3);
});
