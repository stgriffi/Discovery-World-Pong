#!/usr/bin/env bash
# Golden check: frames drawn by ai-paddle-control must match the training environment's
# top-only render (git show 670d82c:src/game/pong.py) after preprocessing.
# Needs the AI image: TAG=local docker compose --profile top-player-ai-gpu build ai-paddle-control
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/training/shared"
git -C "$repo" show 670d82c:src/game/pong.py > "$work/training/pong.py"
git -C "$repo" show 670d82c:src/shared/config.py > "$work/training/shared/config.py"
touch "$work/training/shared/__init__.py"
cp "$repo/tools/ai-check/check_render.py" "$work/"
docker run --rm -e PYTHONDONTWRITEBYTECODE=1 -v "$work:/check:ro" --entrypoint python3 \
  "ghcr.io/aaron97neu/ai-paddle-control:${TAG:-local}" -B /check/check_render.py
