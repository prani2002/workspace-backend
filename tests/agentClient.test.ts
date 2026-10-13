import { describe, expect, it } from 'vitest';
import { AgentError, createAgentClient, extractFinalText, parseAgentJson } from '../src/modules/agents/client';
import { agents } from '../src/modules/agents/registry';
import { OK_RESULT } from './helpers';

const spec = agents['triage']!;
const eventsWith = (text: string) => [
  { content: { parts: [{ functionCall: { name: 'search_runbooks' } }] } },
  { content: { parts: [{ functionResponse: { name: 'search_runbooks' } }] } },
  { content: { parts: [{ text }] } }
];
const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeFetch(handlers: Array<Response | (() => Response)>) {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(String(url));
    const next = handlers.shift();
    if (!next) throw new Error('unexpected extra fetch');
    return typeof next === 'function' ? next() : next;
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const client = (f: typeof fetch, retries = 1) => createAgentClient({ baseUrl: 'http://agent', timeoutMs: 1000, retries, fetchImpl: f });

describe('agent client', () => {
  it('extracts the final text and skips tool events (camel and snake case)', () => {
    expect(extractFinalText(eventsWith('hello'))).toBe('hello');
    expect(extractFinalText([{ content: { parts: [{ function_call: {} }] } }, { content: { parts: [{ text: 'done' }] } }])).toBe('done');
    expect(extractFinalText(null)).toBe('');
  });

  it('parses JSON from fences and prose, and drops nulls', () => {
    expect(parseAgentJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseAgentJson('Here: {"a":1,"b":null} ok')).toEqual({ a: 1 });
    expect(() => parseAgentJson('nothing')).toThrow(AgentError);
    expect(() => parseAgentJson('[1]')).toThrow(AgentError);
  });

  it('happy path: creates a session then runs', async () => {
    const f = fakeFetch([jsonRes({}), jsonRes(eventsWith(JSON.stringify(OK_RESULT)))]);
    const out = await client(f.fn).run(spec, 'VPN keeps dropping');
    expect((out.result as { severity: string }).severity).toBe('P2');
    expect(f.calls[0]).toMatch(/\/apps\/triage_agent\/users\/api-user\/sessions\//);
    expect(f.calls[1]).toBe('http://agent/run');
  });

  it('retries malformed output once, then fails with schema detail', async () => {
    const ok = fakeFetch([jsonRes({}), jsonRes(eventsWith('not json')), jsonRes({}), jsonRes(eventsWith(JSON.stringify(OK_RESULT)))]);
    expect((await client(ok.fn).run(spec, 'x issue here')).result).toBeTruthy();
    const bad = JSON.stringify({ ...OK_RESULT, severity: 'P9' });
    const f = fakeFetch([jsonRes({}), jsonRes(eventsWith(bad)), jsonRes({}), jsonRes(eventsWith(bad))]);
    await expect(client(f.fn).run(spec, 'x issue here')).rejects.toMatchObject({ code: 'agent_output_invalid', details: expect.stringContaining('severity') });
  });

  it('fails fast on upstream, network and timeout errors', async () => {
    const up = fakeFetch([jsonRes({}), jsonRes({ e: 1 }, 500)]);
    await expect(client(up.fn).run(spec, 'x issue here')).rejects.toMatchObject({ code: 'agent_error', status: 502 });
    expect(up.calls.length).toBe(2);
    const net = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    await expect(client(net).run(spec, 'x issue here')).rejects.toMatchObject({ code: 'agent_unreachable' });
    const slow = (async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); }) as unknown as typeof fetch;
    await expect(client(slow).run(spec, 'x issue here')).rejects.toMatchObject({ code: 'agent_timeout', status: 504 });
  });
});
