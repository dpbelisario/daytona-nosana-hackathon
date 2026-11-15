import 'dotenv/config';
import { setTimeout as delay } from 'node:timers/promises';

const rawBase = process.env.LLM_BASE_URL || process.env.NOSANA_ENDPOINT;
if (!rawBase) {
  console.error('Set LLM_BASE_URL or NOSANA_ENDPOINT in your local .env. Do not commit the endpoint.');
  process.exit(1);
}
const base = rawBase.replace(/\/+$/, '').replace(/\/v1$/, '');
const model = process.env.LLM_MODEL || 'qwen3:8b';
const interval = Number(process.env.NOSANA_POLL_SECONDS || 20);
const waitMinutes = Number(process.env.NOSANA_WAIT_MINUTES || 30);
if (!(interval >= 5 && interval <= 60 && waitMinutes > 0 && waitMinutes <= 120)) {
  throw new Error('Poll interval must be 5–60 seconds; wait duration must be 1–120 minutes.');
}
const headers = { 'Content-Type': 'application/json' };
if (process.env.LLM_API_KEY) headers.Authorization = `Bearer ${process.env.LLM_API_KEY}`;
const start = Date.now();

while (Date.now() - start < waitMinutes * 60_000) {
  try {
    const response = await fetch(base + '/v1/models', { headers, signal: AbortSignal.timeout(12_000) });
    if (response.ok) {
      const json = await response.json();
      const models = Array.isArray(json.data) ? json.data.map(item => item.id) : [];
      if (models.includes(model)) {
        console.log(`${model} is listed. Testing inference…`);
        const inferenceStarted = Date.now();
        const inference = await fetch(base + '/v1/chat/completions', {
          method: 'POST', headers, signal: AbortSignal.timeout(120_000),
          body: JSON.stringify({ model, stream: false, temperature: 0, max_tokens: 128, messages: [{ role: 'user', content: 'Reply with the single word ready. /no_think' }] }),
        });
        if (!inference.ok) throw new Error(`Inference HTTP ${inference.status}`);
        const answer = await inference.json();
        const content = answer.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) throw new Error('Inference returned no answer');
        console.log(`Inference succeeded in ${((Date.now() - inferenceStarted) / 1000).toFixed(1)}s:`, content.trim().slice(0, 200));
        try {
          const ps = await fetch(base + '/api/ps', { headers, signal: AbortSignal.timeout(12_000) });
          const loaded = (await ps.json()).models?.find(item => item.name === model);
          if (typeof loaded?.size_vram === 'number') console.log(`GPU model memory: ${(loaded.size_vram / 2 ** 30).toFixed(2)} GiB`);
        } catch { /* Non-Ollama providers need not support /api/ps. */ }
        console.log('NOSANA_READY=1');
        process.exit(0);
      }
      console.log(`[${Math.round((Date.now() - start) / 1000)}s] Server reachable; ${model} is not listed yet.`);
    } else console.log(`[${Math.round((Date.now() - start) / 1000)}s] HTTP ${response.status}; waiting for model.`);
  } catch (error) {
    // Never print request URLs or credentials in shared logs.
    console.log(`[${Math.round((Date.now() - start) / 1000)}s] ${error.name === 'TimeoutError' ? 'Request timed out' : 'Model is not ready'}; retrying.`);
  }
  await delay(interval * 1000);
}
console.error(`Model not ready after ${waitMinutes} minutes. Check the deployment logs; the demo should use its deterministic fallback.`);
process.exit(1);
