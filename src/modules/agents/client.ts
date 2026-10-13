import { randomUUID } from 'node:crypto';
import { HttpError } from '../../http/errors';
import type { AgentSpec } from './registry';

export class AgentError extends HttpError {
  constructor(code: string, message: string, status = 502, details?: unknown) {
    super(status, code, message, details);
    this.name = 'AgentError';
  }
}

type Part = { text?: string; thought?: boolean; functionCall?: unknown; function_call?: unknown; functionResponse?: unknown; function_response?: unknown };
type AgentEvent = { content?: { parts?: Part[] } };

const isToolPart = (p: Part) => Boolean(p.functionCall || p.function_call || p.functionResponse || p.function_response);

/** The answer is the last event with plain text and no tool call (handles camelCase and snake_case payloads). */
export function extractFinalText(events: unknown): string {
  if (!Array.isArray(events)) return '';
  for (let i = events.length - 1; i >= 0; i--) {
    const parts = (events[i] as AgentEvent | undefined)?.content?.parts;
    if (!Array.isArray(parts) || parts.some(isToolPart)) continue;
    const text = parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim();
    if (text) return text;
  }
  return '';
}

export function parseAgentJson(text: string): Record<string, unknown> {
  let body = text.trim();
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) body = fenced[1].trim();
  if (!body.startsWith('{')) {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start === -1 || end <= start) throw new AgentError('agent_output_invalid', 'Agent output contained no JSON object');
    body = body.slice(start, end + 1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new AgentError('agent_output_invalid', 'Agent output was not valid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new AgentError('agent_output_invalid', 'Agent output was not a JSON object');
  // Models often write null for "omitted" optional fields; treat that as omitted.
  return Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== null));
}

export interface AgentClientOptions {
  baseUrl: string;
  timeoutMs: number;
  retries: number;
  fetchImpl?: typeof fetch;
}

export interface AgentOutcome { result: unknown; sessionId: string; ms: number }

export interface AgentClient {
  run(spec: AgentSpec, input: string, opts?: { userId?: string; requestId?: string }): Promise<AgentOutcome>;
}

export function createAgentClient(o: AgentClientOptions): AgentClient {
  const doFetch = o.fetchImpl ?? fetch;
  const enc = encodeURIComponent;

  async function post(path: string, body: unknown, requestId?: string): Promise<unknown> {
    let res: Response;
    try {
      res = await doFetch(`${o.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(requestId ? { 'x-request-id': requestId } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(o.timeoutMs)
      });
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new AgentError('agent_timeout', `Agent did not respond within ${o.timeoutMs} ms`, 504);
      throw new AgentError('agent_unreachable', 'The agent service is unreachable');
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new AgentError('agent_error', `Agent service returned HTTP ${res.status}`, 502, detail || undefined);
    }
    try {
      return await res.json();
    } catch {
      throw new AgentError('agent_error', 'Agent service returned a non-JSON response');
    }
  }

  async function attempt(spec: AgentSpec, input: string, userId: string, requestId?: string) {
    const sessionId = randomUUID();
    await post(`/apps/${enc(spec.appName)}/users/${enc(userId)}/sessions/${sessionId}`, {}, requestId);
    const events = await post('/run', { app_name: spec.appName, user_id: userId, session_id: sessionId, new_message: { role: 'user', parts: [{ text: input }] } }, requestId);
    const text = extractFinalText(events);
    if (!text) throw new AgentError('agent_output_invalid', 'Agent returned no text');
    const checked = spec.schema.safeParse(parseAgentJson(text));
    if (!checked.success) {
      throw new AgentError('agent_output_invalid', 'Agent output failed schema validation', 502, checked.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '));
    }
    return { result: checked.data as unknown, sessionId };
  }

  return {
    // Retries only malformed output; network, timeout and upstream errors fail fast.
    async run(spec, input, opts = {}) {
      const started = Date.now();
      let last: unknown;
      for (let i = 0; i <= o.retries; i++) {
        try {
          const out = await attempt(spec, input, opts.userId ?? 'api-user', opts.requestId);
          return { ...out, ms: Date.now() - started };
        } catch (err) {
          last = err;
          if (!(err instanceof AgentError) || err.code !== 'agent_output_invalid') throw err;
        }
      }
      throw last;
    }
  };
}
