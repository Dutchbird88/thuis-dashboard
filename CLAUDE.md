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
  - **Mockups standaard als afbeelding** (afspraak 10 november 2026, vervangt de Artifact-afspraak van dezelfde dag): een screenshot (PNG) van een HTML-mockup in de echte stijl. **Alleen als de gebruiker erom vraagt** een interactieve mockup als Artifact-link (claude.ai/artifact/…), met beweging (echte iconen uit `RIC`, echte animaties) en klikbare standen/varianten. Daarin geen persoonlijke gegevens (alleen voorbeeldwaarden, geen camerabeelden of eigen namen); de pagina is privé, delen doet de gebruiker zelf; een nieuwe versie voor hetzelfde onderwerp op dezelfde link.
- **Na akkoord op de mockup: bouwen en daarna meteen publiceren.** Er is geen apart akkoord nodig voor het publiceren (afspraak van november 2026). De controles uit "Publiceren" gelden wel altijd.
- **Geef eerst een reactie of analyse als de gebruiker daarom vraagt** ("pas nog niks aan"), en verander dan nog niets.
- **Telefoon en computer:** de telefoon (≤ 600px) heeft een eigen indeling. Laat de computerweergave ongewijzigd, tenzij de gebruiker daar expliciet om vraagt.
- **Geef advies als de gebruiker erom vraagt.** Kies zelf, met een korte motivatie.
- **Snel werken (afspraak 7 november 2026):**
  - **Geen lichte opmaak meer** maken, testen of controleren: de gebruiker gebruikt het donkere thema. Wat er al in `LIGHT` staat, blijft staan. Alleen als de gebruiker erom vraagt.
  - Tijdens het bouwen alleen testen wat verandert: `node test/test.js --alleen <naam>` (seconden).
  - Kleine wijziging of fix: alleen `node --check`, de view die verandert en één computerview (`--alleen`). De volledige vergelijking (`--vergelijk HEAD`) alleen bij grote of visuele wijzigingen; lint (`--lint`) alleen bij grotere codewijzigingen.
  - Geen losse testscripts; antwoorden kort houden (gebruiker vindt het werk te traag, 7 november 2026).
  - Zo min mogelijk losse testscripts: wat vaker nodig is, gaat in `test/mock.html` en `test/test.js`.
  - Mockups blijven verplicht, maar eenvoudig en snel.
- **Na publiceren:** noem het versienummer én het commitnummer (korte hash, bijvoorbeeld `v217 · c0ffee1`). **Eindig het bericht altijd met die release-info als laatste regel**, op zichzelf, bijvoorbeeld: `v287 · fe9b9d7` (afspraak 8 november 2026). De gebruiker werkt bij via HACS (opnieuw downloaden) en herlaadt de app. Ziet de gebruiker een oude versie, dan ligt dat aan de cache: download opnieuw in HACS en wis de frontend-cache of de app-cache.

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
  - Telefoon (v244): het actieve tabblad is wit (icoon en tekst), de andere zijn grijzer. Sinds v295 is het actieve tabblad lichtblauw `#7cb6ff` (de kleur van Thuis), op elk tabblad. De eigen kleur per tabblad (`--tc`) geldt alleen nog op de computer.
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
- v332 (telefoon): de pil Beweging heeft `data-mo` en opent venster `mo` (`_updMoSheet`, historie van vandaag via `_moHistory`, cache 1 min of tot de sensor verandert; stijl `.mos` in `HPSTYLE`) met `_roomBack`. Ontwerp A: groot icoon `motionS` (26 px onder de titel), chips temperatuur/lux/aantal, tijdbalk `.mostrip`, lijst van de laatste 6 bewegingen met duur. v333: klokje `#cvHb` → `_moLog` (7 dagen, per dag `.mostrip.mostatic` + periodes, samengevoegd bij < 3 min tussenpoos); schuiven over `.mostrip` (pointer, `touch-action: none`, uitgezonderd van vegen-sluiten) toont tijdstip en dichtstbijzijnde beweging in `#moTot`; `_moScrub` voorkomt opnieuw opbouwen tijdens het schuiven.
- Slimme stekkers verschijnen automatisch als pil: een switch met vermogensmeter, of met "plug", "stopcontact" of "grillplats" in de naam.
- Camera-apparaten krijgen één pil met de laatste detectie. Die detecties tellen **niet** als bewegings- of rookmelder en geven geen alarm.
- Apparaten die niets doen staan als "Stand-by" in een lijst.
- In de kamer van de laadpaal (Oprit) zijn de scènes verborgen en staat de laadkaart met de knoppen Laden, Pauze en Stop.

**Apparaten**

