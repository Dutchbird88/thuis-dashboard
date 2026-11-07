# CLAUDE.md — Thuis Dashboard

Handleiding voor Claude Code-sessies in deze repository. Lees ook **PROGRESS.md**. Daarin staan de huidige stand en de volgende stappen.

## In het kort

Dit project is een eigen Home Assistant-dashboard in **één JavaScript-bestand**, `thuis-dashboard.js`. Het bestaat uit web components met shadow DOM, zonder build-stap, framework of afhankelijkheden. Het wordt via HACS geïnstalleerd: het type is *Dashboard* en de instellingen staan in `hacs.json`. De stijl is donker en lijkt op een iPhone-app. Alle teksten in de app zijn Nederlands.

| Bestand | Inhoud |
|---|---|
| `thuis-dashboard.js` | De hele app, ruim 5.900 regels. Dit is het enige codebestand. |
| `README.md` | Uitleg voor gebruikers: installatie en YAML-instellingen. HACS toont dit bestand (`render_readme`). |
| `hacs.json` | HACS-metadata: naam "Thuis Dashboard", minimaal HA 2024.1.0. |
| `CLAUDE.md` / `PROGRESS.md` | Documentatie voor ontwikkelaars en Claude. |

## Communicatie en werkafspraken (gebruiker)

- **Antwoord in het Nederlands**, eenvoudig en duidelijk, zonder jargon.
- **Altijd eerst een mockup bij visuele wijzigingen.** Bouw pas na akkoord.
  - Een mockup is een HTML-pagina of screenshot met de echte stijl. Bied bij twijfel 2 tot 4 opties aan (A/B/C).
- **Na akkoord op de mockup: bouwen en daarna meteen publiceren.** Er is geen apart akkoord nodig voor het publiceren (afspraak van november 2026). De controles uit "Publiceren" gelden wel altijd.
- **Geef eerst een reactie of analyse als de gebruiker daarom vraagt** ("pas nog niks aan"), en verander dan nog niets.
- **Telefoon en computer:** de telefoon (≤ 600px) heeft een eigen indeling. Laat de computerweergave ongewijzigd, tenzij de gebruiker daar expliciet om vraagt.
- **Geef advies als de gebruiker erom vraagt.** Kies zelf, met een korte motivatie.
- **Snel werken (afspraak 7 november 2026):**
  - **Geen lichte opmaak meer** maken, testen of controleren: de gebruiker gebruikt het donkere thema. Wat er al in `LIGHT` staat, blijft staan. Alleen als de gebruiker erom vraagt.
  - Tijdens het bouwen alleen testen wat verandert: `node test/test.js --alleen <naam>` (seconden).
  - De volledige vergelijking (`--vergelijk HEAD`) één keer vlak voor het publiceren; lint (`--lint`) alleen bij grotere codewijzigingen.
  - Zo min mogelijk losse testscripts: wat vaker nodig is, gaat in `test/mock.html` en `test/test.js`.
  - Mockups blijven verplicht, maar eenvoudig en snel.
- **Na publiceren:** noem het versienummer én het commitnummer (korte hash, bijvoorbeeld `v217 · c0ffee1`). De gebruiker werkt bij via HACS (opnieuw downloaden) en herlaadt de app. Ziet de gebruiker een oude versie, dan ligt dat aan de cache: download opnieuw in HACS en wis de frontend-cache of de app-cache.

## Privacy en veiligheid (strikt)

De repository is **openbaar**. Zet er nooit persoonlijke gegevens in:

- namen van gezinsleden, adres, woonplaats, postcode;
- serienummers van de P1-meter en de omvormers, de laadpaal-ID, VIN, pincodes, GPS-locaties;
- de eigen kamerindeling en entity-ids die naar de eigen apparaten verwijzen;
- merknamen van eigen apparaten die niet algemeen in de code nodig zijn.

Verdere regels:

- Persoonlijke waarden horen **alleen in de dashboard-YAML van de gebruiker** in Home Assistant, niet in de code.
  - In de code staan `null` of `[]` als standaard, of algemene namen zoals `sensor.laadpaal_*` en `sensor.byd_seal_*`. Die zijn op het merk gebaseerd en niet herleidbaar.
- **Controleer vóór elke commit en push** met een grep op persoonlijke termen. De uitkomst moet 0 zijn.
  - De lijst met termen staat níet in deze repo, want die is zelf persoonlijk. Vraag de gebruiker ernaar als je de lijst niet hebt.
  - Controleer in elk geval op: namen, straat, plaats, postcode, serienummers, de laadpaal-ID en eigen entity-ids van apparaten.
  - Controleer ook op **coördinaten** (bijvoorbeeld `grep -nE '[0-9]{2}\.[0-9]{3,}'` in de buurt van lat/lng). Gebruik voor een locatie altijd `zone.home` of `hass.config`, nooit een vaste waarde als reserve (v262).
