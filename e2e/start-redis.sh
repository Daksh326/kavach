#!/bin/sh
# Redis plus an Upstash-compatible REST endpoint on :8079 (the test shim adds :8078).
set -e
docker network create kavach-rl >/dev/null 2>&1 || true
docker rm -f kavach-redis kavach-srh >/dev/null 2>&1 || true
docker run -d --name kavach-redis --network kavach-rl redis:8-alpine >/dev/null
docker run -d --name kavach-srh --network kavach-rl -p 127.0.0.1:8079:80 \
  -e SRH_MODE=env -e SRH_TOKEN=local-upstash-token \
  -e SRH_CONNECTION_STRING=redis://kavach-redis:6379 hiett/serverless-redis-http:latest >/dev/null
echo "Redis ready (REST on http://127.0.0.1:8079)"