- `_updAppliances`, `_updWasher`, `_appOpen` en `_appHistory` (7 dagen geschiedenis).
- Wasmachine (Miele) en vaatwasser/oven (Home Connect) met programma, fase en resterende tijd.
- v329/v330 (telefoon): tijdens wassen en spoelen (niet bij pauze, centrifugeren, pompen, drogen, kreukbescherming of stomen) krijgt `#was` de klasse `wash` en een laag `.wbb` met 7 kleine zeepbellen rechts (vaste posities, CSS-animatie `wbub`, in `HPSTYLE`; uit bij `prefers-reduced-motion`). Testpagina `was=1`.
- v361 (telefoon, wasmachine bezig): ontwerp van de gebruiker 1:1 (`.wx` naast de oude `.r`/`.bar`, die op de telefoon verborgen zijn): links icoon (`washSvg`, animatie blijft), "Wasmachine" vet/schuin, blauw "Bezig · programma · 40°", groot "39 min" + "resterend", balk; rechts achter een lijn `WXI.clock` "Klaar om …" en `WXI.drop` "Water: 52 l" (sensor `<washer>_waterverbruik`/`_water_consumption`, anders de fase met `WXI.wave`). Achtergrond `WFAB` (zachte stofplooien rechtsboven, met mask), bellen alleen bovenin het midden. Testpagina `was=2` (met waterverbruik). v362: exacter naar het ontwerp: kaart 104 px hoog, radius 16, rand `rgba(120,160,230,.32)`, alles absoluut geplaatst (icoon 46 px links, tekst vanaf 77 px, balk 8 px onderaan tot 138 px van rechts, scheidingslijn 124 px van rechts vanaf 42 px, rechterkolom 112 px); geen bewegende bellen meer maar vaste glanzende bellen en stofplooien in `WFAB` (150 × 104, rechts verankerd). v363: achtergrond als in het voorbeeld: een zachte berg stof rechts (166 × 104, geblurde vorm met lichte bulten en plooien), bellen erboven. v364 (gebruiker: "erg rommelig" op de iPhone, tekst over de balk): weer in de normale doorloop (grid: links icoon+tekst met de balk eronder, scheidingslijn, rechterkolom 104 px), geen vaste hoogte; stofplooien weg, alleen een zachte gloed rechtsboven en 3 bellen; ondertitel = programma · temperatuur (zonder "Bezig").
- v365 (telefoon): wasmachinekaart volgens het stijlblad van de gebruiker (vervangt v361–v364): kaart `linear-gradient(135deg, rgba(11,18,32,.92), rgba(15,23,42,.92))` + zachte glow rechtsboven, rand `rgba(59,130,246,.15)`, radius 16, schaduw `0 8px 24px rgba(0,0,0,.25)`, blur 12. Actief (`.wx`): icoon (animatie blijft) in een afgerond vlak (68 px), "Wasmachine" 17 px, groot "39 min" 30 px; rechts achter een lijn een pil met de fase (`#60A5FA` op `rgba(59,130,246,.18)`), programma · temperatuur en klokje "Klaar 19:36"; balk 6 px over de hele breedte (`#3B82F6`→`#60A5FA`). Kleine standen `wxSm` (`.wx.sm`): klaar (groen `#22C55E`, vinkje, balk vol), storing (oranje `#F59E0B`, waarschuwing, "Bekijk details →"), aan (grijs). Geen bellen, stof of waterverbruik meer. Testpagina `was=2|klaar|fout|aan`.
- v336 (telefoon): vaatwasser bezig (`ds === 'run'`) krijgt de klasse `steam` en een laag `.wst` met 5 zachte stoomwolkjes (vaste posities, animatie `wsteam`, in `HPSTYLE`; uit bij `prefers-reduced-motion`). Andere opties (sproeien, golfjes, waterpeil, kringen, lichtrand enz.) zijn getoond; de gebruiker koos stoom. Testpagina `vaat=1`.
- v331 (telefoon, donker): een apparaatkaart met `.done` (was is klaar, vaat klaar) is zacht groen: waas `rgba(79,208,127,.13)` linksboven en rand `rgba(79,208,127,.28)`, in `TIDY` (v337: ook met id-selectors `#dish`/`#oven`/`#was`, anders wint de tegelregel).
- Magnetronstand: het actieve of geselecteerde programma `microwave_*` toont "Magnetron" met een eigen icoon en het vermogen.
- Oven koelt af (uit, ≥ 70° sinds v292, daarvoor 50°), telefoon (v270, ontwerp C): compacte kaart in rustig oranje, "Oven koelt af" met "Uit · koel rond HH:MM" en rechts groot de temperatuur (`.ocs`/`.ocb`, op de computer verborgen; daar blijft de oude opmaak). De tijd komt uit `_ovCoolAt`: afkoelen volgens Newton met de kamertemperatuur (thermostaat, anders 20°) als omgeving, uit de metingen van 30 min (bij openen eenmalig aangevuld uit `history/period`). Te weinig gegevens: "Uit · nog warm". Rood en "Heet" zijn bewust weg: een warme oven is een waarschuwing, geen alarm.

