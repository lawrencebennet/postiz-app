# Client credentials (email + password for portal users)

A client user (`NeptiveClientUser`) can log in at `/portal/login` with email + password, in addition to
the magic link. Magic links are unchanged and remain the way in for anyone without a password, and the
way back in for anyone who forgot it. No flow depends on email: production sends none.

## What exists

| piece | where |
|---|---|
| hash storage | table `neptive_client_credentials` (model `NeptiveClientCredential`): one row per client user, `passwordHash` (bcrypt, cost 10, same library and cost as the admin login), `source` `CLIENT`/`AGENCY`, `mustChange`, `setByUserId`, timestamps. Not a column on `neptive_client_users`: no query that reads client users (agency lists, session and magic-link lookups) can carry the hash. |
| failed attempts | table `neptive_login_attempts`: one row per failure per bucket, bucket = sha256 of `scope:key`, so neither emails nor IP addresses are stored. Rows older than 24 h are deleted on the next failure. |
| restricted sessions | `neptive_portal_sessions.passwordChangeRequired` (default `false`, every existing session stays a normal session) |
| activity log | `NeptiveActivityType` + `CLIENT_PASSWORD_SET`, `CLIENT_PASSWORD_CHANGED`, `CLIENT_PASSWORD_RESET`, `CLIENT_PASSWORD_REMOVED`, `CLIENT_LOGIN_THROTTLED`, always `INTERNAL` (agency only), never with a password or hash |
| code | `libraries/nestjs-libraries/src/neptive/services/portal-credentials.service.ts` (rules), `repositories/credential.repository.ts`, `domain/credentials.ts` (password quality, temporary password, client IP), `auth/request-guards.ts` (CSRF check, what a restricted session may call) |
| UI | `components/neptive/portal-account.tsx` (`/portal/login`, `/portal/password`, `/portal/account`), "Utenti cliente" tab in `agency.client.tsx` |
| tests | `services/portal-credentials.service.spec.ts`, `domain/credentials.spec.ts`; browser + API: `node neptive/dev/qa-credentials.mjs` |

## Endpoints

| method, path | who | what |
|---|---|---|
| `POST /neptive/portal-auth/login` `{email, password, account?}` | public | 200 `{ok, passwordChangeRequired}` + session cookie; 200 `{chooseAccount:[{account,label}]}` (see "same email"); 401 `Invalid credentials`; 429 `{retryAfter}` + `Retry-After` |
| `GET /neptive/portal/me` | portal session | now also `hasPassword`, `passwordTemporary`, `passwordUpdatedAt`, `passwordChangeRequired` |
| `POST /neptive/portal/account/password` `{currentPassword?, newPassword}` | portal session | set or change the own password; 400 with a code (`PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`, `PASSWORD_IS_EMAIL`, `PASSWORD_TOO_COMMON`, `PASSWORD_SAME_AS_CURRENT`, `CURRENT_PASSWORD_WRONG`); 429 |
| `POST /neptive/agency/clients/:customerId/users/:userId/temporary-password` | agency (Postiz login) | `{password, user}`: the only time the temporary password exists in clear |
| `DELETE /neptive/agency/clients/:customerId/users/:userId/password` | agency | `{ok, removed}` |
| `GET /neptive/agency/clients/:customerId` | agency | `users[]` now also `hasPassword`, `passwordTemporary`, `passwordUpdatedAt` (no hash) |

Unchanged: `POST /neptive/agency/clients/:customerId/users` (create user + magic link; the UI now calls it
"Genera link di accesso", because no email is sent: the link is shown and copied), magic peek/consume, logout.

## The rules

**Login.** Email is trimmed and lower-cased. Candidates are the client users with that email that are not
deleted, are `activated`, have a password, and whose customer is not deleted. The password is compared with
each candidate's hash. Wrong email, wrong password, no password set, deactivated or deleted user, deleted
customer: all the same `401 Invalid credentials`, and every attempt does at least two bcrypt comparisons
(dummy hash when there are fewer candidates), so the response time does not tell them apart. (An email with
three or more password-holding accounts costs one comparison more per extra account.)

**Same email under more than one customer** (allowed by the unique key `(orgId, customerId, email)`). Each
customer's user has its own password. The password decides: if it matches exactly one of them, that
customer opens. If it matches several (the person chose the same password for both), the response lists
only those customers' names and the browser asks "Quale spazio apri?"; the second request repeats email +
password + the chosen `account` and the password is checked again for that account only. The list is
never shown before a password matched, so nobody learns which customers exist. A session is always bound
to exactly one customer, exactly like a magic-link session.

**Throttling** (window 15 minutes, failures only, counted in the database plus the requests in flight, so
parallel guesses cannot run past the limit):

| bucket | limit | applies to |
|---|---|---|
| account (email) | 5 failures / 15 min | browsers not recognised for that email |
| IP | 20 failures / 15 min | the same |
| recognised browser | 10 failures / 15 min | a browser that already logged in for that email (it skips the two buckets above) |
| current password on the account page | 5 failures / 15 min | per client user |

