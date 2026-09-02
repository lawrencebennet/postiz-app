# Casa Pandora Local Setup Design

## Goal

Portare in esecuzione locale il branch Neptive del fork Postiz, verificare le viste agency/admin e client portal, creare il cliente `Casa Pandora` con un utente portale e consegnare una guida ripetibile.

## Scope

- Installazione delle dipendenze con Node 22 e PNPM 10.6.1.
- Configurazione locale tramite `.env` gitignored.
- Avvio dei servizi infrastrutturali Postgres, Redis e Temporal tramite Docker Compose.
- Avvio di backend, orchestrator e frontend in modalità sviluppo.
- Verifica HTTP e browser delle route Neptive.
- Creazione persistente nel database locale di un account agency admin, del cliente `Casa Pandora` e di un utente portale.
- Guida Markdown per i flussi admin e cliente.

## Non-scope

- Nessuna modifica ai provider OAuth social e nessuna credenziale social reale.
- Nessun import automatico di PED, creazione automatica di post o pubblicazione automatica.
- Nessun reset distruttivo del database esistente.
- Nessuna modifica al codice core Postiz se l’integrazione Neptive già presente è sufficiente.

## Architecture and data flow

Il branch `neptive` è la base dell’esecuzione. L’agency/admin usa il cookie Postiz `auth` e le route `/neptive/agency/*`; il client usa un’identità `NeptiveClientUser` autenticata da magic link e il cookie separato `neptive_portal`. Il customer è il confine di isolamento server-side: le route portal usano sempre `customerId` della sessione.

L’account agency di test sarà un utente locale `SUPERADMIN` della prima Organization. `Casa Pandora` sarà una riga `Customer` dell’Organization con il relativo `NeptiveClientProfile`. L’utente cliente sarà creato tramite l’endpoint di invito agency; il link restituito sarà conservato solo nella guida locale e usato per verificare l’accesso.

## Local services

| Service | URL/port | Purpose |
|---|---:|---|
| Frontend | `http://localhost:4200` | Agency UI and client portal |
| Backend | `http://localhost:3001` | API; `3000` is occupied by an unrelated local service |
| Orchestrator | `3002` | Temporal worker/process |
| Postiz Postgres | `localhost:5434` | Application database |
| Redis | `localhost:6379` | Cache/queues |
| Temporal | `localhost:7233` | Workflows |

## Credentials

- Agency: a local test email/password documented in the guide.
- Client: `cliente@casapandora.local`; access is through a one-time magic link, not through a Postiz organization password.
- Secrets generated for local use remain in `.env` or the untracked guide and are not committed.

## Verification

1. Confirm the expected Node and PNPM versions and successful dependency installation.
2. Confirm Prisma client generation and additive schema synchronization without reset.
3. Confirm all required containers are healthy/reachable.
4. Confirm agency login and `/agency` client listing.
5. Confirm Casa Pandora appears in the agency and its PED view is reachable.
6. Confirm the generated magic link can be previewed and consumed once.
7. Confirm the client portal `/portal` shows the Casa Pandora identity and PED scope.
8. Run the Neptive isolation tests and report any unrelated upstream failures separately.