**HomePod (mini)** (v248, alleen telefoon; stijl in `HPSTYLE`, achteraan in de `<style>` van Thuis)

- `_isSpeaker(id)`: `speakers` uit de YAML, anders elke `media_player` met "homepod" in model, apparaatnaam of id (integratie Apple TV). `_speakers()` en `_hpInfo(id)` (titel, artiest, hoes via `entity_picture`/`hassUrl`, voortgang, volume, optimistische afspeelstand `_hpOpt`).
- Thuis (v251): `#hpc` is een tegel (`.tile.mus`, ontwerp A met vage hoes) direct na `#mAf` in de `.mrow`; zolang hij zichtbaar is, krijgt `#mAf` de klasse `hpon` (verborgen, in `_applyHidden`). Luistersessie `_hpSes` (localStorage `thuis-muziek`): nieuwe sessie na > 2 min stilte. Zichtbaar bij afspelen en tot 2 min na pauze/stilte. Wegvegen (`_swipe`/`_hide`) met `dataset.sig` = start van de sessie: weg voor de hele sessie. De afvaltegel heeft bewust geen voorrang (gebruiker).
- v352 (tegel): geen grijze regel meer (artiest/ruimte), alleen de titel; past de titel niet, dan loopt hij van rechts naar links (`.mtt.run`, tekst dubbel + `translateX(-50%)`, eenmalig gemeten zodra de tegel zichtbaar is, uit bij `prefers-reduced-motion`); afspeelknop 48 px. Testpagina `mt=` (titel).
- v353: lopende tekst via `_marq(root)` (klasse `.mqw` met één `<span>`, tussenstuk `<mq-gap>`; geen `<i>`, dat krijgt pil-icoonopmaak). Ook in de HomePod-pil van het kamervenster (max. 250 px breed). Klimaattegel in het kamervenster (`#rmTh`) in hetzelfde ontwerp als Thuis (thermometer, status, Doel; huisje absoluut rechtsboven, getal 36 px).
- Kamers: `speakers` per ruimte in `_areaRooms`/`_rooms`; pil `.ksp.hpp` met `HPICON`, tik opent venster `hp` met `_roomBack`.
- Venster `hp`: `_updHpSheet` (elke seconde via `_hpTimer`), knoppen `media_previous_track`/`media_play_pause`/`media_next_track`, volumeschuif `.hpsl` (uitgezonderd van vegen-sluiten).
- Een HomePod komt vaak als twee mediaspelers binnen. `_spkDedupe` (v249) houdt per apparaatnaam één: die speelt, anders die de meeste mediagegevens heeft. Is het apparaat naar de kamer genoemd, dan toont de pil het model ("HomePod mini").
- Hoes (v253): `_hpArt([bronnen])` laadt eerst op de achtergrond (cache `_hpArtC`), toont pas bij succes, anders `HPICON`. Bronnen: deze speler en de tweede speler (zelfde apparaatnaam). Om en om `Image` en `hass.fetchWithAuth` (blob-URL), tot 20 pogingen. Bij AirPlay vanaf de iPhone levert HA soms geen hoes.
- `entity_picture` van een mediaspeler bevat een token: niet loggen of delen.

**Verjaardagkaart (v359, alleen telefoon)**

- `#bdc` (`.tile.bdc`) in de `.mrow` tussen `#mAf` en `#hpc`. `_updBday()` (vanuit `_drawAgenda` en elke 10 s in `_tick`) zoekt in `this._events` afspraken van vandaag waarvan de titel of de agenda "jarig", "verjaardag", "birthday" of "geburtstag" bevat. Naam = titel zonder die woorden, jaartal, "(40)"/"wordt 40", "'s" en emoji; leeftijd uit een jaartal (19xx/20xx) of getal in de titel. Eén naam: "Jarig vandaag", naam (24 px), "wordt 40"; meer (max. 3): namen onder elkaar (19 px) en "40 · 78 jaar". Taart-icoon `CAKE` (Rounded, eigen verlopen `ck*`), zachte roze gloed en rand (in `TIDY` met `#bdc#bdc…` omdat de tegelregel `:not(#…)` heeft).
- Voorrang: muziek > verjaardag > afval (`_applyHidden`: `#bdc.hpon` als muziek zichtbaar is, `#mAf.hpon` als muziek of verjaardag zichtbaar is). Wegvegen zoals de muziekkaart (`_swipe`/`_hide`, `dataset.sig` = dag + namen: weg voor die dag). Testpagina `bday=1` of `bday=2`.
- v360: de agenda-tegel (`#agTile`) is op de telefoon verborgen (in `TIDY`); `_fetchAgenda` loopt door, want de verjaardagkaart gebruikt `this._events`.

