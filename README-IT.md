# LineaMeteo · VPS Lab

Dashboard indipendente per il vortice polare stratosferico. Interfaccia, grafici e mappe sono originali per LineaMeteo; non vengono riutilizzati gli asset grafici del sito preso a riferimento.

## Contenuti e aggiornamento

- ECMWF IFS, ECMWF ENS, AIFS, AIFS ENS, NOAA GFS e GEFS.
- Indicatori U60 a 10 hPa, previsione d'ensemble, quota grezza dei membri con U60 sotto zero e flusso eddy v′T′ a 100 hPa.
- Grafico ensemble giornaliero del vento zonale per ECMWF ENS e AIFS ENS, con media e fascia 10°–90°; temperatura media e fascia ensemble quando i campi dei membri sono disponibili. GEFS riporta il controllo e i 30 membri perturbati ai lead campionati +7, +10, +12 e +14 giorni.
- Riferimento hindcast ECMWF IFS S2S 2006–2025: percentili del vento U60 a 10 hPa fino al giorno 45, confrontati con il run ECMWF ENS operativo solo sulle scadenze comuni. È climatologia storica del modello, non una previsione operativa a 46 giorni. Il feed storico pubblico è aggiornato mensilmente; la finestra stagionale usa inizializzazioni entro ±15 giorni dell’anno.
- Mappe polari generate dal workflow: struttura/geopotenziale, anomalia di temperatura e geopotenziale, vento zonale a 10 e 50 hPa.
- Vista verticale con anomalie e valori standardizzati fino a 10 hPa; GFS mostra anche valori grezzi fino a 1 hPa.
- Confronto degli ultimi 6 o 12 run, andamento stagionale e verifica retrospettiva con bias, MAE e RMSE.
- Aggiornamento ogni sei ore via GitHub Actions. Ogni esecuzione genera i dati e le immagini e li pubblica direttamente su Cloudflare Pages con Wrangler.

La dashboard non usa R2: non occorre attivare l’abbonamento R2 né creare bucket. Le mappe sono incluse nella distribuzione Pages corrente; il workflow conserva nel repository solo i JSON compatti dei dati e dello storico. La cache GitHub Actions conserva la climatologia NOAA per evitare di riscaricarla a ogni esecuzione. Il riepilogo hindcast è salvato come JSON compatto e ricalcolato quando cambia la finestra stagionale o il dato supera 35 giorni.

Le quote grezze di membri con U60 sotto zero sono mostrate per ECMWF ENS, AIFS ENS e GEFS ai lead +7, +10, +12 e +14 giorni; non sono probabilità calibrate né una verifica completa della definizione di SSW. I punteggi di accuratezza confrontano i run con l’analisi operativa IFS e non sono una verifica indipendente. La climatologia delle mappe usa NCEP/NCAR Reanalysis 1, griglia 2,5°, 1991–2020. La vista hindcast usa il reforecast IFS CY49R1 S2S pubblicato da Planette su AWS Open Data (CC BY 4.0), dieci membri, griglia atmosferica 1,5° e copertura 2006–2025. Il prodotto non include ancora la previsione operativa ECMWF estesa fino a 46 giorni, CFSv2 o climatologia ERA5; questi richiedono feed/prodotti distinti. L’hindcast è un riferimento di climatologia del modello e non sostituisce tali previsioni.

## Configurazione

### 1. Repository GitHub

Carica il contenuto di questa cartella nella radice del repository `lineameteo-vps-dashboard`. In **Settings → Actions → General → Workflow permissions**, seleziona **Read and write permissions**.

### 2. Progetto Cloudflare Pages senza R2

1. In Cloudflare torna a **Workers & Pages** e scegli **Create application → Pages → Direct Upload**. Non creare un bucket R2 e non attivare il relativo abbonamento.
2. Crea il progetto `lineameteo-vps-dashboard` scegliendo **Direct Upload**, poi carica la cartella `public` contenuta nel pacchetto estratto. La pagina iniziale può mostrare “in attesa” finché non parte il primo aggiornamento automatico.
3. Nota: Cloudflare non consente di convertire in seguito un progetto Direct Upload in un progetto Git-integrated. Qui il deploy automatico verrà gestito da GitHub Actions con Wrangler.

### 3. Token Cloudflare

In **Cloudflare Dashboard → My Profile → API Tokens → Create Token → Custom Token**, crea un token con il permesso **Account → Cloudflare Pages → Edit**. Copialo subito: Cloudflare lo mostra una sola volta.

Nel repository GitHub vai a **Settings → Secrets and variables → Actions** e aggiungi:

- **Repository secret** `CLOUDFLARE_API_TOKEN` — il token appena creato.
- **Repository variable** `CLOUDFLARE_ACCOUNT_ID` — ID account Cloudflare.
- **Repository variable** `CF_PAGES_PROJECT` — nome esatto del progetto Pages (`lineameteo-vps-dashboard` se hai usato quello consigliato).

Non inserire mai il token nel codice o in un messaggio pubblico.

### 4. Avvio

Apri **Actions → Refresh LineaMeteo VPS dashboard → Run workflow** e avvia il workflow sul branch `main`. La prima esecuzione crea la climatologia e scarica i modelli; le successive riutilizzano la cache. Il deploy viene pubblicato all’indirizzo `https://<nome-progetto>.pages.dev`.

## Fonti e attribuzioni

- [ECMWF Open Data](https://www.ecmwf.int/en/forecasts/datasets/open-data) per IFS e AIFS; mantenere l’attribuzione ECMWF e rispettarne i termini d’uso.
- [NOAA/NCEP GEFS](https://www.nco.ncep.noaa.gov/pmb/products/gens/) e GFS per i campi operativi.
- [NOAA PSL NCEP/NCAR Reanalysis](https://psl.noaa.gov/data/gridded/data.ncep.reanalysis.html) per la climatologia 1991–2020.
- [Planette ECMWF IFS S2S Reforecast su AWS Open Data](https://registry.opendata.aws/ifs-s2s-forecast-data/) e [documentazione del dataset](https://github.com/PlanetteAI/planette_ifs_archive) per la climatologia hindcast. Dataset con licenza CC BY 4.0; attribuzione ECMWF e Planette mantenuta nel prodotto.
- [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) e [deploy con GitHub Actions](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/) per la pubblicazione tramite Wrangler.

## Note operative

- La frequenza prevista è quattro aggiornamenti al giorno (ogni sei ore); se un archivio modello non ha ancora pubblicato il run atteso, la pipeline mantiene il run precedente disponibile.
- La pipeline usa run e finestre di previsione pubbliche, quindi singoli modelli/campi possono mancare in un aggiornamento.
- Il progetto è separato da MeteoSpoleto.
