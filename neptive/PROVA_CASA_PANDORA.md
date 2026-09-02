# Guida di prova — Casa Pandora

Questa guida prova il layer Neptive sopra Postiz nel branch `neptive`.

## Stato locale

Il progetto è eseguito dal worktree:

```text
/home/lorenzo/Work/postiz-app/.worktrees/neptive
```

URL principali:

| Area | URL |
|---|---|
| App | http://localhost:4200 |
| Login agency/admin | http://localhost:4200/auth/login |
| Vista agency | http://localhost:4200/agency |
| Login portal cliente | http://localhost:4200/portal/login |
| Backend | http://localhost:3001 |
| Temporal UI | http://localhost:8080 |

Il backend usa `3001` perché sulla macchina la porta `3000` è già occupata da un servizio esterno. Redis usa il servizio già attivo su `localhost:6379`; non fermarlo.

## Avvio

Da una shell nella directory del worktree:

```bash
cd /home/lorenzo/Work/postiz-app/.worktrees/neptive
mise exec node@22.12.0 pnpm@10.6.1 -- pnpm install --frozen-lockfile
docker compose -f docker-compose.dev.yaml -f neptive/docker-compose.dev.override.yaml up -d \
  postiz-postgres temporal-postgresql temporal-elasticsearch temporal
mise exec node@22.12.0 pnpm@10.6.1 -- pnpm prisma-generate
mise exec node@22.12.0 pnpm@10.6.1 -- pnpm prisma-db-push
```

Avvia poi i tre processi in tre terminali distinti:

```bash
mise exec node@22.12.0 pnpm@10.6.1 -- pnpm run dev:backend
```

```bash
mise exec node@22.12.0 pnpm@10.6.1 -- pnpm run dev:orchestrator
```

```bash
mise exec node@22.12.0 pnpm@10.6.1 -- pnpm run dev:frontend
```

Aprire sempre `http://localhost:4200`, non `127.0.0.1`, per mantenere coerenti cookie e CORS.

## Credenziali admin/agency

```text
Email:    agency@neptive.local
Password: NeptiveVal1d!
```

Sono credenziali locali di test, non usarle in produzione.

## Prova da view admin/agency

1. Aprire http://localhost:4200/auth/login.
2. Inserire le credenziali admin sopra e premere **Sign in**.
3. Aprire **Agency** dal menu oppure direttamente http://localhost:4200/agency.
4. Verificare che compaia il cliente **Casa Pandora**.
5. Aprire Casa Pandora.
6. In **Overview** verificare il riquadro **Current PED**.
7. Aprire la scheda **PED** oppure direttamente:
   `http://localhost:4200/agency/e3cc2a30-97f4-4fda-81ba-52c9ef4e278f/ped`
8. Verificare il PED **PED Demo Casa Pandora**, in stato `DRAFT`, con queste voci:
   - Presentazione Casa Pandora
   - Rubrica prodotto
   - Testimonianza cliente
9. Dalla stessa pagina è possibile creare altri PED, aggiungere voci e avviare il flusso di revisione interno/cliente.
10. Le altre schede disponibili per Casa Pandora sono **Content**, **Approvals**, **Strategy**, **Activities**, **Materials**, **Analytics**, **Reports** e **Client users**.

### Invito del cliente dal pannello admin

1. Entrare nella scheda **Client users** di Casa Pandora.
2. Usare l’invito con:

```text
Nome:  Cliente Casa Pandora
Email: cliente@casapandora.local
Ruolo: CLIENT_ADMIN
```

3. In ambiente locale, senza Resend configurato, il link viene mostrato dalla risposta dell’invito/API e non viene spedito via email.
4. Aprire il link in una finestra o scheda separata.

## Prova da view cliente

### Identità cliente

```text
Email: cliente@casapandora.local
Accesso: magic link, senza password Postiz
```

Il magic link è monouso e vale 30 giorni. Il link attuale è stato consegnato separatamente insieme a questa guida; non è incluso nel repository e non va condiviso pubblicamente.

1. Aprire il magic link.
2. Nella pagina **Open your portal** premere **Continue**.
3. Verificare l’apertura di http://localhost:4200/portal.
4. Verificare che l’intestazione mostri **Cliente Casa Pandora**.
5. Verificare la dashboard con il riquadro **Current PED**.
6. Aprire **PED** oppure http://localhost:4200/portal/ped.
7. Verificare che siano visibili solo il PED Casa Pandora e le sue tre voci.
8. Provare le sezioni **Approvals**, **Upcoming**, **Strategy**, **Work done**, **Materials**, **Reports** e **Results**.
9. Usare **Sign out** per terminare la sessione portale.

Il portale usa una sessione separata da quella Postiz. Il `customerId` della sessione viene applicato server-side: non bisogna considerare la sola navigazione o il parametro URL come meccanismo di sicurezza.

## Generare un nuovo accesso cliente

Se il link è già stato consumato, è scaduto o si vuole una nuova sessione:

1. Accedere di nuovo come admin.
2. Aprire **Agency → Casa Pandora → Client users**.
3. Invitare nuovamente `cliente@casapandora.local`.
4. Usare il nuovo link restituito.

Per una verifica API, l’endpoint admin è:

```text
POST http://localhost:3001/neptive/agency/clients/<customerId>/users
```

con body:

```json
{
  "email": "cliente@casapandora.local",
  "name": "Cliente Casa Pandora",
  "role": "CLIENT_ADMIN"
}
```

## Verifiche tecniche già eseguite

- Dipendenze installate con PNPM `10.6.1` e lockfile congelato.
- Node `22.12.0` utilizzato per l’esecuzione.
- Postgres applicativo su `localhost:5434`.
- Redis raggiungibile su `localhost:6379`.
- Temporal raggiungibile su `localhost:7233`.
- Backend attivo su `localhost:3001`.
- Orchestrator attivo su `localhost:3002`.
- Frontend attivo su `localhost:4200`.
- Test Neptive: `27` test passati.
- Magic link consumato una sola volta: il replay restituisce `401`.
- Portale senza sessione: restituisce `401`.