**Wake on LAN** (v271, alleen telefoon; op de computer verborgen via `@media (min-width: 601px)`)

- `_wolList()`: knoppen met `platform: wake_on_lan` (of `wake_on_lan:` in de YAML: lijst van ids of `{button, ping, name, icon}`; `[]` = uit). Ping-sensor (`binary_sensor`, `platform: ping`): de enige in dezelfde ruimte als de knop, anders op gedeelde woorden in naam/id. Naam zonder "wekken/wake/wol" aan het eind.
- Tegels `.lt.wol` achteraan in `#lights` (in `_updLights`, de sleutel bevat de wol-status): uit = grijs "Uit" (of "Wekken" zonder ping), tik = `button.press` en 3 min "Wordt gewekt…" (blauw, `_wolBusy`), ping aan = "Aan" (lichtgroen `#4fd07f`). Tik op een tegel die aan is doet niets; lang indrukken = `_moreInfo` (ping, anders knop).
- Iconen `pc` en `server` in `DRAW` (tonen `on`, `busy`, `off`).
- v272: tekst "Wordt opgestart…" (niet "gewekt"). Tik op de tegel = venster `pc` (`_updPcSheet`), tik op het rondje (`.mi2`) = meteen aanzetten (`_wolWake`). Venster (variant B, gekozen): bovenin kaart Vandaag (balk 0–24 uur, totaal, laatste 3 sessies) uit `history/period` van de Ping-sensor (`_pcHistory`, 7 dagen, cache 5 min of tot de ping verandert); klokje (`#cvHb`) = tijdlijn zoals bij lampen en rolluiken (`_pcLog`, v273): grafiek 24 uur aan/uit, en per dag "Opstarten gevraagd" met wie (logboek van de knop, `_who`), "Aan" met "Opgestart in X s" en "Uit" (Ping-sensor), 7 dagen. Daaronder groot icoon en de aan-knop met exact de stijl van het lampvenster (`.lpw`; licht thema eigen kleuren). Aan = "Uitzetten kan alleen op de … zelf".
- v274: ook in het kamervenster: `_areaRooms` geeft per ruimte `wol` (knoppen in die ruimte; een ruimte met alleen een WoL-knop telt mee), pil `.ksp.wolp` na de HomePod-pil (icoon, naam, Aan/Uit/Wordt opgestart…; aan = groen, opstarten = blauw). Tik = venster `pc` met `_roomBack` (sluiten gaat terug naar de kamer).

**Weerlucht (v342–v344, teruggedraaid in v345)**

- Een lucht bovenin Thuis in de kleur van het weer (met wolken, regen, sneeuw, mist, onweer, sterren), doorlopend tot halverwege, en pillen als glas met amber rand. Op verzoek van de gebruiker helemaal teruggedraaid naar de donkere achtergrond van v341. Niet opnieuw voorstellen zonder dat de gebruiker erom vraagt. De testparameter `wx=` in `test/mock.html` is blijven staan.

**Camera (Thuis)**

