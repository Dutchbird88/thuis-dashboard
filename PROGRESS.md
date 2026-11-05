# PROGRESS.md — voortgang Thuis Dashboard

*Bijgewerkt: 5 november 2026, versie **v220**.*

## Huidige stand

- **De nieuwste versie is v220** (telefoon: nieuwe indeling van de pagina Nu). v214 is door de gebruiker getest en geïnstalleerd via HACS. Alle onderdelen werken en zijn door de gebruiker getest:
  - laden met pauzeren en hervatten;
  - weer;
  - afval;
  - kamers;
  - meldingen;
  - de rustige telefoonstijl.
- De code is nagelopen in v178: ESLint gaf 0 fouten, kamers worden één keer per update berekend en ongebruikte code is weg. `node --check` en lint zijn schoon bij v220.

## Gerealiseerde functies (per tab)

**Thuis**

- Aanwezigheid met kaart en logboek.
- Thermostaat met stepper en geschiedenis.
- Weer:
  - Buienradar, met Met.no als terugval, hele graden, plaats en bron;
  - regen voor de komende 2 uur en een radarkaart.
- Energie nu.
- Camera's met livebeeld.
- Verlichting.
- Rolluiken. In de geschiedenis staat de bron van de beweging: app, gebruiker of automatisering.
- Apparaten:
  - wasmachine, vaatwasser en oven/magnetron;
  - programma en resterende tijd, plus 7 dagen geschiedenis.
- Afval: MORGEN/VANDAAG, een rustige stand als er niets aan de beurt is, en een afvalvenster voor 2 weken.
- Agenda.
- Laadkaart als de auto is aangesloten. Een tik opent het Oprit-paneel.
- Meldingen:
  - rook, CO en water als rode kaart, weg te vegen;
  - entiteiten die ontbreken;
  - een batterij op of onder 5% (rookmelder op of onder 20%).

**Kamers**

- Kamers uit de ruimtes en verdiepingen van HA, met `room_order` en `room_merge`.
- Kamerkaarten met lampen, rolluiken, een grijze temperatuur in de statusregel en apparaten met "Nog xx min".
- Kamerpaneel:
  - sensorpillen voor water, rook en CO, beweging, licht (lux, eigen pil op de telefoon), deur, raam, camera en slimme stekker;
  - apparaten en Stand-by;
  - scènes;
  - geschiedenis.
- Oprit: de laadpaal met de knoppen Laden, Pauze en Stop. Pauze zet de stroom op 0 A en de laadpaal is leidend.

**Nu**

- Zonnepanelen met de opwek per paneel op een foto van het huis.
- Energiestroom.
- Zonvoorspelling.

**Energie**

- Stroom, gas en water: vandaag, verloop, kosten en bewaking.

**Auto**

- Accu, laden met een schuif voor de stroom, klimaat, banden en locatie.
- Verversen: automatisch "Geforceerd ophalen" als de auto aan de laadpaal hangt.

## Versiegeschiedenis (kort)

