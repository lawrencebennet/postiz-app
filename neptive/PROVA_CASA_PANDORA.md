# Guida di prova — Casa Pandora

Questa guida verifica il PED mensile Neptive sopra Postiz. Il PED organizza i contenuti, ma il contenuto reale resta quello nativo di Postiz: media, ordine, caption, canale, programmazione e stato di pubblicazione.

## Avvio locale

```bash
cd /home/lorenzo/Work/postiz-app/.worktrees/neptive
mise exec node@22.12.0 pnpm@10.6.1 -- pnpm install --frozen-lockfile
docker compose -f docker-compose.dev.yaml -f neptive/docker-compose.dev.override.yaml up -d \
  postiz-postgres temporal-postgresql temporal-elasticsearch temporal
mise exec node@22.12.0 pnpm@10.6.1 -- pnpm prisma-generate
mise exec node@22.12.0 pnpm@10.6.1 -- pnpm prisma-db-push
node --env-file=.env neptive/scripts/casa-pandora-september.mjs
```

Avvia in tre terminali distinti:

```bash
mise exec node@22.12.0 pnpm@10.6.1 -- pnpm run dev:backend
mise exec node@22.12.0 pnpm@10.6.1 -- pnpm run dev:orchestrator
mise exec node@22.12.0 pnpm@10.6.1 -- pnpm run dev:frontend
```

URL:

| Area | URL |
|---|---|
| App | http://localhost:4200 |
| Login agency/admin | http://localhost:4200/auth/login |
| Vista agency | http://localhost:4200/agency |
| PED Casa Pandora agency | http://localhost:4200/agency/e3cc2a30-97f4-4fda-81ba-52c9ef4e278f/ped |
| Login portal cliente | http://localhost:4200/portal/login |
| Backend | http://localhost:3001 |

Il backend usa `3001` perché `3000` è occupata da un servizio locale esterno. Aprire l’app con `localhost:4200`, non con `127.0.0.1`, per mantenere corretti cookie e CORS.

## Dati demo

Lo script è idempotente e prepara:

- cliente `Casa Pandora`;
- PED `Casa Pandora — Settembre 2026`, dal 1 al 30 settembre 2026;
- un post immagine;
- un carosello Instagram di 5 slide ordinate;
- un Reel video MP4 riproducibile;
- un secondo carosello di 5 slide;
- una Story;
- caption, date/orari, canale Instagram e stati di approvazione.

Gli asset sono neutrali e locali in `apps/frontend/public/neptive-demo/`; l’integrazione Instagram demo non pubblica davvero.

Per aggiungere i due caroselli Giostra del Saracino dalle cartelle locali di
`/home/lorenzo/Downloads/`:

```bash
node --env-file=.env neptive/scripts/casa-pandora-giostra-carousels.mjs
```

Lo script collega al PED i due gruppi Postiz da 5 slide, tutti in formato
`1080×1440`, mantenendo l’ordine numerico dei file.

## Flusso agency

Credenziali locali:

```text
Email:    agency@neptive.local
Password: NeptiveVal1d!
```

