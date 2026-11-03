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

### Kamers

De kamers komen vanzelf uit de ruimtes en verdiepingen van Home Assistant (**Instellingen → Ruimtes, labels en zones**). Per ruimte toont de kaart de lampen, rolluiken, temperatuur, apparaten en sensoren van de apparaten in die ruimte. Ruimtes zonder lampen, rolluiken, thermostaat of sensoren worden overgeslagen.

Sensoren in het kamerpaneel: waterlek, rookmelder (ook met status als sensor, zoals Nest Protect), beweging, deur en raam. Bij rook, koolmonoxide of water verschijnt ook een rode melding op het Thuis-scherm.

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
