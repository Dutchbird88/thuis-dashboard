# Thuis Dashboard

Eigen dashboardkaarten voor Home Assistant, in een donkere stijl die lijkt op een iPhone-app. Er is een indeling voor de telefoon (met een tabbalk onderin) en een voor de computer of tablet.

| Kaart | Tabblad | Inhoud |
|---|---|---|
| `custom:thuis-card` | Thuis | aanwezigheid, thermostaat, weer, camera's, verlichting, rolluiken, apparaten, afval, agenda |
| `custom:kamers-card` | Kamers | alle kamers per verdieping, met een kamerpaneel per kamer (alleen op de telefoon) |
| `custom:zonnepanelen-card` | Nu | zonnepanelen, opwek per paneel, energiestroom |
| `custom:verbruik-card` | Energie | stroom, gas en water, verloop, bewaking |
| `custom:auto-card` | Auto | accu, laden, klimaat, banden, locatie |

## Installeren met HACS

1. Ga naar **HACS → ⋮ → Aangepaste repositories**.
2. Vul de URL van deze repository in en kies als type **Dashboard**.
3. Zoek **Thuis Dashboard**, klik op **Downloaden** en herlaad de browser.

HACS voegt de resource zelf toe. Heb je het bestand eerder met de hand in `/config/www/` gezet? Verwijder die oude resource dan bij **Instellingen → Dashboards → ⋮ → Resources**. Anders laadt de kaart twee keer.

## Instellingen

Er zitten geen persoonlijke gegevens in de code. Je eigen entiteiten, personen en kamers zet je in de YAML van je dashboard, bijvoorbeeld:

```yaml
- type: custom:thuis-card
  grid_power: sensor.p1_meter_xxxx_active_power
  persons:
    - entity: person.naam
      name: Naam
      picture: /local/avatar.jpg
  covers:
    - cover.woonkamer
```

Gebruik voor `custom:kamers-card` dezelfde instellingen als voor `thuis-card`.

### Lichte weergave (telefoon)

Op de telefoon kun je kiezen voor een lichte weergave met `theme`:

```yaml
- type: custom:thuis-card
  theme: licht   # donker (standaard), licht of automatisch
```

- `donker` (standaard): de donkere weergave.
- `licht`: lichte achtergrond, doorschijnende tegels en een glazen menubalk. Het thermostaatvenster krijgt een aan/uit-knop.
- `automatisch`: volgt de lichte of donkere stand van je telefoon.

Zonder `theme` is de kaart donker. Wil je licht of automatisch, zet `theme` dan op elke kaart (Thuis, Kamers, Nu, Energie, Auto). Op de computer blijft de app altijd donker.

### HomePod (telefoon)

Heb je een HomePod of HomePod mini in Home Assistant (via de integratie **Apple TV**), dan toont de app die vanzelf:

- op Thuis een muziektegel op de plek van de afvaltegel zolang er muziek speelt, met albumhoes, titel en een pauzeknop. Na 2 minuten pauze of stilte komt de afvaltegel terug. Veeg je de muziektegel weg, dan blijft hij weg tot je na een pauze opnieuw gaat luisteren;
- in het kamervenster een pil voor de HomePod in die ruimte;
- met een tik een venster met vorige, afspelen/pauzeren, volgende en het volume.

De HomePods worden herkend aan het model of de naam. Wil je zelf kiezen welke mediaspelers meedoen:

```yaml
speakers:
  - media_player.homepod
```

### Computers wekken (Wake on LAN, telefoon)

Heb je de integratie **Wake on LAN** ingesteld, dan staat er op Thuis onder Bediening een tegel per computer of server, tussen de lampen:

- **Uit** (grijs): tik om te wekken;
- **Wordt opgestart…** (blauw): de opdracht is verstuurd, tot hij reageert (maximaal 3 minuten);
- **Aan** (groen): de computer is bereikbaar.

Tik op het rondje om meteen aan te zetten. Tik op de tegel voor het detailvenster: bovenin de historie van vandaag (wanneer hij aan was), daaronder de aan-knop. Met het klokje linksboven zie je de afgelopen 7 dagen.

Of een apparaat aanstaat, ziet de app aan een **Ping**-sensor. Voeg die toe via Instellingen → Apparaten en diensten → Integratie toevoegen → Ping (ICMP) en zet hem in dezelfde ruimte als de wekknop. Zonder Ping-sensor staat er "Aanzetten" en is er geen historie. Lang indrukken opent het venster van Home Assistant.

De knoppen worden vanzelf gevonden. Zelf kiezen of koppelen kan ook (`[]` zet de tegels uit):

```yaml
wake_on_lan:
  - button: button.computer_wekken
    ping: binary_sensor.computer_ping   # optioneel
    name: PC                            # optioneel
    icon: pc                            # pc of server
```

### Lampen verbergen onder Bediening

Wil je sommige lampen niet onder Bediening op Thuis zien (bijvoorbeeld buitenlampen), zet ze dan bij `hide_lights`. Een naam of een entity-id mag allebei:

```yaml
hide_lights:
  - Tuin
  - light.schuur
```

### Kamers

De kamers komen vanzelf uit de ruimtes en verdiepingen van Home Assistant (**Instellingen → Ruimtes, labels en zones**). Per ruimte toont de kaart de lampen, rolluiken, temperatuur, apparaten en sensoren van de apparaten in die ruimte. Ruimtes zonder lampen, rolluiken, thermostaat of sensoren worden overgeslagen.

Sensoren in het kamerpaneel: waterlek, rookmelder (ook met status als sensor, zoals Nest Protect), beweging, deur en raam. Bij rook, koolmonoxide of water verschijnt ook een rode melding op het Thuis-scherm.

De verdiepingen staan op volgorde van laag naar hoog (begane grond, eerste, tweede, zolder) met Buiten als laatste. De volgorde van de kamers binnen een verdieping kun je zelf bepalen:

```yaml
  room_order: [Woonkamer, Keuken, Hal, Toilet]
  room_merge:              # optioneel: ruimtes samen tonen als één kamer
    Zolder overloop: Zolder
```

Wil je de kamers liever zelf vastleggen, dan kan dat met een lijst `rooms:`:

```yaml
  rooms:
    - name: Woonkamer
      floor: Begane grond
      icon: sofa          # sofa, pot, door, toilet, bed, bath, desk, stairs, tree, drive, shed, wash
      climate: true       # temperatuur van de thermostaat
      lights: [light.woonkamer]
      covers: [cover.woonkamer]
      apps: [dish]        # was, dish, oven
      temp: sensor.temperatuur_woonkamer
      humidity: sensor.vochtigheid_woonkamer
      sensors: [binary_sensor.waterlek_keuken]
```

Als je een instelling weglaat, zoekt de kaart zelf zoveel mogelijk op: de eerste thermostaat, alle camera's, de Hue-kamers, de afvalsensoren van Afvalbeheer en alle agenda's.

## Versie

De versie staat in de browserconsole: `THUIS-ENERGIE-KAART vNNN`.