- v339: `_camWatch` (elke 10 s in `_tick`) zoekt een `ha-alert` diep in de camerakaart (`_camErr`); bij een fout `_camRestart` (kaart opnieuw maken). 3 fouten binnen 2 min → `_camSnapUntil` 5 min `camera_view: 'auto'` (stilstaande beelden), daarna weer live. Bij terugkomen in de app (`visibilitychange`) ook opnieuw starten. v340: de melding is alleen kort bij het opstarten: `ha-alert` wordt verborgen via `_camFill`, het laatste stilstaande beeld (`entity_picture`) staat als achtergrond van `#camLive`, en herstarten pas na 2 controles op rij met fout (`_camErrN`). v341: nooit herstarten zolang er beeld loopt (`_camPlaying`: een `video` die speelt); bij terugkomen in de app pas na 3 s herstarten als er dan geen beeld is (eerder werd de stream altijd afgebroken, dat maakte het laden traag).

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
- v228 (telefoon en computer): opgewekt vandaag = alleen de ECU-teller (`solar_today`). Sinds v282 via `_todayKwh()`: is de teller lager dan 60% van de opwek uit de 5-minutenmetingen (`_todayPts`, vermogen × 5 min), bijvoorbeeld omdat de ECU na zonsondergang 0 meldt, dan die berekende waarde. De verwachting gaat via `fcPeriods`: oude HA zet de waarde op het einde van de periode (dag begint met 0 bij zonsopkomst), nieuwe HA op het begin (`energy_by_period_start`). Punten in watt, in het midden van de periode, met `s`/`e` als periodegrenzen.
- v223 (telefoon): `Omvormers` toont rechts `#mIst` met het aantal online (`inverters_online`): groen alles, oranje een deel, rood geen, grijs "In rust" als `sun` onder is. Zonder die sensor blijft het pijltje staan.
- v294 (telefoon): `_drawDays` Week = ma t/m zo van deze week, Maand = 1e t/m laatste dag van deze maand (kalender, `cal()`, toekomstige dagen `fut` leeg); gemiddelde alleen over afgelopen dagen. De computer houdt de laatste 30 dagen.
- v293 (telefoon): `_drawToday` loopt na zonsondergang niet meer door tot nu; schaal 4 × een ronde stap; naast "Vandaag" het dagtotaal (`.tdk`, `_todayKwh`). `_drawDays`: alleen vandaag fel (`url(#gbt)`), de beste dag niet meer; de aangetikte staaf wordt fel.
- v222 (telefoon): gele grafiek heet "Vandaag" en toont geen piek (`.pkinfo` verborgen); Opbrengst zonder gemiddeldelijn; bij Week staat de opbrengst boven elke staaf (`.bv`).

**Nu: scène (v276, alleen telefoon, alleen als `photo.dusk` of `photo.night` is ingesteld: klasse `.scn` op `.wrap.znu`)**

- Ontwerp zoals HomeWizard, gekozen in november 2026: tekeningen van de gebruiker voor dag/schemer/nacht (`photo.image`/`dusk`/`night`, zelfde uitsnede), geen labels op het huis. `.mscn` ligt absoluut achter de kop (530 px hoog), de datum is verborgen, de titel blijft. Bovenin `.mtop` Opwek | Zelfvoorzienend (kWh + %), met elk een lange dunne lijn aan de binnenkant; onder het huis `.mscrow` Net en Teruglevering (Kosten bewust weggelaten). De tegel Mijn huis is verborgen.
- `_updScene` (vanuit `_updMob`): fase op `sun.elevation` (≥ 4° dag, > −6° schemer, anders nacht); de tekening is 136% breed en gecentreerd, `photo.ground` (px) ligt op 456 px. De lucht krijgt de kleur van de linkerbovenhoek van de tekening (canvas). Leiding als T zoals HomeWizard (v278): `#mCf1` van links naar het midden en omhoog tot precies de oprit (paars `.in` bij afname), `#mCf3` van het huis naar rechts (groen `.in.exp` bij teruglevering), `speed()` voor de snelheid; glans (de gele lijn langs de regenpijp is in v285 op verzoek weggehaald) over `photo.panels_box`. Dagcijfers: `_fetchGridDay` (5 min) haalt afname/teruglevering van vandaag (5-minuutstatistieken) via `energy/get_prefs` of `grid_import`/`grid_export`; zelfvoorzienend = opwek − teruglevering, % = dat gedeeld door (dat + afname).
- v288: v287 (links/rechts uitgelijnd met hoekige lijntjes) teruggedraaid op verzoek: de lijntjes liepen te ver over het dak. Weer de opzet van v286, met de cijfers 16 px lager (`.mtop` top 86 px, in v289 78 px, geen ruimte onder de waarde), zodat het geheel dichter bij het dak staat en de lijnen erboven stoppen.
- v302–v305: met scène zijn de meters (`.mgauges`) verborgen. Sinds v305 staan bovenin live **Zon** (`#mScOp`) en **Verbruik** (`#mScSelf`, zon + afname − teruglevering), onderin alleen Afname en Teruglevering; Zelfvoorzienend en de dagtotalen bovenin zijn weg (het dagtotaal staat naast Vandaag). Telefoon: na zonsondergang toont de kop van Vandaag "morgen X kWh" in plaats van "verwacht" (`tmrw` in `_drawToday`).
- v286: na zonsondergang (`sun` below_horizon, geen opwek) toont de eerste meter **Morgen verwacht** (kWh, `forecast.tomorrow`, schaal als Opgewekt vandaag) in plaats van Opwekking nu (0 W). Uitleg bij Zelfvoorzienend is afgewezen.
- v284 (keuze B): nog 26 px hoger (scène 394 px, grond op 332 px, `.grid` 312 px, cijfers op 70 px); de dunne lijnen stoppen boven het dak (padding 6 px); 0 W bij Afname of Teruglevering grijs (`b.zero`); (het maantje in de titel uit v284 is in v286 op verzoek weer de zon); zachtere gloed die naar de randen vervaagt. De meter Opgewekt vandaag blijft (Verbruik nu afgewezen).
- v283 (keuze C): huis hoger en compacter: scène 420 px, grond op 358 px, `.grid` 330 px omlaag, cijfers op 96 px. De grondstrook gloeit zacht paars (`.mgnd.imp`) of groen (`.mgnd.exp`).
- v281: compacter (scène 470 px, tekening 120% breed, grond op 408 px), kleinere letters (24/13 px), onder het huis het live vermogen Afname | Teruglevering (W, uit `grid_power`) in plaats van dagtotalen; snelheid 4,5–0,9 s per 200 px naar vermogen. Lagen: `.wrap.scn` heeft `isolation: isolate` en de scène `z-index: -1`; geef `.inner` géén z-index, anders valt de vervaging over het menu onderaan.
- v280: de streepjes lopen met de Web Animations API (`p.animate`, `_an`) op de echte lengte (`getTotalLength`), niet met `pathLength` + CSS-keyframes: dat werkte niet in Safari op de iPhone. Duur uit `speed()`, langer voor langere lijnen.
- v279: de statusbalk (`chromeApply`) krijgt de kleur van de lucht (`_skyColor`, hex) zolang de Nu-kaart met scène verbonden is; daarna weer de themakleur (`BG` blijft de themakleur, `disconnectedCallback` roept `chromeApply` aan). Sinds v306 alleen als de kaart echt zichtbaar is (`getBoundingClientRect().height > 0`), en `_updScene` roept `chromeApply` bij elke update aan.
- v277: lukt een tekening niet (`onerror`), dan de volgende uit night/dusk/image (`_scFail`), anders alleen de lucht in de kleur van de fase; de tekening is onzichtbaar tot hij geladen is.
- De eigen tekeningen (met huisnummer) staan alleen in `/config/www` van de gebruiker, nooit in de repo. Test: `test/mock.html?card=nu&scn=1` (getekend testhuis, `sun=` zonnehoogte).

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
  - effen vensters (`#111827`); apparaatkaarten hebben sinds v297 dezelfde tegelkleur, rand en gloedrand als de andere tegels (`.mstack > .was`, `.kglass.koff`, in `HPSTYLE`), zonder statuskleur; uitzondering sinds v243: het thermostaatvenster (oranje bij verwarmen, anders blauw) en het lampvenster (lampkleur) houden hun eigen kleur;
  - grijze chips en grijze afvallabels;
  - venstertitels en ondertitels **gecentreerd**, de ondertitel grijs;
  - alarmen houden hun rode gloed.
  - Het pulserende rode bolletje bij de camera op de telefoon is weg.
  - Het camerabeeld op Thuis is 196 px hoog (v246, was 220 px).