- Vraag de gebruiker **nooit** om tokens of wachtwoorden in de chat te plakken.
- Camerastatussen bevatten `access_token` en `entity_picture`. Die zijn privé: niet loggen en niet delen.
- Deel geen attributen van de laadpaal zoals pincode en adres.
- Herinner de gebruiker bij screenshots aan kentekens, gevels, GPS, de Nabu Casa-URL en werk- of thuislocaties.
- Commits:
  - auteur `Dutchbird88 <Dutchbird88@users.noreply.github.com>`;
  - de commit-trailer die de sessie voorschrijft (Co-Authored-By en Claude-Session);
  - geen modelnamen in code of commitberichten buiten die trailer.

## Architectuur

### Kaarten (custom elements)

| Element | Class | Tab op de telefoon | Standaardwaarden | Stijl |
|---|---|---|---|---|
| `thuis-card` | `ThuisCard` | Thuis | `TDEFAULTS` | `TSTYLE` (+ `CALM`) |
| `kamers-card` | `KamersCard extends ThuisCard` | Kamers | als thuis | als thuis + `KSTYLE` |
| `zonnepanelen-card` | `ZonnepanelenCard` | Nu | `DEFAULTS` | `STYLE` |
| `verbruik-card` | `VerbruikCard` | Energie | `VDEFAULTS` | `VSTYLE` |
| `auto-card` | `AutoCard` | Auto | `ADEFAULTS` | `ASTYLE` |

- **Configuratie:** de YAML wordt samengevoegd over de `*DEFAULTS`. Bij een sleutel die leeg is (`null` of `[]`) zoekt de kaart zelf: de eerste `climate.*`, alle `camera.*`, Hue-kamers, Afvalbeheer-sensoren, alle `calendar.*` en Buienradar als weer.
- **Opbouw van het bestand** (bij benadering; zoek op naam, de regelnummers verschuiven):
  - `DEFAULTS`, constanten (`SENS_KIND`, `SENS_TXT`, `SENS_ICON`, `APP_RE`, `SMOKE_RE`, `CO_RE`);
  - de icoon-engine `RIC`;
  - `ZonnepanelenCard`, `CARD_VERSION`, `VerbruikCard`, `AutoCard`;
  - de constanten voor Thuis (`TDEFAULTS`, `TSTYLE`, `WPHASE`, `WPROG`, `DISH_PROG`, `OVEN_PROG`, `PRESETS`, `CALM`, `BINS`, `HUE_SCENES`, `KSTYLE`);
  - `ThuisCard`, `KamersCard`.
- **Versie:** `const CARD_VERSION = 'NNN'`. Die wordt in de console gelogd als `THUIS-ENERGIE-KAART vNNN`. **Verhoog het nummer bij elke publicatie.**
- **Navigatie:** `NAV` koppelt tabs aan dashboard-paden (`thuis`, `kamers`, `pv-installatie`, `verbruik`, `auto`). Op de telefoon staat onderin een tabbalk.
  - Telefoon (v219, `bindSwipe` in `bindNav`): horizontaal vegen gaat naar het vorige of volgende zichtbare tabblad, via een klik op die knop. Een veeg die binnen 30 px van de linkerrand begint, blijft voor het menu van HA (de gebruiker opent dat zo op Thuis). Overgeslagen: `.sheet`, `#camHit`, pillenrijen, `.thumbs`, elementen met `touch-action: none/pan-y` of die zelf horizontaal scrollen, en een touchmove met `preventDefault` (wegvegen). Op Auto (geen eigen knop) gaat naar rechts vegen naar Thuis.
  - Tik op het actieve tabblad = terug naar boven (`toTop`).
  - Telefoon (v244): het actieve tabblad is wit (icoon en tekst), de andere zijn grijzer. De eigen kleur per tabblad (`--tc`) geldt alleen nog op de computer.
- **Rendering:** `_build()` bouwt de DOM één keer. Daarna past `set hass()` gericht aan via `_upd*`-methodes, zoals `_updWeather`, `_updRooms`, `_updCharge`, `_updWaste` en `_updAlarm`. Bouw niet bij elke update de hele DOM opnieuw op.

### Gebruikte Home Assistant-API's

- Hulpfuncties (v264): `dayAdd(t, n)` voor kalenderdagen (nooit `± DAY` voor daggrenzen, vanwege zomer-/wintertijd); `reEsc()` voor tekst in een `RegExp`; Energie vraagt statistieken op met `units: STAT_UNITS` en rekent live standen om met `toStatUnit`; `_devEnts(device_id)` voor entiteiten van een apparaat.

- `hass.states`, en de registers `hass.areas`, `hass.floors`, `hass.entities` en `hass.devices` voor kamers en verdiepingen.
- `hass.callService(domain, service, data, target, false)`. Het vijfde argument `false` onderdrukt de foutmeldingen van HA. Dat wordt bewust gebruikt bij de BYD-start.
- WebSocket:
  - `weather/subscribe_forecast` (`_subForecast`);
  - `recorder/statistics_during_period` (Energie);
  - `logbook/<start>?entity=…&end_time=…` (geschiedenis);
  - `calendars/<id>?start&end` (agenda, afval).
- `hass-more-info`-event (`_moreInfo`) voor het standaardvenster van HA.

### Thuis/Kamers: belangrijke onderdelen

**Vensters (bottom sheets)**

