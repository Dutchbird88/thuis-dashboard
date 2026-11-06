# PROGRESS.md — voortgang Thuis Dashboard

*Bijgewerkt: 5 november 2026, versie **v253**.*

## Huidige stand

- **De nieuwste versie is v253** (telefoon: weer standaard donker; licht kan met `theme: licht` of `automatisch`). v214 is door de gebruiker getest en geïnstalleerd via HACS. Alle onderdelen werken en zijn door de gebruiker getest:
  - laden met pauzeren en hervatten;
  - weer;
  - afval;
  - kamers;
  - meldingen;
  - de rustige telefoonstijl.
- De code is nagelopen in v178: ESLint gaf 0 fouten, kamers worden één keer per update berekend en ongebruikte code is weg. `node --check` en lint zijn schoon bij v253.

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
| v221 | Telefoon, pagina Nu: groene grafiek Opbrengst met keuze Week/Maand/Jaar (jaar = 12 maanden uit een jaar dagcijfers, 1x per uur opgehaald); meter Opgewekt vandaag tot 20 kWh; panelen als raster 5×2 in de kleuring van de computer, met Omvormers › om de indeling per dakkant open te klappen. Computer pixelgelijk. |
| v222 | Telefoon, pagina Nu: gele grafiek heet "Vandaag" zonder piekregel (verwacht blijft); Opbrengst zonder gemiddeldelijn; bij Week de opbrengst boven elke staaf en alle dagen als weekdag (geen overlap meer van "Vandaag"). Computer pixelgelijk. |
| v223 | Telefoon, pagina Nu: regel Omvormers toont rechts het aantal online in plaats van het pijltje, met bolletje: groen alles, oranje een deel, rood geen (overdag), grijs "In rust" als de zon onder is. Tik klapt nog steeds de details open. Computer pixelgelijk. |
| v224 | Telefoon, pagina Nu: grafiek Vandaag alleen over het deel van de dag met zon (tot nu en tot het einde van de verwachting); verwachting per uur in het midden van het uur en zonder platte staart na zonsondergang; Opbrengst met strakkere schaal (vier ronde stappen boven de hoogste waarde). Computer pixelgelijk. |
| v225 | Herstel van v224: de verwachtingspunten stonden al in het midden van het uur (`_fetchStats`), v224 schoof ze nog een half uur op, waardoor de stippellijn een uur te laat liep. Nu niet meer verschoven; de lijn begint en eindigt op 0 aan het begin en eind van de uren met zon. |
| v226 | Telefoon, pagina Nu: de grafiek Opbrengst opent standaard op Week in plaats van Maand. |
| v227 | Telefoon, pagina Nu: de meter Opgewekt vandaag loopt tot de beste dag van de afgelopen 30 dagen (incl. vandaag), naar boven afgerond op een even getal (minimaal 4; zonder gegevens 20). |
| v228 | Nu (telefoon én computer): opgewekt vandaag komt alleen nog van de ECU-teller (`solar_today`), zonder eigen schatting uit het vermogen. Verwachting: `fcPeriods` herkent of HA de waarde op het einde (oud, reeks begint met 0 bij zonsopkomst) of het begin van de periode zet, rekent korte periodes om naar watt en zet elk punt in het midden van de periode. Controleren met echte gegevens. |
| v229 | Telefoon, pagina Nu: Mijn huis als stroom zon — huis — net. Rondjes op het midden van het huis, rechte stroomlijnen die het huis in lopen (amber zon→huis, groen huis→net, paars net→huis; snelheid naar vermogen; stil en grijs zonder stroom). Verbruik onder het huis in de kleur van de bron (groen/blauw/paars) met alleen het label "Verbruik". Kleuren van de pagina Energie. Computer pixelgelijk. |
| v230 | Telefoon, Mijn huis: stroomlijnen vaste lengte 50 px en vóór de foto (z-index 2), zodat ze niet meer achter het huis of de boom wegvallen. Foto op het oude formaat. |
| v231 | Telefoon, Mijn huis: stroomlijnen weer achter de foto, maar beginnen direct (3 px) bij de rondjes en zijn langer, zodat ze zichtbaar het huis in lopen. |
| v232 | Telefoon, Mijn huis: het verbruik staat dichter op het label "Verbruik" (kleinere regelhoogte). |
| v233 | Telefoon, Mijn huis: rondjes van zon en net op dezelfde afstand van de rand als titel en status; huis en stromen 8 px hoger, meer ruimte boven het verbruik. Huis even groot. |
| v234 | Telefoon, Mijn huis: ring van 288° om het huis met glans. Amber = aandeel zon in het verbruik, paars = net, dunne groene buitenrand = deel van de opwek dat naar het net gaat; zachte gloed in de kleur van de bron. Verbruik groot boven in de ring, zon en net als glazen labels in de onderhoeken. Stromende lijnen vervallen. Computer pixelgelijk. |
| v235 | Terug naar v233 voor Mijn huis (huis met stroomlijnen zon — huis — net, ronde meters eronder). De ring van v234 paste niet: te druk met de ronde meters eronder. Alternatieven (statusregel, gloed, platte meters) bekeken en niet gekozen. |
| v236 | Lichte weergave voor de telefoon (`theme`: donker/licht/automatisch, onthouden in `thuis-thema`). Zachte pastelachtergrond, doorschijnende tegels (74%), glazen menubalk en vensters, teal voor aan, blauw actief tabblad, ronde witte knoppen, licht blauwgrijze iconen bij uit. Thermostaatvenster: dunne boog blauw → warm, °C en "doel", min/max onder de boog, aan/uit-knop (alleen licht). Energie en Auto houden hun kleuren, donkerder voor leesbaarheid. Computer en donkere telefoon pixelgelijk aan v235. |
| v237 | Lichte weergave is de standaard op de telefoon (zonder `theme` en zonder onthouden keuze). Computer blijft donker. |
| v238 | Geen onthouden thema meer (`thuis-thema` wordt gewist): een oude keuze `automatisch`/`donker` hield de app donker. Elke kaart volgt alleen zijn eigen `theme`, standaard licht. |
| v239 | Licht verbeterd: Picnic-tijd en resttijd apparaten waren wit op wit (inline `color:#fff`), koppen Bediening/Rolluiken/Agenda zwart, geen extra wit vlak achter Bediening, Agenda en camera, statuslabels donkerder (Bezig blauw, Vandaag rood). Bovenste rand (statusbalk, `theme-color` en HA-kleuren) volgt het thema: licht `#f6f7fb`, donker `#0a111d`. |
| v240 | Op verzoek weer standaard donker (de gebruiker kiest voor donker). Lichte weergave blijft beschikbaar met `theme: licht`/`automatisch`. Telefoon zonder `theme` pixelgelijk aan v235. |
| v241 | Telefoon: Picnic-kaart subtieler (optie C): gedempt Picnic-rood, rand `rgba(255,120,120,.14)`, "Vandaag"/"Onderweg" zacht rood `#ffc2c2`, balk zonder gloed. Rood blijft voor alarmen. |
| v242 | Telefoon: Picnic-kaart meer ruimte voor het icoon (optie C): afstand 22 px, icoon 58 px. |
| v243 | Telefoon: thermostaat- en lampvenster weer in eigen kleur (oranje bij verwarmen, blauw anders, lampkleur bij een lamp); de effen `#111827` van v213 geldt nu alleen voor de andere vensters. Ondertitel "Verwarmen" wit op oranje. |
| v244 | Telefoon: tabbalk zonder kleur per tabblad (optie A): actief wit, de andere tabbladen grijzer (`rgba(235,240,248,.55)`). |
| v245 | Telefoon (Nu): meter Opgewekt vandaag kreeg de oranje gloed van de computermeter (`.val`); nu een groene gloed (`#mg2`). |
| v246 | Telefoon (Thuis): camerabeeld 196 px hoog in plaats van 220 px (optie A); een breedbeeld past vrijwel precies. |
| v247 | Vensters omlaag vegen: volgt de vinger direct (geen transitie tijdens het slepen), sluit bij >110 px of een snelle veeg (>24 px en >0,45 px/ms), achtergrond vervaagt mee, glijdt weg bij sluiten. De veeg wordt opgeëist (`preventDefault`, niet-passieve touchmove), zodat de HA-app niet ververst en de pagina eronder niet meeschuift; ook op de donkere achtergrond. |
| v248 | Telefoon: HomePod (mini). Automatisch herkend (`_isSpeaker`: model/naam "homepod", of `speakers:` in de YAML). Thuis: kaart "Nu speelt" (`#hpc`, `_updMedia`; ook kort gepauzeerd tot 30 min, wegvegen met handtekening id+titel). Kamervenster: pil `.ksp.hpp` (eerste pil, grijs bij niets). Venster `hp` (`_updHpSheet`, elke seconde): hoes, titel/artiest, voortgang, vorige/afspelen/volgende, volume (`volume_set` bij loslaten). Nieuw icoon `HPICON` (HomePod mini). Computer ongewijzigd. |
| v249 | HomePod: elke HomePod kwam twee keer voor (twee mediaspelers per apparaat). `_spkDedupe` houdt per apparaatnaam één speler (die speelt, anders de meeste mediagegevens). Is de HomePod naar de kamer genoemd, dan heet de pil "HomePod mini" (het model). |
| v250 | HomePod-kaart op Thuis alleen bij afspelen (gepauzeerd bleef hij staan); na pauzeren met de kaartknop nog 2 min (`_hpKeep`). Wegvegen onthoudt de titel, niet welke speler. Vensters: eerst de richting bepalen; opzij vegen (pillen, scènes) sluit het venster niet meer, sluiten pas bij een duidelijke beweging omlaag (>10 px en 1,5× meer omlaag dan opzij). |
| v251 | Telefoon: muziek als tegel op de plek van de afvaltegel (ontwerp A: vage hoes als achtergrond, hoes, pauzeknop, titel, artiest · kamer, voortgang). Luistersessie (`_hpSes`, localStorage `thuis-muziek`): loopt door zolang de muziek niet langer dan 2 min stilstaat. Tegel zichtbaar bij afspelen en tot 2 min na pauze/stilte; wegvegen verbergt hem voor de hele sessie (handtekening = start van de sessie). Afvaltegel komt terug zodra de muziektegel weg of weggeveegd is (`#mAf.hpon`). Brede kaart "Nu speelt" vervalt. |
| v252 | HomePod-hoes: eerst op de achtergrond laden (`_hpArt`), pas tonen als het lukt (anders het HomePod-icoon, geen kapot plaatje); bij een fout tot 4x opnieuw met oplopende wachttijd. Heeft de spelende speler geen hoes, dan die van de tweede speler van dezelfde HomePod. |
| v253 | HomePod-hoes nog robuuster: alle bronnen (beide spelers van dezelfde HomePod), om en om gewoon laden en ophalen met de eigen inlog (`hass.fetchWithAuth` → blob), tot 20 pogingen (oplopend, hooguit elke 15 s). Bij AirPlay vanaf de iPhone levert HA soms helemaal geen hoes; dan blijft het icoon. |

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