- **Bewust zo gelaten (november 2026):** de gekleurde chips (Lampen, Rolluiken, Klimaat), de gloedrand van de tegels en de gloed om de profielfoto's blijven. Vlakke tegels en grijze chips zijn als mockup getoond en afgewezen: de gebruiker wil zien wanneer iets actief is. Niet opnieuw voorstellen. v325: pillen hebben een glas-effect (subtiele rand in de eigen kleur, glanslijn, verloop), bovenaan `HPSTYLE`; v326/v327: uit = doorschijnend wit (1–4,5 %, geen schaduw); `var(--c, #ffb547)` als terugval voor pillen zonder eigen kleur. Afgewezen (november 2026, "te 3D"): hetzelfde glas-effect op kamerkaarten, gedimde schakelaarknop, helderheidsbalk als lichtlijn en "4 aan" op de kamerkaart. Niet opnieuw voorstellen. v328: de gloedrand van de tegels is op verzoek van de gebruiker weg (keuze C): zachte rand `rgba(130,170,255,.11)` zonder gloed, hoeken 20 px, binnenruimte 14/16 px, via de constante `TIDY` (achteraan in elke `<style>`, alleen donker en telefoon). Statuskleuren houden hun gloed. v335: kamers (`.kr`), lampen (`.lt`) en rolluiken (`.cv`) die uit staan zijn ~10% lichter (4% wit door `#132036`/`#0f1828`), ook in `TIDY`.
- **Picnic-tekst (v256):** vóór het tijdvak "Verwacht/Vandaag · over X min" (tot het begin), binnen het tijdvak "Onderweg · elk moment". Is er een live-aankomstsensor (v257: `ids.live` in `_picnicIds`, standaard `sensor.picnic_estimated_arrival_of_next_delivery`, tijdstip of minuten), dan "Onderweg · nog X min" (binnen 30 min) en "elk moment" bij < 1,5 min of voorbij. Na bezorgen (v258, `ids.done` = `last_order_delivery_time`, binnen 2 uur vóór het tijdvak of later, vandaag): "Picnic is bezorgd" met het tijdstip, 15 min lang, daarna weg. Sinds v259 ook bezorgd als `last_order_status` afgerond is (`ids.status`, `ids.lslot` gelijk aan het tijdslot); sensoren worden ook op entiteitnaam gevonden.
- **Picnic-kaart (telefoon, v241):** gedempt Picnic-rood (zachte tint, dunne rand, `#ffc2c2` voor Vandaag/Onderweg, balk zonder gloed). Een bezorging is informatie, geen waarschuwing. Sinds v242 icoon 58 px met 22 px afstand tot de tekst.
- **Thermostaattegel (telefoon, v348, ontwerp van de gebruiker):** geen − en + meer (tik = thermostaatvenster). Thermometer (`#mThm`, `RIC` `therm`: blauw via `g-sky` op temperatuur, oranje bij verwarmen, grijs uit) vóór het grote getal, huisje rechtsboven; daaronder status ("Op temperatuur" wit met groen vinkje, "Verwarmt" oranje, "Uit" grijs) en `#mDl` "Doel 18,5°" (uit: naam van de stand). Afvaltegel zonder kopje "Afval". v349: gradenteken groter (26 px), status en Doel dichter op elkaar, afvalinhoud en bak verticaal in het midden. v350: "Doel" lijnt uit met de statustekst achter het icoon (padding 21/20 px). v351: bij "Geen afval" (`.maf.quiet`) de bak weer rechtsboven (44 px), anders viel hij over de tekst.
- **Thermostaattegel (telefoon, v270, vervangen door v348):** bij op temperatuur is de tekst "Op temperatuur · 19°" grijs; alleen het vinkje is groen. Het huisje (stand Thuis) blijft in de huidige kleur (keuze gebruiker).
- **Lamptegels (telefoon, donker, v354, ontwerp L):** klasse `.lb` (niet bij Wake on LAN), Thuis en kamervenster. Grote gloeilamp (`.mi2`, 72 px) absoluut rechts (`right: -12px`, vaste plek dus overal gelijk uitgelijnd), half buiten de tegel; uit = grijze lamp (55%), aan = gele lamp met gloed en een warme gloed in de tegel rechts, sterker met de helderheid (`--k` = brightness/255). Eén kleur voor alle lampen (lampkleur `--lc` niet meer zichtbaar). Tekst: naam + "71%" (warm geel) of "Aan" zonder helderheid. Tik op de lamp = aan/uit (zoals het rondje). In `TIDY`. Varianten A–N en een interactieve mockup zijn getoond; de gebruiker koos L.
- **Bediening (Thuis):** `hide_lights` (v272, ruimer in v275) verbergt lampen op entity-id, naam (ook begin van de naam of een los woord) of ruimte, ook bij een zelf gekozen `lights:`-lijst (`_lightIds` filtert `_lightIds0`). Eigen namen (zoals buitenlampen) horen alleen in de YAML.
- **Kamerkaart:** de temperatuur staat klein en grijs in de statusregel, met een effen thermometer. Bij apparaten staat alleen "Nog xx min". Het aantal lampen staat niet achter de verdiepingen.
- **Teksten:**
  - "Stand-by" alleen als een apparaat niets doet;
  - "Watersensor" met "Geen water gedetecteerd" / "Water gedetecteerd";
  - bij laden "Laden", "Gepauzeerd", "Laden start", "Aangesloten", "Niet aangesloten";
  - knoppen "Laden", "Pauze", "Stop" in een neutrale stijl (de stijl van de thermostaat-stepper), zonder kleur.