- `_openSheet(kind, id)`, met de soorten `th` (thermostaat), `wx` (weer), `cv` (rolluik), `lt` (lamp), `room`, `ppl` (aanwezigheid) en `waste`.
- Geschiedenis wordt in het kamervenster getoond met de vlag `this._cvHist`, via `_cvHistory`, `_thHistory`, `_roomHistory` en `_appHistory`.
- Omlaag vegen sluit een venster (v247, in `_build`: `shEl`/`shBg`, `drag`, `shEnd`). De touchmove is **niet passief** en roept `preventDefault` aan zodra omlaag wordt geveegd vanaf de bovenkant; anders ververst de HA-app (pull-to-refresh). Tijdens slepen staat de transitie uit. Eerst de richting (v250): opzij (> 6 px en meer dan 0,8× omlaag) laat los, slepen pas bij > 10 px en 1,5× meer omlaag dan opzij. Sluiten bij > 110 px of > 24 px met > 0,45 px/ms. Uitgezonderd: `.cvsl`, `#thArc`, `.tqch`, `.pmap`.

**Kamers**

- De keten is `_areaRooms()` → `_rooms()` → `_roomsBuild()`.
  - `_areaRooms()` haalt de kamers uit de registers. De cache hangt aan de identiteit van de registers (`_arRef`).
  - `_rooms()` onthoudt het resultaat per hass-object en per tijdvak van 5 s.
- Met `rooms:` in de YAML kun je de kamers met de hand vastleggen.
- `room_order` bepaalt de volgorde binnen een verdieping. `room_merge` voegt ruimtes samen.
- Verdiepingen staan op naam gesorteerd: begane grond → eerste → tweede → zolder, en Buiten als laatste.
- Ruimtes zonder lampen, rolluiken, thermostaat of sensoren worden overgeslagen.
- Helderheidsschuif (v254, telefoon): kamers met licht aan krijgen `.kr.sl` met `.ksl` (`role="slider"`, `touch-action: none`, dus geen tabbladwissel). `_bindRoomSlider`: slepen toont direct, loslaten stuurt `brightness_pct` naar de lampen die aan zijn (geen aan: alle), ≤ 1% = uit. `_kBri` houdt de ingestelde waarde 8 s vast; `_kslDrag` voorkomt opnieuw opbouwen tijdens slepen. Stijl (v256, variant B): dunne lichtbalk (5 px) langs de onderrand van de kaart, geen knop, 9 px tijdens slepen, aanraakvlak 22 px; de kaart blijft 76 px hoog. Sinds v260 regelt opzij vegen over de hele kaart (`.kr.sl`, `touch-action: pan-y`) de helderheid relatief (breedte van de kaart = 100%); beginnen op de balk = absolute stand; na een veeg wordt de klik genegeerd (`_kslNoClick`). De kaartkleuren in Hue-stijl (goud of lampkleur) zijn getoond en afgewezen: de huidige kleuren zijn rustiger.

**Kamerpaneel**

- `_updRoomSheet` toont de sensoren als pillen bovenaan: Watersensor, Rookmelder (rook én CO, zoals Nest Protect), Beweging (met temperatuur), deur en raam.
  - Lux van de bewegingssensor: op de telefoon een eigen pil direct na Beweging ("340 lux" met Donker < 10, Schemerig < 100, Helder < 1000, anders Zonnig; maan of zon). Op de computer staat de lux nog in de bewegingspil.
- Slimme stekkers verschijnen automatisch als pil: een switch met vermogensmeter, of met "plug", "stopcontact" of "grillplats" in de naam.
- Camera-apparaten krijgen één pil met de laatste detectie. Die detecties tellen **niet** als bewegings- of rookmelder en geven geen alarm.
- Apparaten die niets doen staan als "Stand-by" in een lijst.
- In de kamer van de laadpaal (Oprit) zijn de scènes verborgen en staat de laadkaart met de knoppen Laden, Pauze en Stop.

**Apparaten**

- `_updAppliances`, `_updWasher`, `_appOpen` en `_appHistory` (7 dagen geschiedenis).
- Wasmachine (Miele) en vaatwasser/oven (Home Connect) met programma, fase en resterende tijd.
- Magnetronstand: het actieve of geselecteerde programma `microwave_*` toont "Magnetron" met een eigen icoon en het vermogen.
- Oven koelt af (uit, ≥ 50°), telefoon (v270, ontwerp C): compacte kaart in rustig oranje, "Oven koelt af" met "Uit · koel rond HH:MM" en rechts groot de temperatuur (`.ocs`/`.ocb`, op de computer verborgen; daar blijft de oude opmaak). De tijd komt uit `_ovCoolAt`: afkoelen volgens Newton met de kamertemperatuur (thermostaat, anders 20°) als omgeving, uit de metingen van 30 min (bij openen eenmalig aangevuld uit `history/period`). Te weinig gegevens: "Uit · nog warm". Rood en "Heet" zijn bewust weg: een warme oven is een waarschuwing, geen alarm.

**HomePod (mini)** (v248, alleen telefoon; stijl in `HPSTYLE`, achteraan in de `<style>` van Thuis)

