#!/usr/bin/env bash
# LOCAL DB ONLY. Run after restoring a production dump and applying the schema.
#  1. overwrites every Integration token / refresh token with an obvious dummy (prints counts only)
#  2. sets a local password for admin@neptive.com
#  3. creates a fresh magic link for the Casa Pandora client user and prints the URL
set -euo pipefail
cd "$(dirname "$0")/../.."
source neptive/dev/env.sh
PSQL="docker exec -i pzn-postgres psql -U postiz-app -d postiz-db -v ON_ERROR_STOP=1 -At"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-neptive-local-admin}"
CUSTOMER=fd131113-859b-4d55-9567-4c4d4ce68352
CLIENT_USER=b5d2d89c-20f1-489c-9152-729e88f40890
ORG=d6d585e7-d225-4225-9f96-d8b595c53d72

echo "integrations total / with a non-dummy token before sanitising:"
$PSQL -c "select count(*), count(*) filter (where (coalesce(token,'')<>'' and token not like 'LOCAL-DUMMY%' and lower(token) !~ '^(demo|fake|dummy|test|mock|placeholder)') or (coalesce(\"refreshToken\",'')<>'' and \"refreshToken\" not like 'LOCAL-DUMMY%' and lower(\"refreshToken\") !~ '^(demo|fake|dummy|test|mock|placeholder)')) from \"Integration\""
$PSQL -c "update \"Integration\" set token='LOCAL-DUMMY-NOT-A-REAL-TOKEN', \"refreshToken\"=case when \"refreshToken\" is null then null else 'LOCAL-DUMMY-NOT-A-REAL-TOKEN' end, \"customInstanceDetails\"=null"

HASH=$(ADMIN_PASSWORD="$ADMIN_PASSWORD" node -e "console.log(require('bcrypt').hashSync(process.env.ADMIN_PASSWORD,10))")
$PSQL -c "update \"User\" set password='$HASH', activated=true where email='admin@neptive.com'"

TOKEN=$(openssl rand -hex 24)
TH=$(printf %s "$TOKEN" | sha256sum | cut -d' ' -f1)
$PSQL -c "insert into neptive_magic_links(id,\"tokenHash\",\"clientUserId\",\"customerId\",\"orgId\",\"expiresAt\") values (gen_random_uuid()::text,'$TH','$CLIENT_USER','$CUSTOMER','$ORG', now() + interval '7 days')"
echo "admin login: admin@neptive.com / $ADMIN_PASSWORD  (local only)"
echo "portal magic link: http://localhost:4200/portal/magic/$TOKEN"