| Versie | Wijziging |
|---|---|
| ≤ v156 | Losse kaart via `/config/www/` (niet meer in gebruik). |
| v157 | Naar GitHub en HACS. Persoonlijke gegevens uit de code, naar de YAML. |
| v170–v171 | Kamers uit HA-ruimtes en -verdiepingen, `room_order`/`room_merge`. Sensoren in het kamerpaneel. Rode veiligheidsmelding op Thuis. |
| v172–v175 | Rookmelder leest rook én CO. Watersensor-teksten. Kamerkaart rustiger (temperatuur grijs, "Nog xx min"). |
| v176–v177 | Laadkaart op Thuis. Bron in de rolluik-geschiedenis. |
| v178–v180 | Code opgeschoond. Melding bij ontbrekende entiteiten. Batterijmeldingen (5%) met uitzonderingen. |
| v181 | Fix: paneelnummers "undefined". |
| v183 | Sensorpillen, Stand-by-lijst, laadpaal als apparaat bij Oprit. |
| v184–v189, v195–v199 | Laden: laadpaal leidend, pauze via 0 A, hervatten met de BYD-start als terugval, knoppen Laden/Pauze/Stop, stille foutafhandeling. |
| v190–v194 | Weer: Buienradar als standaard, één bron, hele graden, plaats en bron. Opmaak van de laadkaart. |
| v200–v203 | Slimme-stekkerpil, camera-pil met detecties, beweging met lux en temperatuur. |
| v204–v205, v210–v212 | Afval: logica rond 15:00 en MORGEN, rustige stand, afvalvenster voor 2 weken, "Vandaag opgehaald", "Zonder datum". |
| v206 | Telefoon: pulserend camerabolletje weg. |
| v207–v208 | Magnetronstand van de oven. De auto ververst bij openen van de app en tijdens laden. |
| v209 | Bron in de kamergeschiedenis. Geschiedenis van de apparaten. |
| v213–v214 | Rustige telefoonstijl (`CALM`) met effen vensters. Titels gecentreerd. |
| v215 | Namen via `_nm()`: eerst `hass.formatEntityName` (register, HA 2025.10+), dan `friendly_name`, dan apparaat- + entiteitnaam uit het register. Getest: beeld gelijk aan v214, ook zonder `friendly_name`. |
| v216 | Telefoon, kamerpaneel: lux als eigen pil na Beweging ("340 lux" / Donker, Schemerig, Helder, Zonnig; maan onder 10 lux). Computer ongewijzigd. |
| v217 | Telefoon, afvalkaart: label VANDAAG/MORGEN vervangen door bolletje + "Vandaag" (zacht amber) / "Morgen" (zacht blauw). Kopje Afval met het groene recycle-icoon uit `RIC`. Computer ongewijzigd. |
| v218 | Nieuw recycle-icoon in de gevouwen vorm van het officiële symbool (brede banden, ronde vouwen, donkerder groene vouw). Bolletje Vandaag/Morgen met zachte gloed in de eigen kleur, zoals het online-bolletje van de laadpaal; de onbedoelde groene gloed van `.dot` is weg. |
| v219 | Telefoon: horizontaal vegen = vorig/volgend tabblad (linkerrand 30 px blijft voor het HA-menu; op Thuis naar rechts doet niets; op Auto naar rechts = Thuis). Vegen over pillenrijen, camera, wegveegbare kaarten, schuiven, grafieken en vensters telt niet. Tik op het actieve tabblad = terug naar boven. |
| v220 | Telefoon, pagina Nu: tegel Mijn huis (eigen huisfoto, zon/huis/net met stromende bolletjes: amber zon→huis, groen huis→net, blauw net→huis), twee meters Opwekking nu (W, tot `max_power`) en Opgewekt vandaag (kWh, tot de verwachting), dezelfde grafiek en panelen als op de computer (alle panelen even groot). Tik op het huis = foto met panelen als venster. Oude tegels (foto, grote meter, energiestroom, 30 dagen) verborgen op de telefoon. Computer pixelgelijk. |

## Volgende stappen

1. **Gebruiker helpen bij de overgang naar de Marketplace** (HA 2026.11): GitHub koppelen en de repository opnieuw toevoegen als dat nodig is.

## Open ideeën (uitgesteld, alleen na een mockup en akkoord)

- **Energie-pagina vernieuwen.** Het laatste concept: een keuze Dag/Week/Maand/Jaar met chips Stroom/Gas/Water en een gasgrafiek.
- **Rustige stijl ook voor Energie en Auto** op de telefoon (Nu is vernieuwd in v220).
- **Lichte weergave.** De mockup is gemaakt. Het advies is donker te blijven, eventueel automatisch wisselend.
- Een balk "Geen verbinding" als HA niet bereikbaar is.
- Minder beweging, voor `prefers-reduced-motion` en iOS.
- Een knop "Alles uit".
- Een melding als een raam of deur open staat terwijl niemand thuis is.
- Het accupercentage schatten tussen twee keer verversen van de auto.
- De kWh van de sessie op de laadkaart (`sensor.laadpaal_totale_laadsessie`).
- De testpagina met de nep-`hass` (zonder persoonlijke gegevens) bewaren in de repo, bijvoorbeeld in `tools/`. Dat kan alleen in overleg, want het is extra code.

## Punten aan de kant van de gebruiker (geen codewerk)

- De afvalkalender (`calendar.…cyclus`) was *unavailable*. Het afvalvenster valt dan terug op de sensoren per bak.
- Twee rookmelders (Nest Protect) waren *unavailable*.
- Buienradar levert geen verwachting, dus Met.no wordt gebruikt.
- De batterij van een Hue-knop stond op 1%. Hue-knoppen zijn uitgezonderd van meldingen.
- Twee deur- of raamsensoren hebben nog geen ruimte in HA.
- Zet de debug-logging van de Zaptec-integratie weer uit.
- Bij HA 2026.11: koppel GitHub voor de Marketplace.