- `_isSpeaker(id)`: `speakers` uit de YAML, anders elke `media_player` met "homepod" in model, apparaatnaam of id (integratie Apple TV). `_speakers()` en `_hpInfo(id)` (titel, artiest, hoes via `entity_picture`/`hassUrl`, voortgang, volume, optimistische afspeelstand `_hpOpt`).
- Thuis (v251): `#hpc` is een tegel (`.tile.mus`, ontwerp A met vage hoes) direct na `#mAf` in de `.mrow`; zolang hij zichtbaar is, krijgt `#mAf` de klasse `hpon` (verborgen, in `_applyHidden`). Luistersessie `_hpSes` (localStorage `thuis-muziek`): nieuwe sessie na > 2 min stilte. Zichtbaar bij afspelen en tot 2 min na pauze/stilte. Wegvegen (`_swipe`/`_hide`) met `dataset.sig` = start van de sessie: weg voor de hele sessie. De afvaltegel heeft bewust geen voorrang (gebruiker).
- Kamers: `speakers` per ruimte in `_areaRooms`/`_rooms`; pil `.ksp.hpp` met `HPICON`, tik opent venster `hp` met `_roomBack`.
- Venster `hp`: `_updHpSheet` (elke seconde via `_hpTimer`), knoppen `media_previous_track`/`media_play_pause`/`media_next_track`, volumeschuif `.hpsl` (uitgezonderd van vegen-sluiten).
- Een HomePod komt vaak als twee mediaspelers binnen. `_spkDedupe` (v249) houdt per apparaatnaam één: die speelt, anders die de meeste mediagegevens heeft. Is het apparaat naar de kamer genoemd, dan toont de pil het model ("HomePod mini").
- Hoes (v253): `_hpArt([bronnen])` laadt eerst op de achtergrond (cache `_hpArtC`), toont pas bij succes, anders `HPICON`. Bronnen: deze speler en de tweede speler (zelfde apparaatnaam). Om en om `Image` en `hass.fetchWithAuth` (blob-URL), tot 20 pogingen. Bij AirPlay vanaf de iPhone levert HA soms geen hoes.
- `entity_picture` van een mediaspeler bevat een token: niet loggen of delen.

**Wake on LAN** (v271, alleen telefoon; op de computer verborgen via `@media (min-width: 601px)`)

- `_wolList()`: knoppen met `platform: wake_on_lan` (of `wake_on_lan:` in de YAML: lijst van ids of `{button, ping, name, icon}`; `[]` = uit). Ping-sensor (`binary_sensor`, `platform: ping`): de enige in dezelfde ruimte als de knop, anders op gedeelde woorden in naam/id. Naam zonder "wekken/wake/wol" aan het eind.
- Tegels `.lt.wol` achteraan in `#lights` (in `_updLights`, de sleutel bevat de wol-status): uit = grijs "Uit" (of "Wekken" zonder ping), tik = `button.press` en 3 min "Wordt gewekt…" (blauw, `_wolBusy`), ping aan = "Aan" (lichtgroen `#4fd07f`). Tik op een tegel die aan is doet niets; lang indrukken = `_moreInfo` (ping, anders knop).
- Iconen `pc` en `server` in `DRAW` (tonen `on`, `busy`, `off`).
- v272: tekst "Wordt opgestart…" (niet "gewekt"). Tik op de tegel = venster `pc` (`_updPcSheet`), tik op het rondje (`.mi2`) = meteen aanzetten (`_wolWake`). Venster (variant B, gekozen): bovenin kaart Vandaag (balk 0–24 uur, totaal, laatste 3 sessies) uit `history/period` van de Ping-sensor (`_pcHistory`, 7 dagen, cache 5 min of tot de ping verandert); klokje (`#cvHb`) = tijdlijn zoals bij lampen en rolluiken (`_pcLog`, v273): grafiek 24 uur aan/uit, en per dag "Opstarten gevraagd" met wie (logboek van de knop, `_who`), "Aan" met "Opgestart in X s" en "Uit" (Ping-sensor), 7 dagen. Daaronder groot icoon en de aan-knop met exact de stijl van het lampvenster (`.lpw`; licht thema eigen kleuren). Aan = "Uitzetten kan alleen op de … zelf".
- v274: ook in het kamervenster: `_areaRooms` geeft per ruimte `wol` (knoppen in die ruimte; een ruimte met alleen een WoL-knop telt mee), pil `.ksp.wolp` na de HomePod-pil (icoon, naam, Aan/Uit/Wordt opgestart…; aan = groen, opstarten = blauw). Tik = venster `pc` met `_roomBack` (sluiten gaat terug naar de kamer).

**Meldingen**

- `_safety` en `_updAlarm` tonen rook, CO en water als rode kaart onder de camera's op Thuis. De melding is weg te vegen en komt terug bij een nieuwe verandering.
- `_updNotices`, `_health` en `_lowBat` geven verder meldingen voor:
  - entiteiten die ontbreken (1x per keer openen, na 15 s);
  - een batterij op of onder 5%, met uitzondering van Hue-dimmers en -knoppen, deur- en raamsensoren, telefoons, de auto, tandenborstels en horloges;
  - een rookmelder met een batterij op of onder 20%, of een test die bezig is.

