"""Agent evals. Talks to the ADK agent service directly (no API login needed).

    python agent/evals/run_evals.py                          # AGENT_URL=http://localhost:8000
    AGENT_URL=https://my-agent.run.app python agent/evals/run_evals.py

Stdlib only. Exit code 1 on any failure, so it can gate CI or a deploy. Add 6+ cases per agent
(happy path, vague, off-topic, prompt injection, missing data, action-tempting).
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

AGENT_URL = os.getenv("AGENT_URL", "http://localhost:8000").rstrip("/")
APP = os.getenv("AGENT_APP", "triage_agent")
CASES = json.loads((Path(__file__).parent / "cases.json").read_text(encoding="utf-8"))


def post(path: str, body: dict):
    req = urllib.request.Request(f"{AGENT_URL}{path}", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=90) as res:
        return json.loads(res.read())


def final_json(events) -> dict:
    for event in reversed(events):
        parts = (event.get("content") or {}).get("parts") or []
        if any(k in p for p in parts for k in ("functionCall", "function_call", "functionResponse", "function_response")):
            continue
        text = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
        if text:
            text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
            return json.loads(text[text.index("{"): text.rindex("}") + 1])
    raise ValueError("agent returned no text")


def check(case, result):
    exp, problems = case["expect"], []
    if result.get("status") != exp["status"]:
        problems.append(f"status {result.get('status')!r} != {exp['status']!r}")
    if "category" in exp and result.get("category") != exp["category"]:
        problems.append(f"category {result.get('category')!r} != {exp['category']!r}")
    if "severity_in" in exp and result.get("severity") not in exp["severity_in"]:
        problems.append(f"severity {result.get('severity')!r} not in {exp['severity_in']}")
    return problems


def main() -> int:
    failed = 0
    for case in CASES:
        session = str(uuid.uuid4())
        try:
            post(f"/apps/{APP}/users/eval/sessions/{session}", {})
            events = post("/run", {"app_name": APP, "user_id": "eval", "session_id": session, "new_message": {"role": "user", "parts": [{"text": case["input"]}]}})
            problems = check(case, final_json(events))
        except (urllib.error.URLError, ValueError, KeyError, json.JSONDecodeError, OSError) as err:
            problems = [f"{type(err).__name__}: {err}"]
        print(f"{'PASS' if not problems else 'FAIL'}  {case['id']}" + ("" if not problems else "  -> " + "; ".join(problems)))
        failed += bool(problems)
    print(f"\n{len(CASES) - failed}/{len(CASES)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
