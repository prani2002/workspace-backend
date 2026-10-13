// Offline stand-in for `adk api_server` (same endpoints, canned answers).
// Use it to build the UI, rehearse the demo, or keep going when the model API is rate-limited.
//   node scripts/mock-agent.mjs        (listens on :8000, or PORT)
import http from 'node:http';

const PORT = Number(process.env.PORT || 8000);
const sessions = new Set();

function answer(text) {
  const t = text.toLowerCase();
  const base = { next_steps: [], missing_info: [], evidence: [], confidence: 0.85 };
  if (/\b(vpn|tunnel)\b/.test(t)) {
    return { ...base, status: 'ok', category: 'network', severity: 'P2', summary: 'VPN gateway is degraded; remote users cannot connect reliably.', suggested_team: 'Network',
      next_steps: ['Check VPN gateway status', 'Ask users to retry and capture the exact error', 'Escalate if more than 5 users are affected'],
      evidence: [{ source: 'service:vpn-gateway', detail: 'Elevated connection failures since 09:40 UTC' }, { source: 'runbook:RB-101', detail: 'VPN connection drops or fails to connect' }] };
  }
  if (/\b(500|502|503|5xx|orders|outage|down)\b/.test(t)) {
    return { ...base, status: 'ok', category: 'application', severity: 'P1', summary: 'orders-api is failing after the latest release.', suggested_team: 'Application',
      next_steps: ['Roll back release 2026.10.12 (needs human approval)', 'Page Application on-call'],
      evidence: [{ source: 'service:orders-api', detail: '5xx rate above 40% after release 2026.10.12' }] };
  }
  if (/\b(lunch|joke|weather|recipe|poem)\b/.test(t)) {
    return { ...base, status: 'out_of_scope', summary: 'This is not an IT issue.', reason: 'Request is outside IT triage scope.', confidence: 0.95 };
  }
  return { ...base, status: 'needs_info', summary: 'The report is too vague to classify.', missing_info: ['Which system or application is affected?', 'Since when, and how many people?'], confidence: 0.4 };
}

const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => resolve(d)); });

http.createServer(async (req, res) => {
  const body = await readBody(req);
  if (req.method === 'GET' && req.url === '/list-apps') return send(res, 200, ['triage_agent']);
  if (req.method === 'POST' && /^\/apps\/[^/]+\/users\/[^/]+\/sessions\/[^/]+$/.test(req.url)) {
    sessions.add(req.url.split('/').pop());
    return send(res, 200, { id: req.url.split('/').pop(), state: {}, events: [] });
  }
  if (req.method === 'POST' && req.url === '/run') {
    let payload;
    try { payload = JSON.parse(body); } catch { return send(res, 422, { detail: 'bad json' }); }
    if (!sessions.has(payload.session_id)) return send(res, 404, { detail: 'Session not found' });
    const text = payload.new_message?.parts?.[0]?.text ?? '';
    return send(res, 200, [
      { author: 'triage_agent', content: { role: 'model', parts: [{ functionCall: { name: 'search_runbooks', args: { query: text } } }] } },
      { author: 'triage_agent', content: { role: 'user', parts: [{ functionResponse: { name: 'search_runbooks', response: { status: 'success' } } }] } },
      { author: 'triage_agent', content: { role: 'model', parts: [{ text: JSON.stringify(answer(text)) }] } }
    ]);
  }
  send(res, 404, { detail: 'Not found' });
}).listen(PORT, () => console.log(`mock ADK agent on :${PORT}`));