**Weer**

- `_wxId` en `_wxState`. Met `weather: null` kiest de kaart automatisch, met Buienradar eerst.
- Alles komt uit **één bron**: heeft Buienradar geen verwachting, dan komt alles van de andere weer-entiteit (bijvoorbeeld Met.no).
- De temperatuur staat in hele graden. Onder de plaatsnaam (`weather_place`) staat de bron.

**Afval**

- `_updWaste`, `_wasteList`, `_wasteSheet` en de constante `BINS`, met de types gft, pmd, papier en rest.
- Wanneer staat een bak in beeld:
  - een dag van tevoren met MORGEN;
  - op de dag zelf met VANDAAG, tot 15:00;
  - na 15:00 komt de volgende bak.
  - Is er geen bak aan de beurt, dan staat er "Geen afval · tot en met <dag>".
- Telefoon (v217): onder de naam van de bak staat een bolletje met "Vandaag" (zacht amber `#ffcf7a`) of "Morgen" (zacht blauw `#a9c8ff`), in gewone letters, zonder label. Het bolletje heeft een zachte gloed in de eigen kleur (`0 0 6px`, zoals het online-bolletje van de laadpaal). Het kopje "Afval" heeft het groene `RIC`-icoon `recycle`: de gevouwen vorm van het officiële symbool (v218).
- Het afvalvenster toont 2 weken vooruit:
  - uit de afvalkalender als die er is, en anders de eerstvolgende datum per bak;
  - plus de groepen "Vandaag opgehaald" en "Zonder datum".

**Laden (laadpaal Zaptec + auto BYD)**

- De functies zijn `_evState`, `_evSection`, `_evAct` en `_updCharge`. In de Auto-kaart zijn dat `_chargeState` en `_chargeBtn`.
- **De laadpaal is leidend** (`sensor.laadpaal_opladermodus`). De auto levert alleen het accupercentage en de resterende tijd.
- `connected_finished` met een accu onder 99% geldt als *Gepauzeerd*. Een maximale stroom van 0 A geldt ook als gepauzeerd.
- **Pauze:** zet `number.…max_stroom` op 0 A. De vorige waarde wordt onthouden in localStorage `thuis-laadstroom`.
  - Een pauze met de schakelaar beëindigt de sessie, en dat gaf problemen.
- **Hervatten**, in deze volgorde:
  1. zet de stroom terug;
  2. zet `switch.…opladen` aan;
  3. druk op `button.…hervat` als die beschikbaar is;
  4. druk na 4 s op `button.byd_seal_start_charging`, maar alleen als het vermogen dan nog 300 W of minder is. Een weigering van de auto wordt stil genegeerd.
  - Na 30–45 s volgt een tweede poging.
  - De knop toont "Opdracht verstuurd…" tot de laadpaal reageert, maximaal 45 s.
- **Stop:** zet de schakelaar uit. Laat nooit 0 A achter.
- **Auto verversen** (`_carRefresh`): druk op `button.byd_seal_geforceerd_ophalen`, maar alleen als de auto aan de laadpaal hangt:
  - bij het openen van de app of als de app weer zichtbaar wordt, hooguit 1x per 2 min (`thuis-auto-ververst`);
  - elke 5 min tijdens het laden.
- **Laadkaart op Thuis:**
  - tik opent het kamerpaneel met de laadpaal en scrolt ernaartoe;
  - vegen verbergt de kaart;
  - de kaart is teal met een gloed en een balk over de hele breedte;
  - bovenaan "72% | Laden / vol om …", daaronder "3,7 kW · nog …".

**Nu (zonnepanelen) op de telefoon** (v220, alleen ≤ 600px, opmaak onder `.znu` zodat de gedeelde `STYLE` de andere kaarten niet raakt)

