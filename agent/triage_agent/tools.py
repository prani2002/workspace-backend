"""Tools for the triage agent.

Rules for every tool (ADK reads the docstring and type hints, so keep them accurate):
- plain Python function, typed arguments, returns a dict with a "status" key
- read-only: tools never change anything in external systems
- never raise for expected problems; return {"status": "error", ...} instead

Swap the JSON files for real systems (Jira, CMDB, monitoring) during the hackathon.
"""
import json
import re
from pathlib import Path

_DATA = Path(__file__).parent / "data"


def _load(name: str):
    with open(_DATA / name, encoding="utf-8") as fh:
        return json.load(fh)


def search_runbooks(query: str) -> dict:
    """Search the IT runbook knowledge base for procedures that match an issue.

    Args:
        query: Short description of the issue, for example "vpn keeps disconnecting".

    Returns:
        A dict with status "success" and up to 3 matching runbooks (id, title,
        category, steps), or status "no_match" when nothing relevant exists.
    """
    words = set(re.findall(r"[a-z0-9]+", query.lower()))
    if not words:
        return {"status": "no_match", "matches": []}
    scored = []
    for rb in _load("runbooks.json"):
        score = len(words & set(rb["keywords"]))
        if score:
            scored.append((score, rb))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    matches = [
        {"id": rb["id"], "title": rb["title"], "category": rb["category"], "steps": rb["steps"]}
        for _, rb in scored[:3]
    ]
    if not matches:
        return {"status": "no_match", "matches": []}
    return {"status": "success", "matches": matches}


def get_service_status(service: str) -> dict:
    """Get the current health of an internal service.

    Args:
        service: Service name such as "vpn-gateway", "sso", "web-frontend",
            "orders-api" or "primary-db".

    Returns:
        A dict with status "success" plus service health fields, or status
        "unknown_service" with the list of known services.
    """
    services = _load("services.json")
    key = service.strip().lower()
    if key in services:
        return {"status": "success", "service": key, **services[key]}
    return {"status": "unknown_service", "known_services": sorted(services)}