When a bucket is full the answer is `429` with `Retry-After` (seconds until the oldest failure leaves the
window, at most 15 minutes); attempts made while blocked are not stored, so they do not extend the block.
It applies to any email string, so a `429` says nothing about whether the account exists.

Why a client cannot be locked out for good: the lock only ever covers unknown browsers. After a successful
password login (or after setting/changing the password in the portal) the browser gets a signed httpOnly
cookie `neptive_portal_device` (180 days, bound to a hash of the email); with it the client keeps logging in
from that browser even while someone else hammers the account. A brand-new device during an ongoing attack
waits out the window or uses a magic link from the agency. Magic links are never throttled by this.

Client IP: production is host nginx -> container nginx -> backend, both append to `X-Forwarded-For`, so
the backend takes the entry two places from the right (anything further left is written by the client).
If the proxy chain changes, set `NEPTIVE_TRUSTED_PROXY_HOPS`. Local dev has no proxy: the socket address
is used, so every local attempt shares one IP bucket.

**Password quality.** At least 10 characters; at most 72 bytes (bcrypt ignores anything after byte 72, so
longer is refused rather than silently truncated); not the email nor its local part; not in a short list
of trivial values (`password123`, `qwertyuiop`, `neptive123`, ... in `domain/credentials.ts`); not a single
repeated character or two alternating ones; not a straight run (`1234567890`, `abcdefghij`, keyboard rows).
A new password equal to the current one is refused.

**Temporary password** (agency). 16 characters from an alphabet without look-alikes, grouped by four
(`k7qm-xr4p-...`, about 80 bits), generated by the server, returned once in the response, copied to the
clipboard, shown in the panel until the page reloads; only its hash is stored. Generating one replaces any
existing password and ends all the user's sessions. A login with it opens a **restricted session**:
30 minutes, and the portal middleware answers `403 PASSWORD_CHANGE_REQUIRED` to everything except
`GET /neptive/portal/me` and `POST /neptive/portal/account/password` (deny by default, also for future
routes). The UI sends the client to `/portal/password`; on that step the current password is not asked
again (the session just proved it). After the change the temporary password is dead.

**Sessions.** Setting or changing a password (client) ends all of that user's sessions, including the
current one, and opens a fresh one in the same browser; the user's other devices must log in again.
Generating a temporary password or removing the password (agency) ends all of that user's sessions.
Deactivated (`activated = false`) and soft-deleted users cannot log in, and since this change their
existing sessions stop resolving as well (before, only deletion did).

**Never exposed.** Hashes are read in two places only (login, own password change) and never returned. The
agency sees "Password impostata / temporanea / nessuna" and the date, never a password chosen by the
client. Nothing is logged with a password, hash, email or IP (the throttle warning names only the bucket
type). Unexpected errors on these endpoints become a plain `503` so an error reporter never gets the
request body.

**Cookies.** The session cookie is set by the same code as the magic link (`secure`, `httpOnly`,
`SameSite=None`, domain from `FRONTEND_URL`, 30 days; `neptive-portal` header in NOT_SECURED dev). The
device cookie has the same attributes. Responses with secrets carry `Cache-Control: no-store`.

**CSRF.** The new POST/DELETE endpoints (login, own password, agency temporary password / remove) accept
only `application/json` and only from the `FRONTEND_URL` origin (`Origin`, or `Referer` when the browser
omits `Origin`); anything else is `403` before the handler runs. A cross-site JSON request needs a CORS
preflight, which only `FRONTEND_URL` passes. Login is covered too (login CSRF: being logged into someone
else's account). The **existing** portal POST endpoints (approve, request changes, comments, PED
transition) do **not** have this check: they rely on CORS alone, and Nest also parses urlencoded bodies, so
with `SameSite=None` a plain HTML form on another site can post to them with the client's cookie in browsers
that still send third-party cookies (verified locally: see the QA log). Left unchanged here on purpose
(approval behaviour is out of scope); the fix is one line: apply `sameOriginProblem` to non-GET requests in
`NeptivePortalMiddleware`, plus `Origin` in the dev scripts that call those endpoints.

## When a client forgets the password (no email, no SQL)

1. Agency: Agenzia -> the client -> "Utenti cliente" -> the user -> **Genera password temporanea**. It is
   copied; send it to the client by whatever channel you use (phone, WhatsApp). Or **Genera link di accesso**
   and send the link.
2. Client: `/portal/login` with email + temporary password -> chooses a new password -> portal. With the
   link: opens it, then "Account" -> "Imposta una password" / "Cambia la password" (with a password already
   set, changing it from the account page needs the current one; if they do not know it, use step 1).
3. If the client is blocked by throttling ("Troppi tentativi"), a link works at once; otherwise wait 15
   minutes.

To take password access away: **Rimuovi password** (the user can still get in with a link; deleting the
user from the list stops both).

## Checking it

```
pnpm exec jest --config neptive/jest.config.ts --runInBand credentials
node neptive/dev/qa-credentials.mjs        # local stack running; screenshots + log in neptive/dev/.data/shots/credentials/
neptive/dev/schema-check.sh                # plain db push from the production schema on a throwaway copy
```