1. Aprire `/auth/login` e accedere.
2. Aprire **Agency → Casa Pandora → PED**, oppure il link diretto sopra.
3. Selezionare **Casa Pandora — Settembre 2026**.
4. Usare il **Calendario mensile** per verificare date, orari, miniature, piattaforma, tipo e stato.
5. Usare **Contenuti in ordine cronologico** per la revisione completa del mese.
6. Aprire una scheda: la finestra mostra media esatti, caption, canale, programmazione, stato Postiz e stato approvazione.
7. Dalla tab **Overview**, compilare **Identità delle anteprime** per impostare nome e immagine profilo Instagram e pagina Facebook. Sono dati grafici del preview e non modificano gli account Postiz.
8. Nel carosello usare trascinamento con mouse, swipe touch, frecce, pallini e miniature numerate: l’ordine è quello dell’array media di Postiz. La fascia **Continuità del carosello** consente di valutare rapidamente l’allineamento delle slide.
9. Usare **Instagram preview** per il feed scuro Instagram e **Facebook preview** per il feed della pagina; da Facebook è disponibile anche **Apri dettaglio Facebook**.
10. Nel Reel usare il player video HTML5 con controlli; non c’è autoplay con audio. Lo stesso vale per video e gallerie Facebook.
11. Per aggiungere contenuto usare **+ Aggiungi contenuto** e selezionare un gruppo Postiz esistente. Il composer, l’upload e la programmazione continuano a essere gestiti da Postiz.
12. Per creare un nuovo contenuto aprire il composer nativo Postiz, completare normalmente media/caption/canale/data, quindi collegare il relativo `postGroup` al PED.
13. Usare **Invia al cliente** per portare il PED in revisione cliente. Questo non pubblica nulla.
14. Monitorare direttamente nel PED le approvazioni e i feedback; i commenti interni restano visibili solo all’agency.

## Flusso cliente

Utente demo:

```text
Email:  cliente@casapandora.local
Accesso: magic link monouso, senza password Postiz
```

1. Generare un magic link da **Agency → Casa Pandora → Client users** e aprirlo in una scheda separata.
2. Premere **Continue** nella schermata di accesso.
3. Aprire **PED** oppure `/portal/ped`.
4. Verificare l’intestazione **Casa Pandora · Piano editoriale · Settembre 2026** e il riepilogo dei contenuti.
5. Passare dal calendario alla lista cronologica; su telefono viene usata automaticamente la lista verticale.
6. Aprire ogni contenuto e verificare anteprima, carosello completo, ordine slide, video, caption, data/ora, canale e stato.
7. Nella finestra usare **Instagram preview** o **Facebook preview**. Il carosello è trascinabile/swipabile e mostra la paginazione; **Continuità del carosello** mostra tutte le slide nell’ordine Postiz. Facebook offre inoltre il dettaglio esteso.
8. Su un contenuto in **In attesa di approvazione** premere **Approva contenuto**.
9. Su un altro contenuto compilare il commento e premere **Richiedi modifica**. Il feedback viene salvato nel PED e mostrato all’agency.
10. Quando il PED è in revisione, usare anche l’azione di approvazione complessiva. L’approvazione non cambia la programmazione e non pubblica automaticamente.

Il cliente vede solo dati del proprio `customerId`: PED, contenuti Postiz collegati, media, approvazioni e commenti autorizzati. Non usare parametri URL come meccanismo di autorizzazione.

## Inviti e nuovo link cliente

Il magic link è monouso e vale 30 giorni. Per generarne uno nuovo:

1. accedere come agency;
2. aprire **Casa Pandora → Client users**;
3. invitare `cliente@casapandora.local` con ruolo `CLIENT_ADMIN`;
4. aprire il link restituito in una finestra o scheda separata.

Resend/email non è richiesto per questa prova: il link viene restituito dall’invito locale.

## Note su Instagram e pubblicazione

Il portale proietta il modello Postiz e supporta caroselli, immagini singole, Stories, Reel e video generici quando rappresentati dai dati nativi Postiz. Non vengono copiati o riordinati media nel modello PED.

Per una pubblicazione Instagram reale, i media devono rispettare i requisiti Postiz/Meta, inclusi URL HTTPS pubblicamente raggiungibili. Gli asset locali della demo servono alla revisione visuale locale e non sono credenziali o contenuti pubblicabili.

## Verifiche tecniche

```bash
mise exec node@22.12.0 pnpm@10.6.1 -- pnpm exec jest --config ./neptive/jest.config.ts --runInBand
mise exec node@22.12.0 pnpm@10.6.1 -- pnpm run build
```

Il test root esistente può fallire per la configurazione upstream `@nx/jest`; distinguere quel problema dai test Neptive dedicati.