- Bovenaan de bestaande kop en het bestaande menu. Daarna de tegels `.mob`: Mijn huis (`photo.image`; rij zon — huis — net: `.mfrow` met rondjes `#mnSun`/`#mnGrid`, stroomlijnen `#mc1`/`#mc2` (`.mln`, `.on`/`.rev`/`.imp`; achter de foto, beginnend 3 px naast de rondjes), verbruik `#mHomeW` met `--hc` groen/blauw/paars; kleuren van Energie: zon amber, terug `--exp`, afname `--grid-in` paars. Een ring om het huis (v234) is geprobeerd en teruggedraaid in v235: te druk met de ronde meters eronder) en twee meters (`.mgauges`: Opwekking nu tot `max_power`, Opgewekt vandaag tot de beste dag van 30 dagen, zie v227). Bijgewerkt in `_updMob`. De gedeelde `.val` heeft een oranje gloed (computermeter); `#mg2` krijgt op de telefoon een eigen groene gloed (v245).
- De grafiek Vermogen vandaag (`.tday`) en de panelen (`.tpan`) zijn de computerversies; de panelen krijgen op de telefoon gelijke kolommen (`--gc` = meeste omvormers per dakkant).
- Verborgen op de telefoon: de foto-, meter- en energiestroomtegel. Tik op het huis zet `.mphoto` op `.wrap`: de fototegel verschijnt als venster.
- v221: de 30-dagentegel (`.tdays`) heet op de telefoon "Opbrengst" en heeft de keuze Week/Maand/Jaar (`#dseg`, `this._rng`, standaard Week sinds v226; jaar via `_monthValues`/`_fetchYear`). Op de computer blijft het altijd 30 dagen. Opgewekt vandaag loopt sinds v227 tot de beste dag van de afgelopen 30 dagen, naar boven afgerond op een even getal (minimaal 4, zonder gegevens 20).
- v221: panelen op de telefoon als raster 5×2 (`.mpanels`, `[data-mp]`), dat in `_updMob` de computerpanelen kopieert (kleur, waarde, −%-label). `Omvormers ›` (`#mInv`) zet `.mdet` op `.wrap` en toont dan `.sides`.
- Tekst die alleen op de telefoon of alleen op de computer hoort: `.ml` (telefoon) en `.dl` (computer).
- v224 (telefoon): `_drawToday` toont alleen het deel van de dag met zon (eerste opbrengst/verwachting − 1 uur tot laatste, nu of einde verwachting); de verwachtingspunten staan al in het midden van het uur (dat doet `_fetchStats`: niet nog eens verschuiven, zie v225); de lijn begint en eindigt op 0 aan het begin en eind van de uren met zon. `_drawDays` gebruikt een strakkere schaal (4 × een ronde stap). Op de computer niets veranderd.
- v228 (telefoon en computer): opgewekt vandaag = alleen de ECU-teller (`solar_today`). De verwachting gaat via `fcPeriods`: oude HA zet de waarde op het einde van de periode (dag begint met 0 bij zonsopkomst), nieuwe HA op het begin (`energy_by_period_start`). Punten in watt, in het midden van de periode, met `s`/`e` als periodegrenzen.
- v223 (telefoon): `Omvormers` toont rechts `#mIst` met het aantal online (`inverters_online`): groen alles, oranje een deel, rood geen, grijs "In rust" als `sun` onder is. Zonder die sensor blijft het pijltje staan.
- v222 (telefoon): gele grafiek heet "Vandaag" en toont geen piek (`.pkinfo` verborgen); Opbrengst zonder gemiddeldelijn; bij Week staat de opbrengst boven elke staaf (`.bv`).

**localStorage-sleutels** (allemaal met try/catch):

| Sleutel | Waarvoor |
|---|---|
| `thuis-verborgen`, `thuis-verborgen-v` | weggeveegde kaarten |
| `thuis-meldingen`, `thuis-gezien` | meldingen |
| `thuis-alarm` | weggeveegd alarm |
| `thuis-laadstroom` | stroom vóór de pauze |
| `thuis-auto-ververst` | wanneer de auto voor het laatst is ververst |
| `thuis-vaat-klaar` | vaatwasser klaar |
| `thuis-muziek` | luistersessie van de HomePod (start, einde, speler) |

### Iconen: `RIC` (stijl "Rounded")

- Gebruik `RIC.draw(name, tone, …)`, `RIC.svg(name, tone)` en `RIC.room(icon)`. De tekeningen staan in de map `DRAW`, de verlopen zijn `url(#g-<naam>)`. `OFF`/`'off'` geeft de grijze variant.
- Kamericonen (`ROOMICON`): attic, sofa, pot, door, toilet, bed, bath, desk, stairs, tree, drive, shed, wash.
- Sensoren en apparaten: leak, smoke, motionS (lopend poppetje), contact, windowS, washer, micro (zwarte magnetron, ontwerp C) en meer.
- Nieuwe iconen maak je in dezelfde Rounded-stijl, en eerst als mockup.

## Ontwerpafspraken (UI)

- **Donker en rustig**, in Apple-stijl (de gebruiker koos in v240 voor donker; licht kan via `theme: licht`, alleen op de telefoon), zonder kleuren of gloed die er "AI-achtig" uitzien.
  - Kleur alleen met betekenis: rood = alarm, oranje = waarschuwing/open, teal = laden, blauw = wacht/gepland.
- **Telefoon (`CALM`, alleen ≤ 600px, Thuis en Kamers):**
  - effen vensters (`#111827`) en apparaatkaarten zonder gekleurde rand of gloed; uitzondering sinds v243: het thermostaatvenster (oranje bij verwarmen, anders blauw) en het lampvenster (lampkleur) houden hun eigen kleur;
  - grijze chips en grijze afvallabels;
  - venstertitels en ondertitels **gecentreerd**, de ondertitel grijs;
  - alarmen houden hun rode gloed.
  - Het pulserende rode bolletje bij de camera op de telefoon is weg.
  - Het camerabeeld op Thuis is 196 px hoog (v246, was 220 px).
