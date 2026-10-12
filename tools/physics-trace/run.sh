#!/usr/bin/env bash
# Regenerate the training-physics trace fixture used by pongSim.trace.test.js.
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/src/shared"
git -C "$repo" show 670d82c:src/game/pong.py > "$work/src/pong.py"
git -C "$repo" show 670d82c:src/shared/config.py > "$work/src/shared/config.py"
touch "$work/src/shared/__init__.py"
cp "$repo/tools/physics-trace/trace_training_pong.py" "$work/"
out="$repo/modules/gameboard/src/game/__fixtures__/training-trace.json"
docker run --rm -v "$work:/work" -w /work python:3.10-slim \
  sh -c "pip install -q --disable-pip-version-check --root-user-action=ignore numpy && python -I -B trace_training_pong.py /work/src" > "$out"
echo "wrote $out ($(wc -c < "$out") bytes)"
