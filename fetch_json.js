import { setTimeout as sleep } from 'node:timers/promises';

// Retry only temporary upstream failures; never publish partial/stale results.
export async function getJsonWithRetry(url, apiKey, {
  fetchImpl = fetch,
  wait = sleep,
  attempts = 3,
  timeoutMs = 45000,
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return await response.json();
    } catch (error) {
      if (attempt === attempts) throw error;
      console.warn(`Temporary request failure; retry ${attempt}/${attempts - 1}: ${url}`);
      await wait(1000 * 2 ** (attempt - 1));
      continue;
    }

    const error = new Error(`HTTP ${response.status} ${url}`);
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    // Release the response before retrying, including potentially large error bodies.
    await response.body?.cancel();
    if (!retryable || attempt === attempts) throw error;
    console.warn(`HTTP ${response.status}; retry ${attempt}/${attempts - 1}: ${url}`);
    await wait(1000 * 2 ** (attempt - 1));
  }
}