- **Bewust zo gelaten (november 2026):** de gekleurde chips (Lampen, Rolluiken, Klimaat), de gloedrand van de tegels en de gloed om de profielfoto's blijven. Vlakke tegels en grijze chips zijn als mockup getoond en afgewezen: de gebruiker wil zien wanneer iets actief is. Niet opnieuw voorstellen.
- **Picnic-tekst (v256):** vóór het tijdvak "Verwacht/Vandaag · over X min" (tot het begin), binnen het tijdvak "Onderweg · elk moment". Is er een live-aankomstsensor (v257: `ids.live` in `_picnicIds`, standaard `sensor.picnic_estimated_arrival_of_next_delivery`, tijdstip of minuten), dan "Onderweg · nog X min" (binnen 30 min) en "elk moment" bij < 1,5 min of voorbij. Na bezorgen (v258, `ids.done` = `last_order_delivery_time`, binnen 2 uur vóór het tijdvak of later, vandaag): "Picnic is bezorgd" met het tijdstip, 15 min lang, daarna weg. Sinds v259 ook bezorgd als `last_order_status` afgerond is (`ids.status`, `ids.lslot` gelijk aan het tijdslot); sensoren worden ook op entiteitnaam gevonden.
- **Picnic-kaart (telefoon, v241):** gedempt Picnic-rood (zachte tint, dunne rand, `#ffc2c2` voor Vandaag/Onderweg, balk zonder gloed). Een bezorging is informatie, geen waarschuwing. Sinds v242 icoon 58 px met 22 px afstand tot de tekst.
- **Thermostaattegel (telefoon, v270):** bij op temperatuur is de tekst "Op temperatuur · 19°" grijs; alleen het vinkje is groen. Het huisje (stand Thuis) blijft in de huidige kleur (keuze gebruiker).
- **Bediening (Thuis):** `hide_lights` (v272) verbergt lampen op naam of entity-id, ook bij een zelf gekozen `lights:`-lijst (`_lightIds` filtert `_lightIds0`). Eigen namen (zoals buitenlampen) horen alleen in de YAML.
- **Kamerkaart:** de temperatuur staat klein en grijs in de statusregel, met een effen thermometer. Bij apparaten staat alleen "Nog xx min". Het aantal lampen staat niet achter de verdiepingen.
- **Teksten:**
  - "Stand-by" alleen als een apparaat niets doet;
  - "Watersensor" met "Geen water gedetecteerd" / "Water gedetecteerd";
  - bij laden "Laden", "Gepauzeerd", "Laden start", "Aangesloten", "Niet aangesloten";
  - knoppen "Laden", "Pauze", "Stop" in een neutrale stijl (de stijl van de thermostaat-stepper), zonder kleur.
- **Stekkerpil:** bij Aan licht alleen het stekkericoon op. Er staat geen tekst "Aan" en er is geen gele gloed. Bij Uit is de pil grijs.
- **Lichte weergave (v236, alleen telefoon):** `theme: donker (standaard, weer sinds v240) | licht | automatisch`. `applyTheme(el, config)` in elke `setConfig` zet `data-th="l"` op de host; `automatisch` volgt `prefers-color-scheme`. Geen onthouden keuze meer (v238: `thuis-thema` wordt gewist), elke kaart volgt alleen zijn eigen `theme`. Alle stijl staat in de constante `LIGHT` (onder `:host([data-th=l])` en `@media (max-width: 600px)`), achteraan in elke `<style>`. Algemene tekstkleuren gelden alleen binnen `.znu`/`.twrap`, zodat Energie en Auto hun gekleurde cijfers houden (donkerdere varianten via de variabelen). Thermostaatvenster: `isLight(this)` tekent een eigen boog (zelfde geometrie, dus slepen werkt gelijk) en toont `#thPow` (aan/uit via `set_hvac_mode`, alleen als `hvac_modes` `off` bevat). Uit-iconen: `#g-gray`/`#g-grayL`/`#g-grayD` licht blauwgrijs. De bovenste rand (statusbalk) volgt het thema via `chromeApply` (v239). Op de telefoon wordt hij altijd gezet, ook zonder zichtbare kaart (v266: de beperking uit v263 gaf een lichte balk bij het laden en is op verzoek teruggedraaid; niet opnieuw invoeren). Elke `connectedCallback` roept `chromeApply` ook direct aan (v265). Daarna `hideScrollbars(this)` (v267, na 0,3 en 2 s): verbergt de scrollbalk van de scrollende HA-elementen boven de kaart (alleen telefoon). De vensters (`.sheet`) verbergen hun eigen scrollbalk via `HPSTYLE` (v268). Daarvoor staat `-webkit-overflow-scrolling` op `auto` (v269): met `touch` tekent iOS een eigen scrollbalk. Let op: inline `style="color:#fff"` (zoals `.was .tm`) moet in `LIGHT` apart worden overschreven, en telefoonregels met `background: none` (`#bedTile`, `#agTile`, `#camTile`) ook.

## Ontwikkelen, testen en publiceren

### Bronbestand

- Pas `thuis-dashboard.js` **rechtstreeks** aan. Het is de openbare versie: alle persoonlijke waarden staan in de YAML van de gebruiker.
- In eerdere sessies bestond een tijdelijk werkbestand (`zp.js`) met persoonlijke standaardwaarden. Een script (`split.js`) maakte daar de openbare versie van. Die bestanden stonden in een tijdelijke scratchpad en zijn in een nieuwe sessie niet aanwezig.
  - Het resultaat was byte voor byte gelijk aan `thuis-dashboard.js`, dus er gaat niets verloren.
  - Voeg nooit persoonlijke standaardwaarden toe aan het bestand in de repo.

