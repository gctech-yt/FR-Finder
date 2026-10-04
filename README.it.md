# FR Finder (italiano)

**by GC Tech** · gratuita · open source (MIT)

Estensione per Chrome che trova le **frequency response più simili** dentro un database [squig.link](https://squig.link). Scegli un IEM o una cuffia e FR Finder mostra le 10 misurazioni più vicine dello stesso database, ognuna con un mini-grafico sovrapposto.

> **Non ufficiale.** Strumento indipendente, non affiliato a squig.link né ai creator delle misurazioni.

## Perché solo dentro lo stesso database?
Ogni creator usa uno strumento di misura diverso, quindi le curve di database diversi non sono confrontabili. I risultati arrivano sempre dal sito su cui ti trovi.

## Funzioni
- 10 risultati con percentuale di somiglianza e grafico sovrapposto (riferimento in viola).
- Selettore **Bass / Normal / Treble**. Bassi e medi si correggono con l'EQ, i picchi e le valli degli alti dipendono dalla geometria del driver: **in ogni modalità c'è un leggero bias verso gli alti (da 3 kHz)**, e la modalità Treble lo accentua.
- Confronto a livello allineato: conta la forma della curva, non il volume.
- Riconosce il modello selezionato sul sito. **Cliccando un risultato lo aggiungi al grafico del sito, cliccandolo di nuovo lo togli** (quelli presenti sul grafico sono evidenziati).
- In modalità **Bass** o **Treble** le anteprime sovrapposte **ingrandiscono la zona di frequenze** interessata (20 Hz–1,5 kHz oppure 1,5–20 kHz) con una scala in dB più stretta, per vedere meglio le differenze.
- Finestra mobile e riducibile, la posizione viene ricordata.
- Caricamento solo su richiesta (**Index this database**), con Pausa e Stop. I dati restano in cache per 30 giorni.

## Installazione
1. Scarica `fr-finder-vX.Y.Z.zip` dalla pagina [Releases](../../releases) e **decomprimilo**.
2. Apri `chrome://extensions`.
3. Attiva **Modalità sviluppatore** (in alto a destra).
4. Clicca **Carica estensione non pacchettizzata** e scegli la cartella decompressa (quella con `manifest.json`).
5. Apri un sito squig.link, ricarica la pagina: compare la finestra **FR Finder**.

Serve Chrome 111 o successivo (anche Edge e Brave). Solo desktop.

## Come si usa
1. Premi **Index this database** una volta sola (vedi quanti file verranno letti; puoi mettere in pausa o fermare).
2. Seleziona un modello sul sito, oppure scrivilo nella ricerca di FR Finder e premi **Find**.
3. Scegli Bass / Normal / Treble.
4. Clicca un risultato per aggiungerlo al grafico, cliccalo di nuovo per toglierlo.

## Come viene calcolata la somiglianza
Le curve sono ricampionate su 256 punti logaritmici (20 Hz–20 kHz), con L/R mediati. Poi: (1) **smussate** di circa 1/6 di ottava, per ignorare ondulazioni strette e rumore di misura; (2) **allineate in livello** (conta la forma, non il volume); (3) ogni punto viene confrontato con l'altra curva **entro una piccola finestra di frequenza** (circa ±1/6 di ottava), così un picco a 6,2 kHz contro uno a 6,6 kHz conta quasi come lo stesso picco, mentre spostamenti più grandi restano penalizzati; (4) gli errori sono pesati per frequenza (modalità Bass / Normal / Treble) e quelli molto grandi vengono limitati, così una sola zona difficile (di solito sopra i 13 kHz) non domina il risultato.

La percentuale è una scala semplice: errore 0 dB = 100 %, 3 dB = 0 %.

## Limiti
- Funziona solo con il grafico **standard di squig.link**. I siti con altri sistemi o con dati protetti non sono supportati, volutamente.
- Curve simili su un accoppiatore non garantiscono lo stesso suono. Sopra i 10 kHz le misure dipendono molto da inserimento e strumento.

## Rispetto per i server dei creator
Niente viene scaricato finché non lo chiedi; 4 richieste alla volta, una sola volta, poi cache per 30 giorni. Se gestisci un sito squig.link e non vuoi essere supportato, apri una issue.

## Privacy
Nessun dato viene raccolto o inviato. Vedi [PRIVACY.md](PRIVACY.md).

Fatto da **GC Tech** · Licenza MIT.
