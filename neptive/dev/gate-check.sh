#!/usr/bin/env bash
# LOCAL ONLY. Runs the real post workflow (v1.1.2) against the local Temporal with fake activities and the
# real variant publish gate (reads the local DB). Nothing is published: the provider activity is a fake.
# usage: neptive/dev/gate-check.sh <postId> [<postId> ...]
set -euo pipefail
cd "$(dirname "$0")/../.."
source neptive/dev/env.sh
set -a; source .env; set +a
case "$DATABASE_URL" in *127.0.0.1:55432*|*localhost:55432*) ;; *) echo "refusing: DATABASE_URL is not the local pzn-postgres"; exit 1;; esac
OUT=neptive/dev/.data/gate-check; mkdir -p "$OUT"
ESB=node_modules/.bin/esbuild
# workflow: bundled to plain JS (aliases resolved), Temporal's own bundler then sandboxes it
$ESB apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.1.2.ts --bundle --platform=node --format=esm \
  --tsconfig=apps/orchestrator/tsconfig.json --external:@temporalio/* --log-level=warning --outfile="$OUT/workflow.mjs"
$ESB neptive/dev/gate-check.ts --bundle --platform=node --format=cjs --tsconfig=apps/backend/tsconfig.json \
  --external:@temporalio/* --external:@prisma/client --log-level=warning --outfile="$OUT/gate-check.js"
TEMPORAL_ADDRESS=127.0.0.1:57233 node "$OUT/gate-check.js" "$(pwd)/$OUT/workflow.mjs" "$@"