### Testen (zonder echte Home Assistant)

- **Syntax:** `node --check thuis-dashboard.js`.
- **Lint:** `npx --yes eslint@8.57.0 --no-eslintrc --env browser,es2022 --parser-options=ecmaVersion:2022 --rule '{"no-undef":"error","no-redeclare":"error","no-dupe-keys":"error"}' thuis-dashboard.js`. Dit moet 0 fouten geven en is getest bij v214. Gebruik eventueel ook `no-unused-vars` als waarschuwing.
- **Testpagina en testscript (in de repo, map `test/`):**
  - `node test/test.js` doet alles in één keer: `node --check`, controle op vaste coördinaten, de persoonlijke-termencheck en screenshots van 25 views (alle tabbladen op 390 en 1280, muziek, alarm, oven, Wake on LAN en de vensters thermostaat, afval, kamer, HomePod en computer) in `test/out/`. Lint alleen met `--lint`. Een fout in de console telt als fout.
  - `node test/test.js --vergelijk HEAD~1` (git-ref of pad naar een .js) vergelijkt elke view pixel voor pixel met die versie. Bij verschil komen er `<naam>.oud.png` en `<naam>.verschil.png` bij (verschil in rood). Een view die in de oude versie nog niet bestaat (fout bij de actie), heet "nieuw". Gebruik dit vóór elke publicatie: de computerviews moeten "gelijk" zijn bij wijzigingen voor de telefoon.
  - Extra: `--alleen <deel van de naam>` en `--lint`. De klok staat vast op 5 november 2026 12:30, dus screenshots zijn steeds gelijk.
  - `test/mock.html` is de nep-Home Assistant (alleen verzonnen namen). Parameters: `card=thuis|kamers|nu|energie|auto`, `src=` (versie), `th=`, `hp=playing|paused|idle` + `art=1`, `dup=1`, `wt=<bak>0|1`, `ev=<laadpaalmodus>`, `pv=`, `alarm=water|rook`, `lx=`, `oven=koel|aan`, `tok=1` (thermostaat op temperatuur), `wol=1` (computer uit en server aan, met Ping-sensoren en historie), `hide=` (hide_lights). Het script draait in een eigen scope, omdat de app globale namen als `DAY` heeft.
  - Persoonlijke termen: zet ze in `test/prive.txt` (één per regel). Dat bestand staat in `.gitignore` en is er in een nieuwe sessie niet: vraag de gebruiker dan om de lijst. Zonder dat bestand meldt het script "niet gecontroleerd".
  - Zet nooit eigen entity-ids, namen of foto's in `test/`. De foto's van huis en auto zijn getekende SVG's.

### Publiceren (na akkoord van de gebruiker)

1. Verhoog `CARD_VERSION`.
2. Voer `node test/test.js --vergelijk HEAD` uit (syntax, privacy en de pixelvergelijking); bij grotere codewijzigingen met `--lint`.
3. Doe de persoonlijke-gegevens-grep. De uitkomst moet 0 zijn.
4. Werk de README bij als er instellingen bij zijn gekomen.
5. `git fetch origin main`, dan een commit met de titel `vNNN: <korte Nederlandse omschrijving>` en daarna `git push -u origin main`.
   - Er wordt direct op `main` gewerkt: dat is de afspraak in dit project. Maak geen PR, tenzij de gebruiker erom vraagt.
6. Voeg een regel toe aan PROGRESS.md (versiegeschiedenis).
7. Zeg tegen de gebruiker: "Werk bij via HACS (opnieuw downloaden) en herlaad."
   - Noem daarbij het versienummer en het commitnummer (`git rev-parse --short HEAD`).

## Bekende aandachtspunten

- **HA 2026.11:** HACS wordt de *Marketplace*.
  - De migratie gaat automatisch, maar voor deze eigen repository is een GitHub-koppeling nodig (device login).
  - Updates lopen daarna via Instellingen → Marketplace / Updates.
- **`friendly_name` gaat op termijn verdwijnen** (aangekondigd in 2026.11). Sinds v215 lopen alle namen in Thuis/Kamers via `_nm(id of state)`:
  - eerst `hass.formatEntityName` (HA 2025.10+, naam uit het register), dan `friendly_name`, dan apparaat- + entiteitnaam uit `hass.entities`/`hass.devices`;
  - gebruik `_nm()` voor nieuwe code, lees `attributes.friendly_name` niet direct.
- **Cache:** na een update ziet de gebruiker soms nog de oude versie. Download dan opnieuw in HACS en wis de frontend- of app-cache.
- **Entity-ids van laadpaal en auto** zijn standaardwaarden voor de integraties Zaptec en BYD. Een ander merk heeft andere namen nodig in de YAML.
- **De Buienradar-integratie levert soms geen verwachting.** Dan komt alles van de andere weer-entiteit. Dat is zo bedoeld.
