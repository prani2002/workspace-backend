FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PORT=8000
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY triage_agent ./triage_agent
RUN useradd --create-home app && chown -R app /app
USER app
# ADK endpoints are unauthenticated: keep this service on a private network (compose) or behind your own auth.
CMD ["sh", "-c", "adk api_server --host 0.0.0.0 --port ${PORT} ."]