- **Stekkerpil:** bij Aan licht alleen het stekkericoon op. Er staat geen tekst "Aan" en er is geen gele gloed. Bij Uit is de pil grijs.
- **v347: standaard weer donker** (na een korte test met glas in v346). Voorkeur voor een nieuw licht thema: "porselein" (lichtgrijze grond, witte kaarten, kleur alleen bij actief), dan bij voorkeur als `automatisch`; nog niet gebouwd.
- **v324: standaard weer donker** (gebruiker: "voorlopig de donkere versie terug"); `applyTheme`: `cfg.theme || 'donker'`. Glas blijft werken met `theme: glas` per kaart; alle glasregels hangen aan `data-gl`, dus donker is pixelgelijk aan v308.
- **Thema `glas` (v309, alleen telefoon):** het ontwerp van de gebruiker (licht glas, zoals Apple Home), 1:1 nagemaakt. `applyTheme` zet bij `theme: glas` zowel `data-th="l"` (de tekstkleuren van `LIGHT`) als `data-gl`; alle glas-opmaak staat bovenaan `HPSTYLE` onder `:host([data-gl])`. Gebruiker koos: glas vervangt donker als standaard, stap voor stap; nu alleen Kamers (`kamers-card` standaard `glas`), Thuis en Energie volgen na een 1:1-mockup. Kamers: lichte lucht, kaarten 69 px (licht aan 89 px, crème), icoon in blauw vlak (uit: blauwgrijs), oranje schakelaar, schuif met witte knop in de kaart, "1 aan", rolluiktekst grijs, chip Lampen crème, actief tabblad lichtblauw. Statusbalk als een glas-kaart zichtbaar is: Thuis `#23466b`, Kamers `#c6d9ee` met donkere balktekst (`--app-header-text-color`) (v314–v316; een vaste strook achter de statusbalk gaf een harde rand en is weer weg; de donkere lucht op Kamers uit v313 is afgewezen). v320: de grijze waas achter klok en batterij op Kamers komt van iOS zelf in de donkere modus van de iPhone (getest: met de iPhone op licht kleurt de balk mee). Vanuit het dashboard niet te beïnvloeden; proeven met `color-scheme`, een `theme-update` naar de app en kleur op HA-elementen (v317–v319) hielpen niet en zijn weggehaald. Niet opnieuw proberen. v310: ook Thuis standaard `glas` (regels onder `:host(thuis-card[data-gl])`): diepblauwe lucht, witte titel, ringen om profielfoto's, glaskaarten, meldingen als één regel `#notSum` (`.nsum`, tik = `.open` met de lijst), witte stepper (v323: thermostaattegel weer in de originele indeling, zonder thermometer `.mthi`; ontwerp met icoonvlakken en statuspil afgewezen). v322: `glas` is nu de standaard op alle kaarten (`applyTheme`: `cfg.theme || 'glas'`); Nu, Energie en Auto krijgen `GLASS2` (achter `LIGHT` in hun `<style>`): lichte lucht, witte glastegels, groepen zonder eigen vlak (let op `backdrop-filter`/pseudo-elementen bij wrappers), Nu-scène met lichte grond en donkere cijfers. Regel van de gebruiker: geen lichte blokken achter groepen apparaten of tegels. Energie in de nieuwe indeling van het ontwerp volgt nog.
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
  - `node test/test.js` doet alles in één keer: `node --check`, controle op vaste coördinaten, de persoonlijke-termencheck en screenshots van 28 views (alle tabbladen op 390 en 1280, muziek, alarm, oven, Wake on LAN en de vensters thermostaat, afval, kamer, HomePod en computer) in `test/out/`. Lint alleen met `--lint`. Een fout in de console telt als fout.
  - `node test/test.js --vergelijk HEAD~1` (git-ref of pad naar een .js) vergelijkt elke view pixel voor pixel met die versie. Bij verschil komen er `<naam>.oud.png` en `<naam>.verschil.png` bij (verschil in rood). Een view die in de oude versie nog niet bestaat (fout bij de actie), heet "nieuw". Gebruik dit vóór elke publicatie: de computerviews moeten "gelijk" zijn bij wijzigingen voor de telefoon.
  - Extra: `--alleen <deel van de naam>` en `--lint`. De klok staat vast op 5 november 2026 12:30, dus screenshots zijn steeds gelijk.
  - `test/mock.html` is de nep-Home Assistant (alleen verzonnen namen). Parameters: `card=thuis|kamers|nu|energie|auto`, `src=` (versie), `th=`, `hp=playing|paused|idle` + `art=1`, `dup=1`, `wt=<bak>0|1`, `ev=<laadpaalmodus>`, `pv=`, `alarm=water|rook`, `lx=`, `oven=koel|aan`, `was=1` (wasmachine bezig; `was=2` met waterverbruik; `was=klaar|fout|aan` andere standen), `mt=` (titel van de muziek), `bday=1|2` (verjaardag(en) vandaag), `vaat=1` (vaatwasser bezig), `tok=1` (thermostaat op temperatuur), `wx=` (weertoestand, bijvoorbeeld `rainy`), `wol=1` (computer uit en server aan, met Ping-sensoren en historie), `hide=` (hide_lights), `scn=1` (scène op Nu; `sun=` zonnehoogte, `scnsrc=` map met eigen tekeningen voor een lokale controle). Het script draait in een eigen scope, omdat de app globale namen als `DAY` heeft.
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
