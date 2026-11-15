import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consumeSseStream } from '../lib/sse-client.ts';

async function collect(t, chunks) {
  const events = [];
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  })));
  await consumeSseStream('https://unused.invalid', {}, { onEvent: event => events.push(event) });
  return events;
}

test('ignores null, primitive, array and malformed payloads, then continues', async t => {
  const events = await collect(t, ['data: null\n\ndata: 7\n\ndata: "text"\n\ndata: true\n\ndata: []\n\ndata: broken\n\ndata: {"type":"assistant.delta","delta":"valid"}\n\n']);
  assert.deepEqual(events, [{ type: 'assistant.delta', delta: 'valid' }]);
});

test('preserves event names across split chunks and CRLF framing', async t => {
  const events = await collect(t, ['event: assistant.delta\r\nda', 'ta: {"delta":"hello"}\r\n\r\n']);
  assert.deepEqual(events, [{ type: 'assistant.delta', delta: 'hello' }]);
});

test('stops after the documented done event', async t => {
  const events = await collect(t, ['event: done\ndata: {}\n\ndata: {"type":"assistant.delta","delta":"late"}\n\n']);
  assert.deepEqual(events, [{ type: 'done' }]);
});
