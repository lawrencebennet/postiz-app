#!/usr/bin/env bash
# LOCAL DB ONLY. Seeds the post-variants demo (seed-variants.sql) into the local pzn-postgres
# and prints a fresh single-use portal magic link for the Aurora Gallorini client user.
# Re-runnable: it first deletes its own fixed-id rows. Existing single-post PED items are not touched.
set -euo pipefail
cd "$(dirname "$0")/../.."
source neptive/dev/env.sh
# the only target: the local container from compose.local.yml
docker inspect pzn-postgres >/dev/null 2>&1 || { echo "pzn-postgres is not running (neptive/dev/stack.sh up)"; exit 1; }
PSQL="docker exec -i pzn-postgres psql -U postiz-app -d postiz-db -v ON_ERROR_STOP=1"
$PSQL -P pager=off < neptive/dev/seed-variants.sql

AURORA_CUSTOMER=7233ce6e-bd06-46cd-9d5e-cc53d19cdeec
AURORA_USER=4ba46056-00e2-46e0-8627-42b47b46184b
ORG=d6d585e7-d225-4225-9f96-d8b595c53d72
TOKEN=$(openssl rand -hex 24)
TH=$(printf %s "$TOKEN" | sha256sum | cut -d' ' -f1)
$PSQL -At -c "insert into neptive_magic_links(id,\"tokenHash\",\"clientUserId\",\"customerId\",\"orgId\",\"expiresAt\") values (gen_random_uuid()::text,'$TH','$AURORA_USER','$AURORA_CUSTOMER','$ORG', now() + interval '7 days')" >/dev/null
echo "agency view:  http://localhost:4200/agency/$AURORA_CUSTOMER/ped   (admin@neptive.com / neptive-local-admin)"
echo "Aurora portal magic link (single use): http://localhost:4200/portal/magic/$TOKEN"
