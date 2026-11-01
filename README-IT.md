# LineaMeteo · VPS Lab

Dashboard indipendente per il vortice polare stratosferico. Interfaccia, grafici e mappe sono generati per LineaMeteo; non sono riutilizzati gli asset del sito preso a riferimento.

## Cosa fa la versione automatizzata

- Raccoglie run pubblici ECMWF IFS, ECMWF ENS, AIFS, AIFS ENS, NOAA GFS e GEFS.
- Calcola vento zonale medio a 60°N ai livelli di pressione, anomalie e valori standardizzati verticali, flusso eddy v′T′ a 100 hPa e riepiloghi di run.
- Genera mappe polari originali di struttura, anomalia termica e anomalia geopotenziale a 10 e 50 hPa.
- Archivia fino a 180 giorni di run compatti; confronta le previsioni maturate con l’analisi operativa IFS e calcola bias, MAE e RMSE.
- Si aggiorna ogni sei ore tramite GitHub Actions; Cloudflare Pages pubblica il dashboard quando arrivano i nuovi dati.
- La vista verticale usa anomalie e valori standardizzati fino a 10 hPa; il GFS mostra anche i livelli grezzi fino a 1 hPa, dove non è disponibile la climatologia scelta.

Le quote grezze di membri con U60 sotto zero sono presentate per AIFS ENS e GEFS, separando run e lead e campionando +7, +10, +12 e +14 giorni; non sono probabilità calibrate né un test completo della definizione di SSW. I campi ensemble delle mappe mostrano la media del modello. La climatologia cartografica usa NCEP/NCAR Reanalysis 1, griglia 2,5°, 1991–2020. I punteggi di verifica maturano dopo l’avvio e confrontano i run con l’analisi operativa IFS, quindi non costituiscono una verifica indipendente.

## Attivazione: un nuovo progetto GitHub e uno spazio R2

La pipeline elabora GRIB e conserva le mappe fuori dalla cartella pubblica Git. Per questo servono GitHub Actions, Cloudflare Pages e un bucket R2 pubblico in lettura per le immagini.

### 1. Crea il repository GitHub

1. Crea un repository nuovo, ad esempio `lineameteo-vps-dashboard`.
2. Carica **il contenuto** di questa cartella alla radice del repository: `public/`, `pipeline/`, `.github/` e i file di configurazione.
3. In GitHub apri **Settings → Actions → General → Workflow permissions** e abilita **Read and write permissions**.

### 2. Crea il bucket Cloudflare R2

1. Crea un bucket dedicato, ad esempio `lineameteo-vps-maps`.
2. Abilita un dominio pubblico di sola lettura per il bucket (preferibilmente un dominio personalizzato R2; il dominio pubblico deve servire gli oggetti in `/maps/`).
3. Crea un token R2 con accesso **Object Read & Write** solo a questo bucket.
4. Nel repository GitHub aggiungi queste **Actions secrets**:
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
5. Aggiungi queste **Actions variables**:
   - `CLOUDFLARE_ACCOUNT_ID` — ID account Cloudflare
   - `R2_BUCKET` — nome del bucket
   - `R2_PUBLIC_BASE_URL` — base URL pubblico, ad esempio `https://mappe.tuodominio.it` (senza `/` finale)

Le chiavi restano nei segreti GitHub: non inserirle nel codice o nei post del forum.

### 3. Collega il repository a Cloudflare Pages

1. In Cloudflare crea una nuova Pages application da Git e seleziona `lineameteo-vps-dashboard`; non scegliere il progetto MeteoSpoleto.
2. Branch di produzione: `main`. Framework: **None**. Build command vuoto. Output directory: `public`.
3. Avvia la prima pubblicazione. Poi in GitHub apri **Actions** e avvia manualmente **Refresh LineaMeteo VPS dashboard**.
4. La pipeline scarica i primi dati, costruisce le mappe e aggiorna `public/data/dashboard.json`; il push su `main` attiva il deploy automatico di Pages.

Il primo avvio crea una climatologia compatta 1991–2020 da NOAA PSL e può durare più dei successivi. Se un centro non ha ancora pubblicato un dato, la dashboard conserva il run precedente e riporta le disponibilità per modello.

## Fonti e attribuzioni

- [ECMWF Open Data](https://www.ecmwf.int/en/forecasts/datasets/open-data) per IFS e AIFS; mantenere l’attribuzione ECMWF e rispettarne i termini d’uso.
- [NOAA/NCEP GEFS](https://www.nco.ncep.noaa.gov/pmb/products/gens/) e GFS per i campi operativi.
- [NOAA PSL NCEP/NCAR Reanalysis](https://psl.noaa.gov/data/gridded/data.ncep.reanalysis.html) per la climatologia mensile 1991–2020; la pagina chiede citazione NOAA PSL.
I dati restano distinguibili per modello, run, validità e fonte. Le immagini sono tracciati originali generati dai campi dei modelli, con etichette e baseline visibili. Il grafico stagionale e le verifiche si popolano via via che la pipeline archivia le analisi e che i run diventano verificabili.
