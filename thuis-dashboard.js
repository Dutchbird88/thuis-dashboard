/*
 * Zonnepanelen card — custom Lovelace dashboard voor Home Assistant
 * Installatie: zie README.md
 */

const DEFAULTS = {
  title: 'Thuis energie',
  solar_power: 'sensor.ecu_current_power',
  solar_today: 'sensor.ecu_today_energy',
  solar_total: 'sensor.ecu_lifetime_energy',
  inverters_online: 'sensor.ecu_inverters_online',
  grid_power: null,
  // gas en water in de Energiestroom-tegel
  gas_total: null,
  gas_today: 'sensor.gas_vandaag',
  water_flow: null,
  sun: 'sun.sun',
  max_power: 2500,
  panel_max: 420,
  days: 30,
  deviation: 0.25, // paneel wijkt af als het zoveel minder levert dan de mediaan van zijn dakvlak
  // zonvoorspelling (Forecast.Solar, twee dakvlakken); waarden worden opgeteld
  forecast: {
    today: ['sensor.energy_production_today', 'sensor.energy_production_today_2'],
    remaining: ['sensor.energy_production_today_remaining', 'sensor.energy_production_today_remaining_2'],
    tomorrow: ['sensor.energy_production_tomorrow', 'sensor.energy_production_tomorrow_2'],
    peak_tomorrow: 'sensor.power_highest_peak_time_tomorrow',
  },
  advice: false, // tips onder de Energiestroom (wasmachine, grote verbruikers morgen); true = tonen
  flow_style: 'glow', // 'glow' (gloed rondom het huis) of 'line' (lijn langs de dakrand)
  sides: { achter: 'Achterzijde', voor: 'Voorzijde' },
  inverters: [],
  // foto van het huis; polygonen in pixels van de afbeelding
  photo: {
    image: '/local/huis-uitgesneden.png',
    width: 1306,
    height: 1205,
    panels: {
      5: [[333, 82], [436, 78], [451, 138], [351, 140]],
      6: [[440, 78], [543, 74], [561, 132], [454, 138]],
      7: [[548, 73], [651, 70], [673, 129], [564, 132]],
      8: [[352, 144], [456, 140], [474, 201], [369, 207]],
      9: [[460, 140], [565, 136], [583, 197], [478, 201]],
      10: [[569, 135], [675, 131], [697, 191], [588, 197]],
    },
    // statuslijn langs de zijgevel: van de nok tot achter de poort
    flow: {
      // nok → langs de dakrand → hoek van de zijgevel → achter de poort
      path: 'M 290 62 L 207 238 L 214 625',
      top: [290, 62],
    },
  },
};

const HOUR = 36e5;
const DAY = 864e5;

// verwarmt de CV de woning? (Toon: burner_info 1 = verwarmen, 2 = warm water)
const isHeating = (a) => (a?.burner_info != null && a.burner_info !== '' ? String(a.burner_info) === '1' : a?.hvac_action === 'heating');
const fmt = (v, d = 0) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPower = (w) =>
  w == null ? { v: '—', u: 'W' } : Math.abs(w) >= 1000 ? { v: fmt(w / 1000, 2), u: 'kW' } : { v: fmt(w), u: 'W' };
const fmtTime = (t) => new Date(t).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
// sensoren in het kamerpaneel
const SENS_KIND = { moisture: 'leak', smoke: 'smoke', gas: 'smoke', carbon_monoxide: 'smoke', motion: 'motion', occupancy: 'motion', presence: 'motion', door: 'door', window: 'window', opening: 'door', garage_door: 'door', vibration: 'motion' };
const SENS_ORDER = ['leak', 'smoke', 'door', 'window', 'motion'];
const APP_RE = /(wasmachine|vaatwasser|droger|oven|magnetron|koelkast|vriezer|washer|dishwasher|dryer|fridge|freezer|microwave)/i;
const SMOKE_RE = /(rookalarm|smoke_status|smoke_alarm|rookmelder_status)/i, CO_RE = /(co_alarm|co_status|koolmonoxide_status)/i;
const SENS_TXT = {
  leak: { label: 'Waterlekkage-sensor', on: 'Water gedetecteerd', off: 'Geen water gedetecteerd', alarm: true, since: true },
  smoke: { label: 'Rookmelder', on: 'Alarm', off: 'Geen rook', alarm: true, since: true },
  motion: { label: 'Beweging', on: 'Beweging nu', off: 'Geen beweging', last: true },
  door: { label: 'Deur', on: 'Open', off: 'Dicht', since: true },
  window: { label: 'Raam', on: 'Open', off: 'Dicht', since: true },
};
const SENS_ICON = (x) => x.off ? RIC.svg({ leak: 'leak', smoke: 'smoke', motion: 'motionS', door: 'contact', window: 'windowS' }[x.kind], 'off')
  : x.kind === 'leak' ? RIC.svg('leak', x.on ? 'red' : 'on') : x.kind === 'smoke' ? RIC.svg('smoke', x.on ? 'red' : x.warn ? 'orange' : 'on') : x.kind === 'motion' ? RIC.svg('motionS', x.on ? 'yellow' : 'on')
  : RIC.svg(x.kind === 'door' ? 'contact' : 'windowS', x.on ? 'orange' : 'on');
const relTime = (t) => { const m = (Date.now() - t) / 6e4; if (m < 1) return 'zojuist'; if (m < 60) return `${Math.round(m)} min geleden`;
  const d = new Date(t), now = new Date(), day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(), dd = (day(now) - day(d)) / 864e5;
  return dd === 0 ? fmtTime(t) : dd === 1 ? `gisteren ${fmtTime(t)}` : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }); };
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const ts = (v) => (typeof v === 'number' ? v : Date.parse(v));
const niceMax = (v) => {
  v = v * 1.08;
  const e = 10 ** Math.floor(Math.log10(v));
  const f = v / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ===== iconenset (stijl Rounded): één bron voor alle kaarten — RIC.svg(naam, toon), RIC.sym(id, naam) ===== */
const RIC = (() => {
/* ===== Iconenset "Rounded" (variant B): één bron, herbruikbaar via ic(naam, toon) =====
   - raster 100×100, geen lijnen of omtrek, geen schaduw of gloed
   - zachte verlopen met een lichte bovenkant en één kleine highlight
   - apparaten hebben een witte kast met een gekleurd onderdeel; uit = alles gedempt grijs */
const G={ // verlopen: licht → vol → donker
 yellow:['#fff4c2','#ffd04a','#f2a922'], amber:['#ffe2a6','#ffbb4d','#ef9420'], blue:['#cfe4ff','#6aa6f8','#3a78e6'], blueD:['#8fbaff','#4f8ef0','#2f63c8'],
 sky:['#d6efff','#62bdf5','#2a8fe0'], green:['#c6f5d6','#4fd07f','#22a35a'], orange:['#ffe0a3','#ffa53a','#f2731d'], red:['#ffc4b8','#ff7a5c','#e2483a'],
 purple:['#e4dbff','#a995f5','#7a63e0'], purpleL:['#f0ebff','#cbbcff','#a08cf0'], teal:['#c9f6ee','#4fd6c2','#1fa893'],
 white:['#ffffff','#eef2f7','#cdd5e0'], metal:['#e6eaf0','#b9c1cc','#8d97a6'], dark:['#3a4250','#232934','#151a22'], brown:['#d9a77a','#a8703f','#7d4f28'],
 gray:['#a7afbd','#7e8798','#5c6575'], grayL:['#8e97a6','#6c7586','#525b6a'], grayD:['#6f7888','#555e6d','#3f4755'] };
const OFFMAP={white:'grayL',metal:'grayD',dark:'dark'};
let OFF=false, MONO=null; const f=(k)=>`url(#g-${OFF?(OFFMAP[k]||'gray'):MONO?(k==='dark'||k==='metal'||k==='amber'||k==='brown'?'amber':'yellow'):k})`;
const HL=(d,w=5)=>`<path d="${d}" fill="none" stroke="#fff" stroke-opacity="${OFF?.18:.6}" stroke-width="${w}" stroke-linecap="round"/>`;
const DRAW={
 bulb:()=>`<path d="M50 6a32 32 0 0 0-19.5 57.4c3.6 2.9 5.6 6.6 5.6 10.9v1.5h27.8v-1.5c0-4.3 2-8 5.6-10.9A32 32 0 0 0 50 6z" fill="${f('yellow')}"/>${HL('M30 36a21 21 0 0 1 13-17')}<rect x="35" y="78" width="30" height="7.5" rx="3.7" fill="${f('metal')}"/><rect x="38" y="87.5" width="24" height="7" rx="3.5" fill="${f('metal')}"/>`,
 blind:()=>{let s='';for(let y=30;y<=78;y+=12)s+=`<rect x="16" y="${y}" width="68" height="4.2" rx="2.1" fill="#fff" fill-opacity="${OFF?.18:.55}"/>`;
  return `<rect x="14" y="20" width="72" height="68" rx="9" fill="${f('blue')}"/>${s}<rect x="8" y="9" width="84" height="15" rx="7.5" fill="${f('blueD')}"/>${HL('M18 15.5h30',3.5)}`},
 therm:(t)=>`<path d="M38 18a12 12 0 0 1 24 0v44.5a20 20 0 1 1-24 0z" fill="${f('white')}"/><rect x="45" y="${t==='orange'?28:44}" width="10" height="${t==='orange'?44:28}" rx="5" fill="${f(t==='orange'?'orange':'green')}"/><circle cx="50" cy="76" r="12.5" fill="${f(t==='orange'?'orange':'green')}"/>${HL('M43 20v26',4)}`,
 thermostat:(t)=>`<circle cx="50" cy="50" r="42" fill="${f('white')}"/><circle cx="50" cy="50" r="31" fill="${f('dark')}"/><path d="M33 67a24 24 0 1 1 34 0" fill="none" stroke="${f(t==='green'?'green':'orange')}" stroke-width="6.5" stroke-linecap="round"/><text x="50" y="58" font-size="22" font-weight="700" font-family="-apple-system,Roboto,sans-serif" fill="#fff" fill-opacity="${OFF?.5:.95}" text-anchor="middle">20</text>${HL('M22 34a32 32 0 0 1 12-14',4.5)}`,
 flame:()=>`<path d="M50 6c2.6 13.4 24 22.8 24 47a24 24 0 0 1-48 0c0-12.4 6.8-19.8 11.8-24.6.6 8.4 3.8 13.6 8.8 15.8C46.2 32.6 47.6 18 50 6z" fill="${f('orange')}"/><path d="M50 52c1 5.6 9.6 9.4 9.6 18a9.6 9.6 0 0 1-19.2 0c0-4.8 2.6-8 4.6-9.8.3 3.2 1.5 5.4 3.4 6.4-.4-5.2.6-10.8 1.6-14.6z" fill="${f('yellow')}"/>`,
 house:()=>`<path d="M14 44 50 13l36 31v38a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8z" fill="${f('green')}" stroke="${f('green')}" stroke-width="5" stroke-linejoin="round"/><rect x="40" y="58" width="20" height="32" rx="5" fill="${f('white')}"/>${HL('M24 44 48 24',4.5)}`,
 rooms:()=>`<rect x="10" y="10" width="36" height="36" rx="11" fill="${f('amber')}"/><rect x="54" y="10" width="36" height="36" rx="11" fill="${f('yellow')}"/><rect x="10" y="54" width="36" height="36" rx="11" fill="${f('yellow')}"/><rect x="54" y="54" width="36" height="36" rx="11" fill="${f('amber')}"/>${HL('M18 20h14',4)}`,
 bolt:()=>`<path d="M58 6 22 54a3 3 0 0 0 2.4 4.8H45l-6 34c-.4 2.4 2.6 3.6 4 1.7L79 46a3 3 0 0 0-2.4-4.8H56l6-33.4c.4-2.4-2.6-3.6-4-1.8z" fill="${f('purple')}"/>${HL('M50 24 36 44',4)}`,
 sun:()=>`<g fill="${f('orange')}">${[0,45,90,135,180,225,270,315].map(a=>`<rect x="46" y="4" width="8" height="15" rx="4" transform="rotate(${a} 50 50)"/>`).join('')}</g><circle cx="50" cy="50" r="23" fill="${f('orange')}"/>${HL('M38 42a14 14 0 0 1 9-9',4.5)}`,
 cloud:()=>`<path d="M28 80a17 17 0 0 1-2-33.9 25 25 0 0 1 47.6-5.6A19.5 19.5 0 0 1 72 80z" fill="${f('white')}"/>${HL('M24 58a9 9 0 0 1 7-6',4)}`,
 rain:()=>`<path d="M28 64a17 17 0 0 1-2-33.9 25 25 0 0 1 47.6-5.6A19.5 19.5 0 0 1 72 64z" fill="${f('blue')}"/>${HL('M24 43a9 9 0 0 1 7-6',4)}<g fill="${f('sky')}"><path d="M34 72c0 0-5 7-5 10a5 5 0 0 0 10 0c0-3-5-10-5-10z"/><path d="M50 72c0 0-5 7-5 10a5 5 0 0 0 10 0c0-3-5-10-5-10z"/><path d="M66 72c0 0-5 7-5 10a5 5 0 0 0 10 0c0-3-5-10-5-10z"/></g>`,
 partly:()=>`<circle cx="38" cy="36" r="20" fill="${f('orange')}"/><path d="M36 84a15 15 0 0 1-1.6-29.9 22 22 0 0 1 41.8-5A17 17 0 0 1 74 84z" fill="${f('white')}"/>`,
 storm:()=>`<path d="M28 62a17 17 0 0 1-2-33.9 25 25 0 0 1 47.6-5.6A19.5 19.5 0 0 1 72 62z" fill="${f('gray')}"/><path d="M54 56 38 76h12l-4 18 18-24H52z" fill="${f('yellow')}"/>`,
 moon:()=>`<path d="M64 10a40 40 0 1 0 26 54A33 33 0 0 1 64 10z" fill="${f('yellow')}"/>${HL('M30 38a26 26 0 0 1 10-16',4.5)}`,
 recycle:()=>`<path d="M38.8 33.4L42.5 27.0Q50.0 14.0 57.5 27.0L64.9 39.8" fill="none" stroke="${f('green')}" stroke-width="14" stroke-linejoin="round"/><path d="M76.1 59.1L79.7 65.5Q87.2 78.5 72.2 78.5L57.4 78.5" fill="none" stroke="${f('green')}" stroke-width="14" stroke-linejoin="round"/><path d="M35.1 78.5L27.8 78.5Q12.8 78.5 20.3 65.5L27.7 52.7" fill="none" stroke="${f('green')}" stroke-width="14" stroke-linejoin="round"/><path d="M42.5 27.0L42.5 27.0Q50.0 14.0 57.5 27.0L57.5 27.0" fill="none" stroke="#15803d" stroke-opacity="${OFF?0:.42}" stroke-width="14"/><path d="M79.7 65.5L79.7 65.5Q87.2 78.5 72.2 78.5L72.2 78.5" fill="none" stroke="#15803d" stroke-opacity="${OFF?0:.42}" stroke-width="14"/><path d="M27.8 78.5L27.8 78.5Q12.8 78.5 20.3 65.5L20.3 65.5" fill="none" stroke="#15803d" stroke-opacity="${OFF?0:.42}" stroke-width="14"/><path d="M71.6 51.4L52.8 46.8L77.0 32.8Z" fill="${f('green')}" stroke="${f('green')}" stroke-width="2.5" stroke-linejoin="round"/><path d="M44.0 78.5L57.4 64.5L57.4 92.5Z" fill="${f('green')}" stroke="${f('green')}" stroke-width="2.5" stroke-linejoin="round"/><path d="M34.4 41.1L39.8 59.7L15.5 45.7Z" fill="${f('green')}" stroke="${f('green')}" stroke-width="2.5" stroke-linejoin="round"/>`,
 washer:(t,on)=>{const id=`rw${OFF?'o':''}${on||0}`;return `<defs><clipPath id="${id}"><circle cx="50" cy="60" r="19.5"/></clipPath></defs><rect x="15" y="6" width="70" height="88" rx="12" fill="${f('white')}"/><path d="M15 28V18A12 12 0 0 1 27 6h46a12 12 0 0 1 12 12v10z" fill="${f('metal')}" opacity=".7"/><circle cx="27" cy="17" r="3.4" fill="${on?f('green'):'#6b7484'}">${on?'<animate attributeName="opacity" values="1;.3;1" dur="1.6s" repeatCount="indefinite"/>':''}</circle><rect x="48" y="14" width="27" height="6" rx="3" fill="${f('metal')}"/><circle cx="50" cy="60" r="25" fill="${f('metal')}"/><g clip-path="url(#${id})"><circle cx="50" cy="60" r="19.5" fill="${on?f('sky'):f('dark')}"/>${on===1?'<path d="M26 66q6-4 12 0t12 0 12 0 12 0v20H26z" fill="#2a8fe0" opacity=".55"><animateTransform attributeName="transform" type="translate" values="-4 0;4 0;-4 0" dur="1.4s" repeatCount="indefinite"/></path>':''}${on?`<g><animateTransform attributeName="transform" type="rotate" from="0 50 60" to="360 50 60" dur="${on===2?'.45s':'1.6s'}" repeatCount="indefinite"/><ellipse cx="42" cy="52" rx="7" ry="4.5" fill="#ff7a8a"/><ellipse cx="59" cy="58" rx="6" ry="4" fill="#ffd166"/><ellipse cx="49" cy="70" rx="6.5" ry="4" fill="#ffffff" opacity=".85"/></g>`:''}</g>${HL('M36 58a15 15 0 0 1 11-12',4)}${HL('M21 30v52',3)}`;},
 dish:(t,on)=>{const id=`rd${OFF?'o':''}${on?1:0}`;return `<defs><clipPath id="${id}"><rect x="24" y="32" width="52" height="46" rx="8"/></clipPath></defs><rect x="14" y="6" width="72" height="88" rx="12" fill="${f('white')}"/><path d="M14 22V18A12 12 0 0 1 26 6h48a12 12 0 0 1 12 12v4z" fill="${f('metal')}" opacity=".7"/><rect x="22" y="11" width="26" height="6" rx="3" fill="${f('dark')}"/><circle cx="70" cy="14" r="3.2" fill="${on?f('green'):'#6b7484'}">${on?'<animate attributeName="opacity" values="1;.3;1" dur="1.6s" repeatCount="indefinite"/>':''}</circle><rect x="24" y="32" width="52" height="46" rx="8" fill="${on?f('blueD'):f('dark')}"/><g clip-path="url(#${id})">${on?[[34,0],[50,.3],[66,.6],[42,.45],[58,.15]].map(([x,b])=>`<circle cx="${x}" cy="34" r="2" fill="#cfe4ff"><animate attributeName="cy" values="34;80" dur=".9s" begin="${b}s" repeatCount="indefinite"/></circle>`).join(''):''}<g>${on?'<animateTransform attributeName="transform" type="rotate" from="0 50 66" to="360 50 66" dur="1.4s" repeatCount="indefinite"/>':''}<rect x="30" y="64" width="40" height="4.5" rx="2.2" fill="${f('metal')}"/><circle cx="50" cy="66" r="3.5" fill="${f('white')}"/></g></g><rect x="38" y="83" width="24" height="4" rx="2" fill="${f('metal')}"/>${HL('M19 28v56',3)}`;},
 oven:(t,on)=>`<rect x="10" y="8" width="80" height="84" rx="12" fill="${f('white')}"/><path d="M10 24V20A12 12 0 0 1 22 8h56a12 12 0 0 1 12 12v4z" fill="${f('dark')}"/><rect x="30" y="12" width="26" height="8" rx="2.5" fill="#0d1117"/>${on?'<text x="43" y="18.6" font-size="6.5" font-weight="700" fill="#ffa53a" text-anchor="middle" font-family="sans-serif">180°</text>':''}<circle cx="70" cy="16" r="3.4" fill="${f('metal')}"/><circle cx="80" cy="16" r="3.4" fill="${f('metal')}"/><rect x="18" y="30" width="64" height="50" rx="8" fill="${on?f('orange'):f('dark')}">${on?'<animate attributeName="opacity" values=".8;1;.8" dur="2.2s" repeatCount="indefinite"/>':''}</rect>${on?'<path d="M24 38h52M24 72h52" stroke="#fff3c4" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="5 3"><animate attributeName="stroke-opacity" values=".4;1;.4" dur="1.1s" repeatCount="indefinite"/></path><path d="M38 64c0-6 6-6 6-12M54 64c0-6 6-6 6-12" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"><animateTransform attributeName="transform" type="translate" values="0 4;0 -4" dur="1.8s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values="0;.75;0" dur="1.8s" repeatCount="indefinite"/></path>':''}<rect x="24" y="84" width="52" height="4" rx="2" fill="${f('metal')}"/>${HL('M24 36v14',3.5)}`,
 camera:()=>`<path d="M60 62v18h14" fill="none" stroke="${f('metal')}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><rect x="66" y="72" width="22" height="18" rx="5" fill="${f('metal')}"/><g transform="rotate(16 46 40)"><rect x="12" y="24" width="64" height="32" rx="10" fill="${f('white')}"/><rect x="70" y="29" width="12" height="22" rx="5" fill="${f('metal')}"/><rect x="5" y="28" width="14" height="24" rx="5" fill="${f('dark')}"/><circle cx="12" cy="40" r="5" fill="${f('blue')}"/>${HL('M26 32h34',4)}</g>`,
 car:(t)=>`<path d="M20 50l8-20c2-5 6.5-8 11.5-8h21c5 0 9.5 3 11.5 8l8 20z" fill="${f('white')}"/><path d="M29 47l6.5-16c1.2-3 3.4-4.5 6.5-4.5h16c3.1 0 5.3 1.5 6.5 4.5L71 47z" fill="${f('dark')}"/>${HL('M38 33l14-2',3.5)}<rect x="10" y="46" width="80" height="30" rx="12" fill="${f('white')}"/><rect x="18" y="56" width="14" height="8" rx="4" fill="${t==='teal'?f('yellow'):f('metal')}"/><rect x="68" y="56" width="14" height="8" rx="4" fill="${t==='teal'?f('yellow'):f('metal')}"/><rect x="38" y="64" width="24" height="5" rx="2.5" fill="${f('metal')}"/><rect x="16" y="74" width="15" height="15" rx="5" fill="${f('dark')}"/><rect x="69" y="74" width="15" height="15" rx="5" fill="${f('dark')}"/>${t==='teal'?`<circle cx="80" cy="22" r="14" fill="${f('green')}"/><path d="M82 13l-7 10h6l-2 8 7-10h-6z" fill="#fff"><animate attributeName="opacity" values="1;.4;1" dur="1.6s" repeatCount="indefinite"/></path>`:''}`,
 scene:()=>`<path d="M50 54 90 69 50 84 10 69z" fill="${f('purple')}"/><path d="M50 39 90 54 50 69 10 54z" fill="${f('purpleL')}" opacity=".95"/><path d="M50 22 90 37 50 52 10 37z" fill="${f('purpleL')}"/>${HL('M26 36l20-7',4)}`,
 solar:()=>`<circle cx="80" cy="18" r="12" fill="${f('orange')}"/><path d="M18 36h56a5 5 0 0 1 4.8 3.6l9 31A4 4 0 0 1 84 76H10a4 4 0 0 1-3.8-5.2l7-31A5 5 0 0 1 18 36z" fill="${f('blue')}"/><path d="M8.5 56h80M39 36l-4 40M61 36l4 40" stroke="#fff" stroke-opacity="${OFF?.15:.5}" stroke-width="2.6"/><rect x="42" y="76" width="16" height="12" rx="3" fill="${f('metal')}"/>`,
 plug:()=>`<rect x="34" y="6" width="8" height="22" rx="4" fill="${f('metal')}"/><rect x="58" y="6" width="8" height="22" rx="4" fill="${f('metal')}"/><path d="M24 26h52v16a26 26 0 0 1-52 0z" fill="${f('purple')}"/><rect x="45" y="66" width="10" height="26" rx="5" fill="${f('purple')}"/>${HL('M34 34v8',4.5)}`,
 drop:()=>`<path d="M50 6S22 38 22 60a28 28 0 0 0 56 0C78 38 50 6 50 6z" fill="${f('sky')}"/>${HL('M35 62a15 15 0 0 0 9 13',5)}`,
 gas:()=>`<path d="M50 6c2.6 13.4 24 22.8 24 47a24 24 0 0 1-48 0c0-12.4 6.8-19.8 11.8-24.6.6 8.4 3.8 13.6 8.8 15.8C46.2 32.6 47.6 18 50 6z" fill="${f('red')}"/><path d="M50 52c1 5.6 9.6 9.4 9.6 18a9.6 9.6 0 0 1-19.2 0c0-4.8 2.6-8 4.6-9.8.3 3.2 1.5 5.4 3.4 6.4-.4-5.2.6-10.8 1.6-14.6z" fill="${f('orange')}"/>`,
 bin:(t)=>{const c=t==='gray'?'gray':t||'green';return `<path d="M27 27h46l-4.4 57a6 6 0 0 1-6 5.5H37.4a6 6 0 0 1-6-5.5z" fill="${f(c)}"/><path d="M33 36l2.4 46M67 36l-2.4 46" stroke="#000" stroke-opacity=".13" stroke-width="3.5" stroke-linecap="round"/><rect x="40" y="40" width="20" height="10" rx="3.5" fill="#fff" fill-opacity="${OFF?.12:.35}"/><path d="M21 18a5 5 0 0 1 5-5h48a5 5 0 0 1 5 5v7a3 3 0 0 1-3 3H24a3 3 0 0 1-3-3z" fill="${f(c)}"/><path d="M25 18h50" stroke="#fff" stroke-opacity="${OFF?.15:.5}" stroke-width="3" stroke-linecap="round"/><rect x="66" y="5" width="13" height="8" rx="3" fill="${f('dark')}"/><circle cx="35" cy="90" r="6" fill="${f('dark')}"/><circle cx="65" cy="90" r="6" fill="${f('dark')}"/>`;},
 sofa:()=>`<path d="M24 22h52a10 10 0 0 1 10 10v12a11 11 0 0 0-13 10.6V56H27v-1.4A11 11 0 0 0 14 44V32a10 10 0 0 1 10-10z" fill="${f('amber')}"/><path d="M5 54a9 9 0 0 1 18 0v6h54v-6a9 9 0 0 1 18 0v20a6 6 0 0 1-6 6H11a6 6 0 0 1-6-6z" fill="${f('yellow')}"/><rect x="14" y="78" width="9" height="12" rx="4" fill="${f('metal')}"/><rect x="77" y="78" width="9" height="12" rx="4" fill="${f('metal')}"/>${HL('M24 32h24',4)}`,
 pot:()=>`<path d="M8 40h84v6h-6v18a20 20 0 0 1-20 20H34a20 20 0 0 1-20-20V46H8z" fill="${f('yellow')}"/><g fill="none" stroke="${f('metal')}" stroke-width="5" stroke-linecap="round"><path d="M36 12c4 4 4 9 0 13M50 9c4 4 4 10 0 15M64 12c4 4 4 9 0 13"/></g>${HL('M26 54v10',5)}`,
 bed:()=>`<rect x="8" y="22" width="10" height="66" rx="5" fill="${f('metal')}"/><rect x="22" y="38" width="24" height="16" rx="7" fill="${f('white')}"/><path d="M50 38h28a14 14 0 0 1 14 14v4H50z" fill="${f('amber')}"/><rect x="8" y="56" width="84" height="20" rx="7" fill="${f('yellow')}"/><rect x="82" y="70" width="10" height="18" rx="5" fill="${f('metal')}"/>`,
 bath:()=>`<path d="M24 46V24a10 10 0 0 1 18-6" fill="none" stroke="${f('metal')}" stroke-width="7" stroke-linecap="round"/><path d="M6 48h88v8a26 26 0 0 1-26 26H32A26 26 0 0 1 6 56z" fill="${f('sky')}"/><rect x="24" y="78" width="9" height="12" rx="4" fill="${f('metal')}"/><rect x="67" y="78" width="9" height="12" rx="4" fill="${f('metal')}"/>${HL('M18 60a12 12 0 0 0 8 8',4.5)}`,
 door:()=>`<rect x="22" y="8" width="56" height="80" rx="9" fill="${f('amber')}"/><rect x="12" y="84" width="76" height="8" rx="4" fill="${f('metal')}"/><circle cx="66" cy="50" r="5" fill="${f('white')}"/>${HL('M32 18v22',5)}`,
 tree:()=>`<rect x="44" y="58" width="12" height="34" rx="5" fill="${f('brown')}"/><path d="M50 6c17 0 30 13 30 30 0 15-11 27-26 29.6h-8C31 63 20 51 20 36 20 19 33 6 50 6z" fill="${f('green')}"/>${HL('M32 30a18 18 0 0 1 12-12',5)}`,
 person:()=>`<circle cx="50" cy="32" r="18" fill="${f('green')}"/><path d="M14 86c0-17 16-28 36-28s36 11 36 28a5 5 0 0 1-5 5H19a5 5 0 0 1-5-5z" fill="${f('green')}" opacity=".75"/>${HL('M40 24a10 10 0 0 1 7-5',4)}`,
 battery:(t,p=78)=>`<rect x="8" y="26" width="76" height="48" rx="13" fill="${f('white')}"/><rect x="86" y="40" width="8" height="20" rx="4" fill="${f('metal')}"/><rect x="15" y="33" width="${(62*p/100).toFixed(1)}" height="34" rx="8" fill="${f(p<25?'orange':'green')}"/>`,
};
Object.assign(DRAW, {
 leaf:()=>`<path d="M84 10C46 10 16 28 16 60c0 7 2 13 5.5 18L12 87.5l5 5 9.5-9.5c5 3.5 11 5.5 18 5.5 32 0 46-32 39.5-78.5z" fill="${f('green')}"/><path d="M28 80c12-20 28-34 48-48" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>`,
 roomsHouse:()=>`<path d="M10 46 50 12l40 34v38a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8z" fill="${f('white')}" stroke="${f('white')}" stroke-width="5" stroke-linejoin="round"/><rect x="22" y="48" width="24" height="18" rx="4" fill="${f('yellow')}"/><rect x="54" y="48" width="24" height="18" rx="4" fill="${f('amber')}"/><rect x="22" y="72" width="24" height="16" rx="4" fill="${f('amber')}"/><rect x="54" y="72" width="24" height="16" rx="4" fill="${f('yellow')}"/>${HL('M22 44 46 24',4)}`,
 sofaP:()=>DRAW.sofa().replace(/url\(#g-amber\)/g, 'url(#g-purple)').replace(/url\(#g-yellow\)/g, 'url(#g-purpleL)'),
 gauge:()=>`<circle cx="50" cy="52" r="42" fill="${f('white')}"/><path d="M22 66a30 30 0 0 1 40-38" fill="none" stroke="${f('green')}" stroke-width="9" stroke-linecap="round"/><path d="M68 32a30 30 0 0 1 10 34" fill="none" stroke="${f('orange')}" stroke-width="9" stroke-linecap="round"/><path d="M50 58 36 38" stroke="${f('dark')}" stroke-width="6.5" stroke-linecap="round"/><circle cx="50" cy="58" r="7.5" fill="${f('dark')}"/>`,
 pylon:(t)=>`<g fill="none" stroke="${f(t==='green'?'green':'metal')}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M50 6 32 92M50 6l18 86M20 26h60M27 46h46M38 46l26 30M62 46 36 76"/></g><g fill="${f('sky')}"><circle cx="20" cy="31" r="5"/><circle cx="80" cy="31" r="5"/><circle cx="27" cy="51" r="5"/><circle cx="73" cy="51" r="5"/></g>`,
 cal:()=>`<rect x="12" y="16" width="76" height="74" rx="14" fill="${f('white')}"/><path d="M12 30a14 14 0 0 1 14-14h48a14 14 0 0 1 14 14v6H12z" fill="${f('red')}"/><rect x="30" y="8" width="8" height="16" rx="4" fill="${f('metal')}"/><rect x="62" y="8" width="8" height="16" rx="4" fill="${f('metal')}"/><g fill="${f('metal')}"><rect x="26" y="48" width="12" height="10" rx="3"/><rect x="44" y="48" width="12" height="10" rx="3"/><rect x="62" y="48" width="12" height="10" rx="3"/><rect x="26" y="66" width="12" height="10" rx="3"/><rect x="44" y="66" width="12" height="10" rx="3"/></g>`,
 clock:()=>`<circle cx="50" cy="50" r="42" fill="${f('white')}"/><path d="M50 24v28l17 10" fill="none" stroke="${f('blueD')}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="50" cy="52" r="5" fill="${f('blueD')}"/>${HL('M24 36a30 30 0 0 1 12-14',4.5)}`,
 snow:()=>`<path d="M28 62a17 17 0 0 1-2-33.9 25 25 0 0 1 47.6-5.6A19.5 19.5 0 0 1 72 62z" fill="${f('white')}"/><g fill="${f('sky')}"><circle cx="34" cy="76" r="5.5"/><circle cx="50" cy="86" r="5.5"/><circle cx="66" cy="76" r="5.5"/></g>`,
 hail:()=>`<path d="M28 62a17 17 0 0 1-2-33.9 25 25 0 0 1 47.6-5.6A19.5 19.5 0 0 1 72 62z" fill="${f('gray')}"/><g fill="${f('white')}"><circle cx="34" cy="76" r="6"/><circle cx="50" cy="87" r="6"/><circle cx="66" cy="76" r="6"/></g>`,
 wind:()=>`<g fill="none" stroke-linecap="round" stroke-width="8"><path d="M10 40h52a12 12 0 1 0-12-12" stroke="${f('sky')}"/><path d="M10 58h66a12 12 0 1 1-12 12" stroke="${f('blue')}"/><path d="M18 76h22" stroke="${f('sky')}"/></g>`,
 fog:()=>`<path d="M28 56a17 17 0 0 1-2-33.9 25 25 0 0 1 47.6-5.6A19.5 19.5 0 0 1 72 56z" fill="${f('white')}"/><g stroke="${f('gray')}" stroke-width="7" stroke-linecap="round"><path d="M16 70h68M26 84h48"/></g>`,
 toilet:()=>`<rect x="20" y="8" width="26" height="36" rx="7" fill="${f('white')}"/><path d="M12 44h76v6a30 30 0 0 1-22 29v11H34V79A30 30 0 0 1 12 50z" fill="${f('sky')}"/>${HL('M26 14v18',4)}`,
 desk:()=>`<rect x="8" y="10" width="84" height="56" rx="10" fill="${f('blue')}"/><rect x="40" y="64" width="20" height="16" fill="${f('metal')}"/><rect x="26" y="80" width="48" height="9" rx="4.5" fill="${f('metal')}"/>${HL('M20 22h24',4.5)}`,
 stairs:()=>`<g fill="${f('amber')}"><rect x="10" y="66" width="80" height="24" rx="5"/><rect x="30" y="46" width="60" height="44" rx="5"/><rect x="50" y="26" width="40" height="64" rx="5"/><rect x="70" y="8" width="20" height="82" rx="5"/></g>${HL('M74 14v8',4)}`,
 shed:()=>`<path d="M10 42 50 12l40 30v42a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6z" fill="${f('amber')}" stroke="${f('amber')}" stroke-width="4" stroke-linejoin="round"/><rect x="34" y="54" width="32" height="36" rx="4" fill="${f('brown')}"/><path d="M34 54l32 36M66 54 34 90" stroke="#fff" stroke-opacity=".3" stroke-width="3"/>`,
 micro:(t,mode,disp)=>{const run=mode==='run',done=mode==='hot',id=`mwg${OFF?'o':''}`;return `<defs><radialGradient id="${id}" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#fff3c4" stop-opacity=".85"/><stop offset="1" stop-color="#ffa53a" stop-opacity=".25"/></radialGradient></defs><rect x="6" y="20" width="88" height="62" rx="12" fill="${f('dark')}"/><rect x="6" y="20" width="88" height="62" rx="12" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2"/><rect x="12" y="26" width="60" height="50" rx="8" fill="${run||done?'#ffcf7a':'#0d1117'}" opacity="${run?.9:done?.45:1}">${run?'<animate attributeName="opacity" values=".75;.95;.75" dur="1.8s" repeatCount="indefinite"/>':''}</rect>${run?`<rect x="12" y="26" width="60" height="50" rx="8" fill="url(#${id})"/>`:''}<ellipse cx="42" cy="66" rx="20" ry="4.5" fill="#000" opacity=".22"/><g>${run?'<animateTransform attributeName="transform" type="translate" values="-6 0;6 0;-6 0" dur="3.2s" repeatCount="indefinite"/>':''}<path d="M34 65c0-7 3.5-10 8-10s8 3 8 10z" fill="${f('white')}"/></g><rect x="76" y="28" width="13" height="8" rx="2.5" fill="#05070a"/>${disp?`<text x="82.5" y="34.2" font-size="5.6" font-weight="700" fill="#5ee1d0" text-anchor="middle" font-family="sans-serif">${disp}</text>`:''}<circle cx="82.5" cy="49" r="5.5" fill="${f('metal')}"/><circle cx="82.5" cy="64" r="3.2" fill="${f('metal')}"/>`;},
 ovenX:(t,mode,temp)=>{const run=mode==='run',hot=mode==='hot';return `<rect x="10" y="8" width="80" height="84" rx="12" fill="${f('white')}"/><path d="M10 24V20A12 12 0 0 1 22 8h56a12 12 0 0 1 12 12v4z" fill="${f('dark')}"/><rect x="30" y="12" width="26" height="8" rx="2.5" fill="#0d1117"/>${temp!=null?`<text x="43" y="18.6" font-size="6.5" font-weight="700" fill="${run||hot?'#ffa53a':'#8a909a'}" text-anchor="middle" font-family="sans-serif">${Math.round(temp)}°</text>`:''}<circle cx="70" cy="16" r="3.4" fill="${f('metal')}"/><circle cx="80" cy="16" r="3.4" fill="${f('metal')}"/><rect x="18" y="30" width="64" height="50" rx="8" fill="${run||hot?f('orange'):f('dark')}" opacity="${hot?.8:1}">${run?'<animate attributeName="opacity" values=".8;1;.8" dur="2.2s" repeatCount="indefinite"/>':''}</rect>${run?'<path d="M24 38h52M24 72h52" stroke="#fff3c4" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="5 3"><animate attributeName="stroke-opacity" values=".4;1;.4" dur="1.1s" repeatCount="indefinite"/></path><path d="M38 64c0-6 6-6 6-12M54 64c0-6 6-6 6-12" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"><animateTransform attributeName="transform" type="translate" values="0 4;0 -4" dur="1.8s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values="0;.75;0" dur="1.8s" repeatCount="indefinite"/></path>':''}<rect x="24" y="84" width="52" height="4" rx="2" fill="${f('metal')}"/>${HL('M24 36v14',3.5)}`;},
});
Object.assign(DRAW, {
 leak:(t)=>`<path d="M50 6S22 38 22 60a28 28 0 0 0 56 0C78 38 50 6 50 6z" fill="${f(t==='red'?'red':'sky')}"/>${HL('M35 62a15 15 0 0 0 9 13',5)}`,
 motionS:(t)=>{const c=t==='yellow'?'yellow':'white';return `<circle cx="57" cy="14" r="10.5" fill="${f(c)}"/><g fill="none" stroke="${f(c)}" stroke-linecap="round" stroke-linejoin="round"><path d="M53 32 45 58" stroke-width="17"/><path d="M50 36 37 47l-10-4M55 35l9 13 13 3" stroke-width="9"/><path d="M45 58l12 15-2 19M44 58l-8 17-14 9" stroke-width="11"/></g>${HL('M53 9a6 6 0 0 1 5-2',3.5)}`},
 smoke:(t)=>`<circle cx="50" cy="50" r="42" fill="${f('white')}"/><circle cx="50" cy="50" r="29" fill="${f('metal')}"/><g fill="#000" fill-opacity=".12">${[0,45,90,135,180,225,270,315].map(a=>`<rect x="47.5" y="25" width="5" height="11" rx="2.5" transform="rotate(${a} 50 50)"/>`).join('')}</g><circle cx="50" cy="50" r="9" fill="${f(t==='red'?'red':t==='orange'?'orange':'green')}"/>${HL('M20 40a32 32 0 0 1 14-18',4.5)}`,
 contact:(t)=>t==='orange'?`<rect x="22" y="8" width="56" height="80" rx="9" fill="${f('dark')}"/><path d="M22 14a6 6 0 0 1 7.4-5.8L62 15.6a6 6 0 0 1 4.6 5.8v57.2a6 6 0 0 1-4.6 5.8L29.4 91.8A6 6 0 0 1 22 86z" fill="${f('orange')}"/><circle cx="56" cy="52" r="4.5" fill="${f('white')}"/><rect x="12" y="84" width="76" height="8" rx="4" fill="${f('metal')}"/>`:DRAW.door(),
 windowS:(t)=>`<rect x="12" y="8" width="76" height="84" rx="12" fill="${f('white')}"/><rect x="21" y="17" width="25" height="30" rx="5" fill="${f('sky')}"/><rect x="54" y="17" width="25" height="30" rx="5" fill="${f(t==='orange'?'orange':'sky')}"/><rect x="21" y="55" width="25" height="28" rx="5" fill="${f('sky')}"/><rect x="54" y="55" width="25" height="28" rx="5" fill="${f(t==='orange'?'orange':'sky')}"/>${HL('M26 24v12',4)}`,
});
Object.assign(DRAW, {
 attic:()=>`<rect x="20" y="50" width="60" height="40" rx="5" fill="${f('white')}"/><path d="M50 10 92 50H8z" fill="${f('amber')}" stroke="${f('amber')}" stroke-width="8" stroke-linejoin="round"/><circle cx="50" cy="35" r="8.5" fill="${f('yellow')}"/><circle cx="50" cy="35" r="8.5" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.5"/><rect x="42" y="66" width="16" height="24" rx="3" fill="${f('metal')}"/>${HL('M24 42 44 24',4.5)}`,
});
const ROOMICON = { attic: 'attic', sofa: 'sofa', pot: 'pot', door: 'door', toilet: 'toilet', bed: 'bed', bath: 'bath', desk: 'desk', stairs: 'stairs', tree: 'tree', drive: 'car', shed: 'shed', wash: 'washer' };
// tekenen: toon 'off' = gedempt grijs, 'lit' = één warme kleur (kamers die oplichten), anders de eigen kleuren
const draw = (n, t = 'on', ...a) => { OFF = t === 'off'; MONO = t === 'lit'; const s = DRAW[n](t, ...a); OFF = false; MONO = null; return s; };
const grads = Object.entries(G).map(([k, [a, b, c]]) => `<linearGradient id="g-${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`).join('');
const sym = (id, n, t, ...a) => `<symbol id="${id}" viewBox="0 0 100 100">${draw(n, t, ...a)}</symbol>`;
return {
  grads, draw, sym,
  svg: (n, t, ...a) => `<svg class="ri2" viewBox="0 0 100 100">${draw(n, t, ...a)}</svg>`,
  room: (k, lit) => `<svg class="ri2" viewBox="0 0 100 100">${draw(ROOMICON[k] || 'door', lit ? 'lit' : 'off')}</svg>`,
};
})();
const RIC_SYMS = RIC.grads + [
  ['gDrop', 'drop'], ['gFlame', 'flame'], ['gBolt', 'bolt'], ['gSun', 'sun'], ['gPlug', 'plug'], ['gGauge', 'gauge'], ['gHouse', 'house'], ['gPylon', 'pylon'], ['gPylonX', 'pylon', 'green'],
  ['gWash', 'washer', 'on', 0], ['gCal', 'cal'], ['gRooms', 'sofaP'], ['gLeaf', 'leaf'], ['gClock', 'clock'], ['gMoon', 'moon'], ['gBulbOn', 'bulb'], ['gBulbOff', 'bulb', 'off'], ['gTherm', 'therm', 'green'], ['gSolarP', 'solar'],
  ['wSunny', 'sun'], ['wPartly', 'partly'], ['wCloud', 'cloud'], ['wRain', 'rain'], ['wSnow', 'snow'], ['wHail', 'hail'], ['wWind', 'wind'], ['wStorm', 'storm'], ['wStormW', 'storm'], ['wFog', 'fog'], ['wNight', 'moon'],
  ['binGft', 'bin', 'green'], ['binPap', 'bin', 'blue'], ['binPmd', 'bin', 'orange'], ['binRst', 'bin', 'gray'],
].map(([id, n, t = 'on', ...a]) => RIC.sym(id, n, t, ...a)).join('');
// glanzende iconen, gedeeld door de tabbladen Nu en Verbruik
const GLOSSY = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${RIC_SYMS}
  <radialGradient id="dB" cx=".5" cy=".62" r=".6"><stop offset="0" stop-color="#8fe3ff"/><stop offset=".55" stop-color="#4fc0f5"/><stop offset="1" stop-color="#1a86d6"/></radialGradient>
  <linearGradient id="dHi" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".15"/></linearGradient>
  <radialGradient id="fO" cx=".5" cy=".8" r=".8"><stop offset="0" stop-color="#ff9a3c"/><stop offset=".5" stop-color="#ff3d5e"/><stop offset="1" stop-color="#c2093e"/></radialGradient>
  <radialGradient id="fI" cx=".5" cy=".85" r=".7"><stop offset="0" stop-color="#fff8d6"/><stop offset=".6" stop-color="#ffd35c"/><stop offset="1" stop-color="#ff9a3c"/></radialGradient>
  <linearGradient id="bB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9c8ff"/><stop offset=".45" stop-color="#b264ff"/><stop offset="1" stop-color="#6d1fd6"/></linearGradient>
  <radialGradient id="sB" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="#fff4c2"/><stop offset=".5" stop-color="#ffc83d"/><stop offset="1" stop-color="#ff8a1a"/></radialGradient>
  <linearGradient id="pB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9f7de"/><stop offset=".5" stop-color="#3ddc97"/><stop offset="1" stop-color="#11975c"/></linearGradient>
  <linearGradient id="hR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3d6ff"/><stop offset=".5" stop-color="#6b90ff"/><stop offset="1" stop-color="#3554d1"/></linearGradient>
  <linearGradient id="hW" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6f8ff"/><stop offset="1" stop-color="#bccbea"/></linearGradient>
  <linearGradient id="hG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c4"/><stop offset="1" stop-color="#ffbe3d"/></linearGradient>
  <linearGradient id="pyX" gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="80" y2="100"><stop offset="0" stop-color="#d4fbe6"/><stop offset=".5" stop-color="#3ddc97"/><stop offset="1" stop-color="#0f8f55"/></linearGradient>
  <linearGradient id="pyG" gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="80" y2="100"><stop offset="0" stop-color="#eadcff"/><stop offset=".5" stop-color="#a66cff"/><stop offset="1" stop-color="#5d22c4"/></linearGradient>
  <linearGradient id="wB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c3cddd"/></linearGradient>
  <radialGradient id="wW" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#b9ecff"/><stop offset=".6" stop-color="#38bdf8"/><stop offset="1" stop-color="#1572d3"/></radialGradient>
  <linearGradient id="cH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fc0ff"/><stop offset="1" stop-color="#4f73f0"/></linearGradient>
  <radialGradient id="kB" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#ffe7a8"/><stop offset=".55" stop-color="#ffb547"/><stop offset="1" stop-color="#e57b12"/></radialGradient>
</defs></svg>`;
const gl = (id, cls = '') => `<svg class="gl3 ${cls}" viewBox="0 0 100 100"><use href="#${id}"/></svg>`;

// kop gedeeld door beide kaarten: titel, datum, chips en de tabbladen Nu / Verbruik
const NAV = { thuis: 'thuis', kamers: 'kamers', nu: 'pv-installatie', verbruik: 'verbruik', auto: 'auto' };
// glanzend autootje voor de titel van het tabblad Auto
const GCAR = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="cT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9fff6"/><stop offset=".5" stop-color="#5ee1d0"/><stop offset="1" stop-color="#1f9c8c"/></linearGradient>
  <linearGradient id="cG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe3ff"/><stop offset="1" stop-color="#2a5fa8"/></linearGradient>
${RIC.grads}${RIC.sym('gCar', 'car')}</defs></svg>`;
// dichte iconen (in de stijl van Apple SF Symbols) voor tabbladen en thermostaatstanden
const FI = {
leaf:'<path fill-rule="evenodd" d="M20.6 3.2c-9 0-15.6 4.7-15.6 11.8 0 1.6.4 3.1 1.2 4.3L3.9 21.6l1.5 1.5 2.3-2.3c1.2.8 2.8 1.3 4.5 1.3 7.2 0 9.8-7.5 8.4-18.9zM8.4 18.8c2.6-4.6 5.9-7.7 10-10-4.9 1.4-8.6 4.4-11.3 8.7z"/>',
rooms:'<path d="M6 5h12a3 3 0 0 1 3 3v2.6a3 3 0 0 0-3.4 2.9V14H6.4v-.5A3 3 0 0 0 3 10.6V8a3 3 0 0 1 3-3z"/><path d="M.8 13.4a2.4 2.4 0 0 1 4.8 0V15h12.8v-1.6a2.4 2.4 0 0 1 4.8 0V18a1.6 1.6 0 0 1-1.6 1.6H2.4A1.6 1.6 0 0 1 .8 18z"/><rect x="3.6" y="19" width="2.4" height="2.6" rx="1"/><rect x="18" y="19" width="2.4" height="2.6" rx="1"/>',
therm:'<path d="M10 4a2 2 0 1 1 4 0v9.3a4 4 0 1 1-4 0z"/>',
house:'<path d="M12 3.2 2.8 11.1a1 1 0 0 0 1.3 1.5l.9-.8V20a1 1 0 0 0 1 1h4v-5.5h4V21h4a1 1 0 0 0 1-1v-8.2l.9.8a1 1 0 0 0 1.3-1.5z"/>',
sun:'<circle cx="12" cy="12" r="4.6"/><g stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 2.2v2M12 19.8v2M2.2 12h2M19.8 12h2M5.1 5.1l1.4 1.4M17.5 17.5l1.4 1.4M5.1 18.9l1.4-1.4M17.5 6.5l1.4-1.4"/></g>',
bolt:'<path d="M13.6 2 4.4 13.6h6.3L9.8 22l9.8-12.2h-6.4z"/>',
car:'<path fill-rule="evenodd" d="M6.3 6.4A2.2 2.2 0 0 1 8.3 5h7.4a2.2 2.2 0 0 1 2 1.4L19.5 11h.1A1.5 1.5 0 0 1 21 12.5V17a1 1 0 0 1-1 1h-1v1.4a1.6 1.6 0 0 1-3.2 0V18H8.2v1.4a1.6 1.6 0 0 1-3.2 0V18H4a1 1 0 0 1-1-1v-4.5A1.5 1.5 0 0 1 4.4 11h.1zM7 15.6a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6zm10 0a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6zM7.2 9.8h9.6l-1-2.7a.8.8 0 0 0-.7-.5H8.9a.8.8 0 0 0-.7.5z"/>',
flame:'<path d="M12 2c.6 3.4 5.6 5.6 5.6 11.4a5.6 5.6 0 0 1-11.2 0c0-2.9 1.6-4.7 2.8-5.9.1 2 .9 3.3 2.1 3.8C10.8 8 11.2 4.6 12 2z"/>',
moon:'<path d="M20.2 14.7A8.2 8.2 0 0 1 9.3 3.8a8.7 8.7 0 1 0 10.9 10.9z"/>',
door:'<path fill-rule="evenodd" d="M4 4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zm7.2 9.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z"/><path d="M15 11h3.6l-1.5-1.5 1.4-1.4L22.4 12l-3.9 3.9-1.4-1.4 1.5-1.5H15z"/>'};
const fi = (k) => `<svg class="fi" viewBox="0 0 24 24">${FI[k]}</svg>`;
// glazen lens die van de oude naar de nieuwe keuze schuift (Liquid Glass); verdwijnt daarna weer
const glassLens = (bar, from, to, dur = 460) => {
  if (!bar || !from || !to || from === to || !bar.animate) return;
  const L = document.createElement('div');
  L.className = 'lens';
  bar.appendChild(L);
  const bb = bar.getBoundingClientRect(), box = (el) => { const r = el.getBoundingClientRect(); return { left: `${r.left - bb.left}px`, top: `${r.top - bb.top}px`, width: `${r.width}px`, height: `${r.height}px` }; };
  const A = box(from), B = box(to);
  L.animate([{ ...A, opacity: 0, transform: 'scale(1)' }, { opacity: 1, transform: 'scaleX(1.08) scaleY(1.35)', offset: 0.2 }, { opacity: 1, transform: 'scaleX(1.12) scaleY(1.35)', offset: 0.75 }, { ...B, opacity: 0, transform: 'scale(1)' }],
    { duration: dur, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' }).onfinish = () => L.remove();
};
const headerHtml = (active, nav = NAV) => `
  <div class="xhead">
    <div><h1>${{ nu: '<svg class="hi" viewBox="0 0 100 100"><use href="#gSun"/></svg>Zonnepanelen', verbruik: '<svg class="hi" viewBox="0 0 100 100"><use href="#gLeaf"/></svg>Energie', auto: `${GCAR}<svg class="hi" viewBox="0 0 100 100"><use href="#gCar"/></svg>Auto` }[active] || 'Thuis'}</h1><div class="sub" id="date"></div></div>
    ${tabsHtml(active, nav)}
  </div>`;
const tabsHtml = (active, nav = NAV) => `
  <div class="xtabs">
    <button class="${active === 'thuis' ? 'on' : ''}" style="--tc:#7cb6ff" data-nav="${nav.thuis}">${fi('house')}Thuis</button>
    <button class="tk${active === 'kamers' ? ' on' : ''}" style="--tc:#b98bff" data-nav="${nav.kamers || NAV.kamers}">${fi('rooms')}Kamers</button>
    <button class="${active === 'nu' ? 'on' : ''}" style="--tc:var(--sun)" data-nav="${nav.nu}">${fi('sun')}Nu</button>
    <button class="${active === 'verbruik' ? 'on' : ''}" style="--tc:#22d37f" data-nav="${nav.verbruik}">${fi('leaf')}Energie</button>
    <button class="ta${active === 'auto' ? ' on' : ''}" style="--tc:#5ee1d0" data-nav="${nav.auto}">${fi('car')}Auto</button>
  </div>`;
// naar een ander tabblad van hetzelfde dashboard
const bindNav = (root) => { bindSwipe(root); root.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
  if (b.classList.contains('on')) { toTop(root); return; }
  const bar = b.closest('.xtabs'), from = bar?.querySelector('button.on');
  glassLens(bar, from, b);
  from?.classList.remove('on'); b.classList.add('on');
  // HA bewaart elk tabblad; zet de selectie daarna terug, anders staat bij terugkomst het verkeerde tabblad aan
  setTimeout(() => { go(b); setTimeout(() => { b.classList.remove('on'); from?.classList.add('on'); }, 80); }, 260);
})); };
// tik op het actieve tabblad: terug naar boven (zoals in iPhone-apps)
const toTop = (root) => {
  for (let el = root.host; el; el = el.parentNode || el.host) if (el.scrollTop > 0) el.scrollTo({ top: 0, behavior: 'smooth' });
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
// telefoon: horizontaal vegen = vorig of volgend tabblad. De linkerrand (30 px) blijft voor het menu van HA,
// en vegen over iets wat zelf veegt of schuift (kaarten, camera, pillenrijen, schuiven, grafieken, vensters; touch-action none/pan-y) telt niet.
const bindSwipe = (root) => {
  const mq = window.matchMedia('(max-width: 600px)'); let st = null;
  const skip = (e) => e.composedPath().some((el) => el instanceof Element && (el.matches('.sheet, .shv, #camHit, .mpills, .kspills, .kpills, .thumbs, input, [role="slider"]')
    || /^(none|pan-y)$/.test(getComputedStyle(el).touchAction) || (el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(el).overflowX))));
  root.addEventListener('touchstart', (e) => {
    st = null; const t = e.touches[0];
    if (!mq.matches || e.touches.length > 1 || t.clientX < 30 || root.querySelector('.sheet:not([hidden])') || skip(e)) return;
    st = { x: t.clientX, y: t.clientY, t: Date.now(), lock: false };
  }, { passive: true });
  root.addEventListener('touchmove', (e) => { if (st && e.defaultPrevented) st.lock = true; }, { passive: true });
  root.addEventListener('touchend', (e) => {
    const s0 = st; st = null; if (!s0 || s0.lock) return;
    const t = e.changedTouches[0], dx = t.clientX - s0.x, dy = t.clientY - s0.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy) || Date.now() - s0.t > 700) return;
    const all = [...root.querySelectorAll('.xtabs [data-nav]')], tabs = all.filter((b) => b.offsetParent !== null);
    const i = tabs.findIndex((b) => b.classList.contains('on'));
    // tabblad zonder eigen knop op de telefoon (Auto): naar rechts vegen = terug naar Thuis
    const nb = i >= 0 ? tabs[i + (dx < 0 ? 1 : -1)] : dx > 0 && all.some((b) => b.classList.contains('on')) ? tabs[0] : null;
    nb?.click();
  }, { passive: true });
};
const go = (b) => {
  const parts = location.pathname.replace(/\/$/, '').split('/');
  if (Object.values(NAV).includes(parts[parts.length - 1])) parts[parts.length - 1] = b.dataset.nav; else parts.push(b.dataset.nav);
  history.pushState(null, '', parts.join('/'));
  window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
};

const STYLE = `
:host {
  --bg: #0a111d; --tile: #0f1828; --tile2: #132036; --line: rgba(130,170,255,.11);
  --text: #eef1f6; --muted: #8b95a7; --faint: #4f5868;
  --sun: #ffb547; --sun2: #ff7a1a; --home: #7aa7ff; --gas: #ff5d6c; --water: #38bdf8; --imp: #ff7262; --exp: #22d37f; --grid-in: #a855f7;
  display: block;
}
* { box-sizing: border-box; }
.wrap {
  min-height: calc(100vh - var(--header-height, 56px)); color: var(--text); padding: 28px 24px 40px;
  font-family: var(--ha-font-family-body, Roboto, 'Segoe UI', system-ui, sans-serif);
  background:
    radial-gradient(900px 420px at 12% -8%, rgba(255,150,40,.13), transparent 65%),
    radial-gradient(700px 380px at 95% 0%, rgba(90,140,255,.07), transparent 60%),
    var(--bg);
  -webkit-font-smoothing: antialiased;
}
.inner { max-width: 1440px; margin: 0 auto; }
.num { font-variant-numeric: tabular-nums; }

/* header */
.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 22px; }
h1 { margin: 0; font-size: 30px; font-weight: 600; letter-spacing: -.02em; display: flex; align-items: center; gap: 12px; }
h1 svg.hi { width: 36px; height: 36px; overflow: visible; }
h1 svg:not(.hi) { width: 30px; height: 30px; stroke: var(--sun); fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 0 10px rgba(255,170,60,.6)); }
.sub { color: var(--muted); font-size: 14px; margin-top: 6px; }
.xhead { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; margin-bottom: 22px; }
.xhead > .xtabs { justify-self: center; }
@media (max-width: 1100px) { .xhead { grid-template-columns: minmax(0, 1fr); } .xhead > .xtabs { justify-self: start; } }
.xhead .xtabs { margin-bottom: 0; }
.xtabs { position: relative; display: flex; gap: 6px; margin-bottom: 22px; padding: 4px; border-radius: 99px; background: linear-gradient(180deg, rgba(255,255,255,.13), rgba(255,255,255,.06)); border: 1px solid rgba(255,255,255,.18); box-shadow: inset 0 1px 0 rgba(255,255,255,.38), inset 0 -1px 0 rgba(255,255,255,.10), 0 12px 32px rgba(0,0,0,.4); width: max-content; }
.xtabs button { all: unset; position: relative; z-index: 1; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px; border-radius: 99px; font-size: 14px; color: rgba(235,240,248,.82); transition: background .25s, color .25s; }
.xtabs button:hover { color: var(--text); }
.xtabs button svg { width: 17px; height: 17px; fill: currentColor; stroke: none; }
.xtabs button.tk { display: none; }
.xtabs button.on { background: rgba(6,10,24,.38); box-shadow: inset 0 1px 3px rgba(0,0,0,.35); color: var(--tc, #ffb35c); font-weight: 600; cursor: default; }
/* dezelfde glas-look voor schakelaars en knoppen elders */
.go:not(.err) { border-radius: 99px; background: linear-gradient(180deg, rgba(255,255,255,.13), rgba(255,255,255,.05)) !important; border: 1px solid rgba(255,255,255,.18) !important; box-shadow: inset 0 1px 0 rgba(255,255,255,.38), inset 0 -1px 0 rgba(255,255,255,.10), 0 8px 22px rgba(0,0,0,.35); }
.go.busy { opacity: .7; }
.pre { border-radius: 99px !important; background: linear-gradient(180deg, rgba(255,255,255,.11), rgba(255,255,255,.04)) !important; border: 1px solid rgba(255,255,255,.15) !important; box-shadow: inset 0 1px 0 rgba(255,255,255,.3), 0 6px 16px rgba(0,0,0,.3); color: rgba(235,240,248,.88) !important; }
.pre.on { background: rgba(6,10,24,.38) !important; box-shadow: inset 0 1px 3px rgba(0,0,0,.35); color: var(--p) !important; font-weight: 600; }
.lens { position: absolute; z-index: 3; pointer-events: none; border-radius: 99px; opacity: 0; background: radial-gradient(130% 120% at 50% 50%, rgba(255,255,255,.03), rgba(255,255,255,.10));
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.22), inset 0 3px 1.5px -1.5px rgba(255,255,255,.95), inset 0 -3px 2px -1.5px rgba(255,255,255,.45), inset 0 0 22px rgba(255,255,255,.10), 0 10px 26px rgba(0,0,0,.45); }
.lens::before { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 2.5px; filter: blur(.6px);
  background: radial-gradient(circle at 6% 50%, rgba(110,200,255,.95), transparent 14%), radial-gradient(circle at 94% 50%, rgba(110,200,255,.95), transparent 14%), radial-gradient(circle at 18% 6%, rgba(255,130,220,.9), transparent 12%), radial-gradient(circle at 82% 6%, rgba(255,200,120,.9), transparent 12%), radial-gradient(circle at 22% 96%, rgba(170,140,255,.85), transparent 12%), radial-gradient(circle at 78% 96%, rgba(255,130,220,.8), transparent 12%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }
.sub::first-letter { text-transform: uppercase; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--exp); box-shadow: 0 0 8px var(--exp); }
.dot.warn { background: var(--imp); box-shadow: 0 0 8px var(--imp); }
.dot.mid { background: var(--sun); box-shadow: 0 0 8px var(--sun); }
.dot.idle { background: #6b7385; box-shadow: none; }
.pstat { display: inline-flex; align-items: center; gap: 8px; }

/* grid */
.grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; }
.s4 { grid-column: span 4; } .s5 { grid-column: span 5; } .s7 { grid-column: span 7; } .s8 { grid-column: span 8; }
@media (max-width: 1100px) { .s4, .s5, .s7, .s8 { grid-column: span 12; } }
.tile { position: relative; min-width: 0; border-radius: 22px; padding: 20px 22px;
  background: linear-gradient(180deg, var(--tile2), var(--tile)); border: 1px solid rgba(130,170,255,.12);
  box-shadow: 0 1px 0 rgba(255,255,255,.03) inset, 0 20px 40px -24px rgba(0,0,0,.6); }
.th { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 14px; }
.label { font-size: 12px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.aside { font-size: 13px; color: var(--muted); }
.aside b { color: var(--text); font-weight: 600; }
[data-e] { cursor: pointer; }

/* hero */
.hero { display: flex; flex-direction: column; }
.gauge { position: relative; width: 100%; max-width: 296px; margin: 4px auto 0; }
.gauge svg { display: block; width: 100%; overflow: visible; }
.track { fill: none; stroke: rgba(255,255,255,.06); stroke-width: 14; stroke-linecap: round; }
.val { fill: none; stroke: url(#gg); stroke-width: 14; stroke-linecap: round; transition: stroke-dasharray 1s cubic-bezier(.3,.7,.2,1);
  filter: drop-shadow(0 0 10px rgba(255,150,40,.45)); }
.knob { fill: #fff; transition: cx 1s cubic-bezier(.3,.7,.2,1), cy 1s cubic-bezier(.3,.7,.2,1); filter: drop-shadow(0 0 6px rgba(255,200,100,.9)); }
.gtick { font-size: 10px; fill: var(--faint); }
.gcenter { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding-top: 22px; }
.big { font-size: 64px; font-weight: 600; letter-spacing: -.03em; line-height: 1; }
.big span { font-size: 22px; color: var(--muted); font-weight: 500; margin-left: 6px; letter-spacing: 0; }
.pct { margin-top: 8px; font-size: 13px; color: var(--muted); }
.sunl { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 12.5px; color: var(--muted); cursor: pointer; pointer-events: auto; }
.sunl b { color: #cfd5e0; font-weight: 600; }
.sunl svg { width: 15px; height: 15px; fill: none; stroke: var(--sun); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.stats3 { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: auto; padding-top: 18px; border-top: 1px solid var(--line); }
.stats3 .stat { background: none; border: 0; border-radius: 0; padding: 0 14px; border-left: 1px solid var(--line); min-width: 0; }
.stats3 .stat:first-child { padding-left: 0; border-left: 0; }
.stats3 .stat .v { font-size: 24px; }
.stat { padding: 12px 14px; border-radius: 14px; background: rgba(255,255,255,.03); border: 1px solid var(--line); }
.stat .v { font-size: 22px; font-weight: 600; margin-top: 6px; letter-spacing: -.01em; }
.stat .v small { font-size: 12px; color: var(--muted); font-weight: 500; margin-left: 3px; }
.stat .label { font-size: 10.5px; }
.stat .d { font-size: 11.5px; color: var(--muted); margin-top: 4px; }
.fcleg { display: inline-flex; align-items: center; gap: 6px; margin-left: 14px; }
.fcleg i { width: 16px; border-top: 2px dashed rgba(255,226,160,.8); }
.fcbar { height: 4px; border-radius: 99px; background: rgba(255,255,255,.07); overflow: hidden; margin-top: 8px; }
.fcbar i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--sun2), var(--sun)); }

/* flow */
.flow { display: flex; flex-direction: column; }
.flow svg { display: block; width: 100%; height: auto; margin: auto 0; }
.flow .ffoot { margin-top: auto; }
.node { fill: #10141b; stroke-width: 2.5; }
.ic { fill: none; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.nv { font-size: 26px; font-weight: 600; fill: var(--text); letter-spacing: -.02em; }
.nu { font-size: 14px; fill: var(--muted); font-weight: 500; }
.nl { font-size: 12px; fill: var(--muted); letter-spacing: .08em; text-transform: uppercase; font-weight: 600; }
.base { stroke: rgba(255,255,255,.06); stroke-width: 4; stroke-linecap: round; }
.fl { fill: none; stroke-width: 6; stroke-linecap: round; stroke-dasharray: 0 18; animation: flow 1.5s linear infinite; transition: opacity .5s; }
.fl.rev { animation-direction: reverse; }
.fl.off { opacity: 0; }
@keyframes flow { to { stroke-dashoffset: -36; } }
.ffoot { display: flex; flex-direction: column; margin-top: 4px; }
.ffoot .sec { border-top: 1px solid var(--line); padding-top: 16px; margin-top: 16px; }
.ffoot .sec[hidden] { display: none; }
.selfrow { display: flex; justify-content: space-between; align-items: baseline; }
.selfrow .v { font-size: 22px; font-weight: 600; margin: 0; }
.selfrow .v small { font-size: 12px; color: var(--muted); margin-left: 2px; font-weight: 500; }
.ffoot .meter { margin-top: 8px; }
.meter i.self { background: linear-gradient(90deg, #14a86a, #3ddc97); box-shadow: 0 0 8px rgba(61,220,151,.45); }
.ffoot .d { font-size: 12px; color: var(--muted); margin-top: 6px; }
.adv { display: flex; gap: 12px; align-items: flex-start; }
.adv-ic { flex: none; width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center;
  background: color-mix(in srgb, var(--ac) 14%, transparent); border: 1px solid color-mix(in srgb, var(--ac) 40%, transparent); }
.adv-ic svg { width: 28px; height: 28px; overflow: visible; }
.adv-t { font-size: 15px; font-weight: 600; line-height: 1.3; }
.adv-d { font-size: 12.5px; color: #b6bfcd; line-height: 1.45; margin-top: 4px; }
.adv-d b { color: var(--text); }
.tl { margin-top: 14px; }
.tl .cells { display: grid; column-gap: 4px; align-items: end; }
.tl .cell { display: flex; flex-direction: column; justify-content: flex-end; height: 48px; min-width: 0; }
.tl .b { border-radius: 5px; background: rgba(255,255,255,.07); }
.tl .b.g { background: var(--exp); box-shadow: 0 0 10px color-mix(in srgb, var(--exp) 35%, transparent); }
.tl .b.m { background: color-mix(in srgb, var(--exp) 45%, transparent); }
.tl .b.cur { outline: 2px solid #fff; outline-offset: 2px; }
.tl .h { font-size: 10.5px; color: var(--faint); text-align: center; margin-top: 7px; font-variant-numeric: tabular-nums; }
.tl .h.hnow { color: #fff; font-weight: 600; }
.meter { height: 8px; border-radius: 99px; background: rgba(255,255,255,.06); overflow: hidden; margin-top: 10px; }
.meter i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--sun2), var(--sun)); transition: width 1s; }
.status { display: flex; align-items: center; gap: 10px; font-size: 14px; color: #cfd5e0; line-height: 1.35; }
.status b { color: var(--text); }

/* charts */
.chart { position: relative; height: 220px; }
.chart svg { display: block; overflow: visible; }
.gl { stroke: rgba(255,255,255,.05); }
.ax { font-size: 11px; fill: var(--faint); }
.cursor { stroke: rgba(255,255,255,.25); stroke-dasharray: 3 3; opacity: 0; }
.hdot { fill: #fff; opacity: 0; filter: drop-shadow(0 0 6px rgba(255,190,90,.9)); }
.on { opacity: 1 !important; }
.tip { position: absolute; pointer-events: none; transform: translate(-50%, calc(-100% - 12px)); opacity: 0; transition: opacity .15s;
  background: rgba(20,24,32,.95); border: 1px solid rgba(255,255,255,.1); padding: 6px 10px; border-radius: 10px;
  font-size: 12px; color: var(--muted); white-space: nowrap; box-shadow: 0 8px 20px rgba(0,0,0,.4); }
.tip b { color: var(--text); font-size: 13px; margin-right: 6px; }
.bar { transition: opacity .2s; }
.empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--faint); font-size: 13px; }

/* foto */
.s12 { grid-column: span 12; }
.photo { display: flex; flex-direction: column; }
.scene { position: relative; flex: 1; min-height: 250px; margin: 0 -8px;
  background: radial-gradient(55% 50% at 50% 55%, rgba(255,170,80,.13), transparent 72%); }
.scene::before { content: ''; position: absolute; inset: -12% -8%; opacity: 0; transition: opacity 1s;
  background: radial-gradient(58% 56% at 50% 52%, var(--aura, transparent) 0%, color-mix(in srgb, var(--aura, transparent) 45%, transparent) 42%, transparent 76%); }
.scene.glow::before { opacity: .32; animation: aura 3.2s ease-in-out infinite; }
.scene.glow img { animation: rim 3.2s ease-in-out infinite; }
@keyframes aura { 50% { opacity: .18; } }
@keyframes rim {
  0%, 100% { filter: drop-shadow(0 0 3px var(--aura)) drop-shadow(0 0 18px color-mix(in srgb, var(--aura) 70%, transparent)) drop-shadow(0 30px 40px rgba(0,0,0,.45)); }
  50% { filter: drop-shadow(0 0 1px var(--aura)) drop-shadow(0 0 8px color-mix(in srgb, var(--aura) 45%, transparent)) drop-shadow(0 30px 40px rgba(0,0,0,.45)); } }
.fbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; padding: 11px 14px;
  border-radius: 14px; background: rgba(255,255,255,.03); border: 1px solid var(--line); font-size: 14px; }
.fbar .k { display: inline-flex; align-items: center; gap: 10px; color: #cfd5e0; }
.fbar .k i { width: 9px; height: 9px; border-radius: 50%; background: var(--c); box-shadow: 0 0 10px var(--c); }
.fbar .w { font-weight: 600; font-variant-numeric: tabular-nums; color: var(--c); }
.scene img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; filter: drop-shadow(0 30px 40px rgba(0,0,0,.45)); }
.scene svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.scene .hit { cursor: pointer; }
.scene .tip { z-index: 3; }
.pill rect { fill: rgba(16,20,28,.78); } .pill text { fill: #fff; font-weight: 700; }
@media (max-width: 1100px) { .scene { min-height: 0; aspect-ratio: 1305 / 1205; flex: none; } }
@media (max-width: 600px) {

}

/* roof */
.sides { display: grid; grid-template-columns: 2fr 3fr; gap: 28px; }
@media (max-width: 700px) { .sides { grid-template-columns: 1fr; } }
.side h3 { margin: 0 0 12px; font-size: 14px; font-weight: 600; display: flex; justify-content: space-between; color: #cfd5e0; }
.side h3 span { color: var(--muted); font-weight: 500; }
.groups { display: grid; gap: 14px; }
.inv { padding: 8px; border-radius: 14px; background: rgba(255,255,255,.025); border: 1px solid var(--line); cursor: pointer; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.panel { --p: 0; position: relative; aspect-ratio: 1 / 1.12; border-radius: 7px; overflow: hidden;
  background: linear-gradient(170deg, #17243a, #0d1524); border: 1px solid rgba(130,170,255,.16);
  box-shadow: 0 0 calc(var(--p) * 26px) rgba(255,160,40, calc(var(--p) * .55));
  transition: box-shadow 1s, border-color 1s; }
.panel::after { content: ''; position: absolute; inset: 0; opacity: var(--p); transition: opacity 1s;
  background: linear-gradient(165deg, #ffd37a, #ff9a2e 55%, #ff6a1a); }
.panel::before { content: ''; position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background-image: linear-gradient(rgba(255,255,255,.09) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.09) 1px, transparent 1px);
  background-size: 33.34% 16.67%; }
.pn { position: absolute; top: 5px; left: 7px; z-index: 2; font-size: 11px; font-weight: 600; color: rgba(255,255,255,.75); }
.pw { position: absolute; left: 0; right: 0; bottom: 8px; z-index: 2; text-align: center; font-size: 15px; font-weight: 600; color: #fff;
  text-shadow: 0 1px 6px rgba(0,0,0,.6); }
.pw small { font-size: 10px; font-weight: 500; opacity: .8; margin-left: 2px; }
.panel.low { border: 2px solid var(--sun); box-shadow: 0 0 0 3px color-mix(in srgb, var(--sun) 25%, transparent); }
.dev { position: absolute; top: 5px; right: 5px; z-index: 2; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 99px; background: var(--sun); color: #1a1205; }
.invfoot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 9px; padding: 0 2px; font-size: 12px; }
.invfoot b { color: #cfd5e0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.invfoot .t { display: inline-flex; align-items: center; gap: 6px; color: #cfd5e0; font-variant-numeric: tabular-nums; }
.invfoot .tb { flex: none; width: 34px; height: 5px; }
.alert { display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-radius: 14px; margin-bottom: 16px; font-size: 13.5px; line-height: 1.4;
  background: color-mix(in srgb, var(--sun) 9%, transparent); border: 1px solid color-mix(in srgb, var(--sun) 35%, transparent); color: #e9dcc6; }
.alert b { color: #fff; } .alert[hidden] { display: none; }

/* inverters */
.tb { flex: 1; height: 6px; border-radius: 99px; background: rgba(255,255,255,.06); overflow: hidden; }
.tb i { display: block; height: 100%; border-radius: 99px; transition: width 1s, background 1s; }
@media (max-width: 600px) {
  /* telefoon: iets lichtere achtergrond (computer blijft zoals hij is) */
  :host { --bg: #0a111d; }
  /* telefoon: inhoud vervaagt onderaan achter de menubalk (vervagend glas) */
  .wrap::after { content: ''; position: fixed; left: 0; right: 0; bottom: 0; height: 130px; z-index: 29; pointer-events: none;
    -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); background: linear-gradient(180deg, rgba(10,17,29,0), rgba(10,17,29,.55));
    -webkit-mask-image: linear-gradient(180deg, transparent, #000 45%); mask-image: linear-gradient(180deg, transparent, #000 45%); }
  /* telefoon: tabbalk onderin, binnen bereik van de duim */
  .xtabs { position: fixed !important; left: 14px; right: 14px; width: auto !important; justify-self: stretch !important; align-self: auto !important; bottom: calc(6px + env(safe-area-inset-bottom, 0px) / 3); z-index: 30; margin: 0 !important; box-sizing: border-box; display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; padding: 5px; border-radius: 32px;
    background: linear-gradient(180deg, rgba(40,50,72,.62), rgba(22,28,42,.62)); -webkit-backdrop-filter: blur(20px) saturate(1.6); backdrop-filter: blur(20px) saturate(1.6); box-shadow: inset 0 1px 0 rgba(255,255,255,.22), 0 12px 30px rgba(0,0,0,.5); }
  .xtabs button.tk { display: inline-flex; } .xtabs button.ta { display: none; }
  /* telefoon: tabkleuren — Thuis hemelsblauw, Kamers paars (Zon is al geel) */
  .xtabs button { flex-direction: column; justify-content: center; gap: 3px; padding: 7px 2px 6px; font-size: 11px; font-weight: 600; border-radius: 26px; }
  .xtabs button svg { width: 23px; height: 23px; }
  .wrap { padding: 20px 12px calc(92px + env(safe-area-inset-bottom, 0px) / 3); background: radial-gradient(520px 360px at 12% 240px, rgba(255,150,40,.10), transparent 70%), var(--bg); }
  .tile { padding: 16px; border-radius: 18px; }
  h1 { font-size: 26px; }
  .th { flex-wrap: wrap; }
  .nv { font-size: 40px; } .nu { font-size: 22px; } .nl { font-size: 20px; }
  .groups { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  .invfoot { font-size: 11px; } .invfoot b, .invfoot .t { white-space: nowrap; } .invfoot .tb { display: none; }
  .big { font-size: 54px; }
}
/* Nu-pagina op de telefoon: mijn huis, twee meters, grafiek en panelen (computer ongewijzigd) */
.znu .mob, .znu .ml { display: none; }
@media (max-width: 600px) {
  .znu .grid { display: flex; flex-direction: column; gap: 10px; }
  .znu .tile.photo, .znu .tile.hero, .znu .tile.flow { display: none; }
  .znu .dl { display: none !important; } .znu .ml { display: inline; } .znu .seg.ml { display: inline-flex; } .znu .msum.ml { display: block; }
  .znu .seg { gap: 2px; padding: 2px; border-radius: 99px; background: rgba(255,255,255,.04); border: 1px solid rgba(130,170,255,.12); margin-left: auto; }
  .znu .seg button { all: unset; cursor: pointer; font-size: 12px; padding: 4px 11px; border-radius: 99px; color: var(--muted); } .znu .seg button.on { background: rgba(255,255,255,.08); color: var(--text); }
  .znu .pkinfo { display: none; } .znu .bv { fill: #cfd5e0; font-weight: 600; }
  .znu .msum { font-size: 12px; color: var(--muted); margin: -2px 0 6px; } .znu .msum b { color: var(--text); font-weight: 600; }
  .znu .sides { display: none; } .znu.mdet .sides { display: grid; margin-top: 14px; }
  .znu .mpanels.mob { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
  .znu .mpanels .panel { aspect-ratio: auto; height: 50px; border-radius: 9px; }
  .znu .minv.mob { display: flex; justify-content: space-between; align-items: center; margin: 12px -14px -12px; padding: 11px 14px; border-top: 1px solid rgba(130,170,255,.12); font-size: 13px; color: var(--muted); cursor: pointer; }
  .znu .minv .chev { font-size: 17px; transition: transform .2s; } .znu.mdet .minv .chev { transform: rotate(90deg); }
  .znu .minv .ist { display: none; align-items: center; gap: 7px; color: var(--text); font-weight: 500; } .znu .minv.hasst .ist { display: inline-flex; } .znu .minv.hasst .chev { display: none; }
  .znu .ist i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); box-shadow: 0 0 6px var(--c); }
  .znu .ist.g { --c: #3ddc97; } .znu .ist.o { --c: #ffb547; } .znu .ist.r { --c: #ff6b5e; } .znu .ist.n { --c: #6b7385; color: var(--muted); } .znu .ist.n i { box-shadow: none; }
  .znu .mob { display: block; }
  .znu .tile { padding: 12px 14px; }
  .znu .th { margin-bottom: 8px; flex-wrap: nowrap; align-items: center; }
  .znu .th .label { text-transform: none; letter-spacing: 0; font-size: 15px; color: var(--text); }
  .znu .th .aside { font-size: 12px; text-align: right; }
  /* mijn huis: zon — huis — net op één lijn, kleuren zoals op de pagina Energie */
  .znu .mfrow { position: relative; display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; align-items: center; min-height: 150px; margin-top: -8px; }
  .znu .mfs { position: relative; z-index: 2; display: flex; justify-content: center; cursor: pointer; }
  .znu .mnode { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: #18243a; border: 1.5px solid color-mix(in srgb, var(--nc, #6b7385) 55%, transparent); }
  .znu .mnode svg { width: 26px; height: 26px; } .znu .mnode.off { --nc: #6b7385; } .znu .mnode.off svg { filter: grayscale(1); opacity: .5; }
  .znu #mnSun { --nc: var(--sun); } .znu #mnGrid { --nc: var(--grid-in); } .znu #mnGrid.exp { --nc: var(--exp); } .znu #mnSun.off, .znu #mnGrid.off { --nc: #6b7385; }
  .znu .mval { position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%); text-align: center; white-space: nowrap; }
  .znu .mval b, .znu .mhv b { display: block; font-size: 16px; font-weight: 700; } .znu .mval b small, .znu .mhv b small { font-size: 11px; font-weight: 500; color: var(--muted); margin-left: 2px; }
  .znu .mval span, .znu .mhv span { display: block; font-size: 11px; color: var(--muted); margin-top: 1px; }
  .znu .mval b.exp { color: var(--exp); } .znu .mval b.imp { color: var(--grid-in); }
  .znu .mimg { position: relative; z-index: 1; cursor: pointer; } .znu .mimg img { display: block; width: calc(80% - 22px); max-height: 170px; margin: 0 auto; object-fit: contain; filter: drop-shadow(0 14px 22px rgba(0,0,0,.45)); }
  .znu .mhv { text-align: center; margin-top: 12px; } .znu .mhv b { font-size: 22px; line-height: 1.05; color: var(--hc, var(--text)); } .znu .mhv span { margin-top: -1px; }
  /* stroomlijnen: vast spoor met stromende bolletjes (meer vermogen = sneller); naar links als er stroom van het net komt */
  .znu .mln { position: absolute; z-index: 0; top: 50%; height: 3px; margin-top: -1.5px; left: 47px; width: calc((100% - 88px) * .3 + 7px); border-radius: 99px;
    background: radial-gradient(circle, var(--mc, #ffb547) 1.6px, transparent 2.1px) 0 center / 9px 3px repeat-x, rgba(255,255,255,.07); background-size: 0 0, auto; }
  .znu .mln.mlr { left: auto; right: 47px; }
  .znu .mln.on { background-size: 9px 3px, auto; animation: mflow 1s linear infinite; }
  .znu #mc2 { --mc: var(--exp); } .znu #mc2.imp { --mc: var(--grid-in); } .znu .mln.rev { animation-direction: reverse; }
  @keyframes mflow { to { background-position: 9px center, 0 0; } }
  .znu .mgauges { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .znu .mgt { cursor: pointer; } .znu .mgh { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; white-space: nowrap; } .znu .mgh svg { width: 20px; height: 20px; }
  .znu .mgs { display: block; width: 100%; max-width: 150px; margin: 6px auto 0; overflow: visible; }
  .znu .mgs .track { fill: none; stroke: rgba(255,255,255,.07); stroke-width: 16; stroke-linecap: round; }
  .znu .mgs .val { fill: none; stroke-width: 16; stroke-linecap: round; transition: stroke-dasharray .8s; } .znu #mg1 { stroke: url(#mgo); } .znu #mg2 { stroke: url(#mgg); }
  .znu .mknob { fill: #fff; stroke: #ff7a2e; stroke-width: 3; } .znu .mk2 { stroke: #3ddc97; }
  .znu .mgv { fill: var(--text); font-size: 34px; font-weight: 700; letter-spacing: -1px; } .znu .mgu { fill: var(--muted); font-size: 16px; font-weight: 500; letter-spacing: 0; }
  .znu .mgs .gtick { fill: #6f7888; font-size: 15px; }
  .znu .sides { gap: 14px; }
  .znu .side h3 { margin-bottom: 8px; font-size: 13px; }
  .znu .groups { grid-template-columns: repeat(var(--gc), minmax(0, 1fr)) !important; gap: 6px; }
  .znu .inv { padding: 5px; border-radius: 12px; } .znu .pair { gap: 5px; }
  .znu .pw { font-size: 13px; bottom: 6px; } .znu .pn { font-size: 10px; top: 4px; left: 6px; } .znu .dev { font-size: 9px; padding: 1px 5px; top: 4px; right: 4px; }
  .znu .invfoot { font-size: 9.5px; margin-top: 6px; gap: 3px; padding: 0 1px; }
  .znu .alert { padding: 9px 11px; font-size: 12px; margin-bottom: 10px; }
  /* tik op het huis: de foto met de panelen als venster over de pagina */
  .znu.mphoto .tile.photo { display: flex; position: fixed; left: 10px; right: 10px; top: 70px; z-index: 40; max-height: calc(100vh - 160px); overflow: auto;
    box-shadow: 0 0 0 100vmax rgba(4,7,12,.72), 0 30px 60px rgba(0,0,0,.6); }
}
`;

// verwachting (Forecast.Solar via energy/solar_forecast) → punten in watt, in het midden van elke periode.
// Oudere HA-versies geven elke waarde op het EINDE van de periode (de dag begint dan met een 0 bij zonsopkomst),
// nieuwere op het BEGIN. Periodes zijn niet altijd een heel uur (rond zonsopkomst en -ondergang korter).
const fcPeriods = (hours) => {
  const ks = [...hours.keys()].sort((a, b) => a - b), out = [];
  const byDay = new Map();
  for (const k of ks) { const d = startOfDay(k); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(k); }
  for (const day of byDay.values()) {
    const endKeyed = day.length > 1 && hours.get(day[0]) === 0;
    for (let i = 0; i < day.length; i++) {
      const s0 = endKeyed ? day[i - 1] : day[i], e0 = endKeyed ? day[i] : day[i + 1] ?? day[i] + HOUR;
      if (s0 == null || e0 <= s0 || e0 - s0 > 2 * HOUR) continue;
      const wh = hours.get(day[i]) || 0;
      out.push({ t: (s0 + e0) / 2, s: s0, e: e0, v: wh / ((e0 - s0) / HOUR) });
    }
  }
  return out.sort((a, b) => a.t - b.t);
};

// ---------- lichte weergave (alleen telefoon): theme donker / licht / automatisch ----------
const THEME_CARDS = new Set();
let chromeApply = null; // zet de statusbalk in de kleur van het thema (zie hieronder)
const LIGHT_Q = '(prefers-color-scheme: light)';
const applyTheme = (el, cfg) => {
  if (cfg) { el._theme = String(cfg.theme || 'licht').toLowerCase().trim(); try { localStorage.removeItem('thuis-thema'); } catch (e) { /* geen opslag */ } }
  THEME_CARDS.add(el);
  const t = el._theme || 'licht', light = t === 'licht' || t === 'light' || ((t === 'automatisch' || t === 'auto') && window.matchMedia?.(LIGHT_Q).matches);
  if (light) el.setAttribute('data-th', 'l'); else el.removeAttribute('data-th');
  chromeApply?.();
};
try { window.matchMedia(LIGHT_Q).addEventListener('change', () => THEME_CARDS.forEach((c) => { if (!c.isConnected) THEME_CARDS.delete(c); else { applyTheme(c); c._updSheet?.(); } })); } catch (e) { /* oude browser */ }
const isLight = (el) => el.hasAttribute('data-th') && window.matchMedia?.('(max-width: 600px)').matches;
const LIGHT = `
@media (max-width: 600px) {
  :host([data-th=l]) { --bg:#f2f2f7 !important; --tile:#ffffff; --tile2:#ffffff; --line:rgba(60,60,67,.12); --text:#111318 !important; --muted:#6e6e78 !important; --faint:#a1a1aa; --exp:#1f9d55 !important; --sun:#e8890c !important; --grid-in:#8a3ffc !important; --home:#2f6fdb !important; color:#111318; }
  :host([data-th=l]) .wrap, :host([data-th=l]) .twrap, :host([data-th=l]) .znu, :host([data-th=l]) .vwrap, :host([data-th=l]) .awrap { background: #f2f2f7 !important; color:#111318; }
  :host([data-th=l]) .wrap::after { background: linear-gradient(180deg, rgba(242,242,247,0), rgba(242,242,247,.85)) !important; -webkit-backdrop-filter:none !important; backdrop-filter:none !important; }
  :host([data-th=l]) .tile, :host([data-th=l]) .kglass, :host([data-th=l]) .mstack > .was, :host([data-th=l]) .was, :host([data-th=l]) .wsr, :host([data-th=l]) .maf, :host([data-th=l]) .mrow > .tile, :host([data-th=l]) .kr, :host([data-th=l]) .kr:not(.lit), :host([data-th=l]) .lt, :host([data-th=l]) .lt:not(.on), :host([data-th=l]) .cv, :host([data-th=l]) .cv:not(.on) { background: #fff !important; border: .5px solid rgba(60,60,67,.12) !important; box-shadow: 0 1px 2px rgba(0,0,0,.04) !important; color:#111318; }
  :host([data-th=l]) .mp, :host([data-th=l]) .kspills .mp, :host([data-th=l]) #kview .mp { background: #fff !important; border: .5px solid rgba(60,60,67,.12) !important; box-shadow: none !important; color:#111318; }
  :host([data-th=l]) .mp.hot, :host([data-th=l]) #kview .mp.hot, :host([data-th=l]) .kspills .mp.hot { background: #fff !important; }
  :host([data-th=l]) .kspills .mp.hot span { color: #b8650a !important; }
  :host([data-th=l]) :is(.znu, .twrap) .tile span, :host([data-th=l]) :is(.znu, .twrap) .mp span, :host([data-th=l]) :is(.znu, .twrap) .aside, :host([data-th=l]) :is(.znu, .twrap) .label, :host([data-th=l]) :is(.znu, .twrap) .kr span, :host([data-th=l]) :is(.znu, .twrap) .lt .s, :host([data-th=l]) :is(.znu, .twrap) .mlab, :host([data-th=l]) :is(.znu, .twrap) .mdate, :host([data-th=l]) :is(.znu, .twrap) .clock div, :host([data-th=l]) :is(.znu, .twrap) .sub, :host([data-th=l]) :is(.znu, .twrap) .d { color: #6e6e78 !important; }
  :host([data-th=l]) :is(.znu, .twrap) .tile b, :host([data-th=l]) :is(.znu, .twrap) .mp b, :host([data-th=l]) :is(.znu, .twrap) .kr b, :host([data-th=l]) :is(.znu, .twrap) h1, :host([data-th=l]) :is(.znu, .twrap) h2, :host([data-th=l]) :is(.znu, .twrap) h3, :host([data-th=l]) :is(.znu, .twrap) .aside b, :host([data-th=l]) :is(.znu, .twrap) .clock div span, :host([data-th=l]) :is(.znu, .twrap) .mhead h1, :host([data-th=l]) :is(.znu, .twrap) .kth, :host([data-th=l]) :is(.znu, .twrap) .lt .n, :host([data-th=l]) :is(.znu, .twrap) .lt.on .n { color: #111318 !important; }
  :host([data-th=l]) .kr.lit { background:#fff !important; border-color: rgba(60,60,67,.12) !important; }
  :host([data-th=l]) .kr .ri, :host([data-th=l]) .kr:not(.lit) .ri { background: #f2f2f7 !important; color:#8e8e93 !important; }
  :host([data-th=l]) .kr.lit .ri { background: #fff3dc !important; color:#e8890c !important; }
  :host([data-th=l]) .lt.on { background: color-mix(in srgb, var(--lc) 16%, #fff) !important; border: .5px solid color-mix(in srgb, var(--lc) 45%, #fff) !important; box-shadow:none !important; }
  :host([data-th=l]) .xtabs { background: rgba(255,255,255,.88) !important; -webkit-backdrop-filter: blur(20px) saturate(1.8) !important; backdrop-filter: blur(20px) saturate(1.8) !important; box-shadow: 0 0 0 .5px rgba(60,60,67,.15), 0 8px 24px rgba(0,0,0,.08) !important; border: 0 !important; }
  :host([data-th=l]) .xtabs button { color: #8e8e93 !important; }
  :host([data-th=l]) .xtabs button.on { background: rgba(0,122,255,.10) !important; color: #007aff !important; }
  :host([data-th=l]) .xtabs button svg { filter: none; }
  :host([data-th=l]) .mstp button, :host([data-th=l]) .nrow button, :host([data-th=l]) .seg { background: #f2f2f7 !important; color:#111318 !important; border: 0 !important; }
  :host([data-th=l]) .seg button { color:#6e6e78 !important; }
  :host([data-th=l]) .seg button.on { background:#fff !important; color:#111318 !important; box-shadow: 0 1px 3px rgba(0,0,0,.12) !important; }
  :host([data-th=l]) .av .face { border-color: #fff !important; background-color: #d9dbe1 !important; color:#3a3a3c; }
  :host([data-th=l]) .av .ring { box-shadow: none !important; }
  :host([data-th=l]) .track, :host([data-th=l]) .mgs .track { stroke: #e5e5ea !important; }
  :host([data-th=l]) .gl, :host([data-th=l]) line.gl { stroke: #ececf0 !important; }
  :host([data-th=l]) .ax, :host([data-th=l]) text.ax { fill: #8e8e93 !important; }
  :host([data-th=l]) .mgs .mgv, :host([data-th=l]) .mgv { fill:#111318 !important; }
  :host([data-th=l]) .gtick { fill:#8e8e93 !important; }
  :host([data-th=l]) .knob, :host([data-th=l]) .mknob { filter:none !important; }
  :host([data-th=l]) .panel { background: #e9ecf2 !important; border-color: rgba(60,60,67,.12) !important; box-shadow: none !important; }
  :host([data-th=l]) .panel::before { background-image: linear-gradient(rgba(60,60,67,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(60,60,67,.08) 1px, transparent 1px) !important; }
  :host([data-th=l]) .pw, :host([data-th=l]) .pn { color:#111318 !important; text-shadow:none !important; }
  :host([data-th=l]) .inv { background: #f7f7fa !important; border-color: rgba(60,60,67,.08) !important; }
  :host([data-th=l]) .mnode { background:#fff !important; box-shadow: 0 0 0 .5px rgba(60,60,67,.12); }
  :host([data-th=l]) .mln { background-color: #e5e5ea !important; }
  :host([data-th=l]) .alert { background: #fff6e8 !important; border-color: #f6d9a8 !important; color:#7a4a08 !important; }
  :host([data-th=l]) .alert b { color:#5a3606 !important; }
  :host([data-th=l]) .minv, :host([data-th=l]) .nrow { border-color: rgba(60,60,67,.12) !important; }
  :host([data-th=l]) .mimg img, :host([data-th=l]) .house { filter: drop-shadow(0 10px 14px rgba(0,0,0,.16)) !important; }
  :host([data-th=l]) .sheet { background: #f2f2f7 !important; color:#111318; box-shadow: 0 -10px 30px rgba(0,0,0,.12) !important; }
  :host([data-th=l]) .shv { background: rgba(0,0,0,.25) !important; }
  :host([data-th=l]) .grab { background:#c7c7cc !important; }
  :host([data-th=l]) .sheet .tile, :host([data-th=l]) .sheet .kglass, :host([data-th=l]) .sheet .lk, :host([data-th=l]) .sheet .klk { background:#fff !important; }
  :host([data-th=l]) .sheet, :host([data-th=l]) .sheet.full, :host([data-th=l]) .sheet.full.lamp, :host([data-th=l]) .sheet.full.therm, :host([data-th=l]) .sheet.full.therm.hot { background: #f2f2f7 !important; color:#111318 !important; }
  :host([data-th=l]) .sheet h2, :host([data-th=l]) .sheet .st, :host([data-th=l]) .sheet .shh, :host([data-th=l]) .sheet .kth, :host([data-th=l]) .sheet b { color:#111318 !important; }
  :host([data-th=l]) .sheet .sub, :host([data-th=l]) .sheet .shs { color:#6e6e78 !important; }
  :host([data-th=l]) .sheet .xbtn, :host([data-th=l]) .sheet .hbtn, :host([data-th=l]) .sheet button:not(.on) { color:#3a3a3c; }
  :host([data-th=l]) .thd text { fill:#111318 !important; }
  :host([data-th=l]) .thd .tv, :host([data-th=l]) .thd .big { fill:#111318 !important; color:#111318 !important; }
  :host([data-th=l]) .sheet .mstp button, :host([data-th=l]) .thb button, :host([data-th=l]) .tstp button { background:#fff !important; color:#111318 !important; box-shadow: 0 0 0 .5px rgba(60,60,67,.15) !important; }
  :host([data-th=l]) .sheet .tpre, :host([data-th=l]) .tpre, :host([data-th=l]) .tmode { background:#fff !important; color:#111318 !important; }
  :host([data-th=l]) .lt.on .s, :host([data-th=l]) .lt .s { color:#9a5a00 !important; }
  :host([data-th=l]) .lt:not(.on) .s { color:#8e8e93 !important; }
  :host([data-th=l]) .maf em.mtag { color:#b8650a !important; }
  :host([data-th=l]) .maf em.mtag .dot { background:#f0a020 !important; box-shadow:none !important; }
  :host([data-th=l]) .maf em.mtag.d1 { color:#2f6fdb !important; }
  :host([data-th=l]) .maf em.mtag.d1 .dot { background:#2f6fdb !important; }
  :host([data-th=l]) .kr .ln .y { color:#b8650a !important; }
  :host([data-th=l]) .kr .ln .b, :host([data-th=l]) .kr .ln .ap { color:#2f6fdb !important; }
  :host([data-th=l]) .cv .s, :host([data-th=l]) .cv span { color:#2f6fdb !important; }
  :host([data-th=l]) .cd, :host([data-th=l]) .dot, :host([data-th=l]) .ist i, :host([data-th=l]) .th i { box-shadow:none !important; }
  :host([data-th=l]) .av .ring { background: #e5e5ea !important; padding: 2px !important; }
  :host([data-th=l]) .av .face { color:#3a3a3c !important; }
  :host([data-th=l]) .lt.on .ms { color:#9a5a00 !important; }
  :host([data-th=l]) .lt .ms { color:#8e8e93 !important; }
  :host([data-th=l]) .cv .ms { color:#2f6fdb !important; }
  :host([data-th=l]) .thd path[stroke^="rgba(255"], :host([data-th=l]) .thd circle[stroke^="rgba(255"] { stroke:#e5e5ea !important; }
  :host([data-th=l]) .thn { color:#111318 !important; -webkit-text-fill-color:#111318 !important; background:none !important; text-shadow:none !important; }
  :host([data-th=l]) .thl { color:#6e6e78 !important; }
  :host([data-th=l]) .tht { color:#111318 !important; }
  :host([data-th=l]) .sheet .grab { background:#c7c7cc !important; }
  :host([data-th=l]) .cvb button, :host([data-th=l]) .thb button { background:#fff !important; color:#111318 !important; border:0 !important; border-radius:50% !important; box-shadow: 0 0 0 .5px rgba(60,60,67,.18), 0 2px 6px rgba(0,0,0,.06) !important; }
  :host([data-th=l]) .cvb button svg, :host([data-th=l]) .thb button svg { stroke:#111318 !important; fill:#111318 !important; color:#111318 !important; }
  :host([data-th=l]) .tht, :host([data-th=l]) .tht b, :host([data-th=l]) .tht * { color:#111318 !important; -webkit-text-fill-color:#111318 !important; }
  :host([data-th=l]) .thp { background:#fff !important; color:#111318 !important; box-shadow: 0 0 0 .5px rgba(60,60,67,.18) !important; }
  :host([data-th=l]) .thm { background:#fff !important; color:#111318 !important; }
  :host([data-th=l]) .wrap, :host([data-th=l]) .twrap, :host([data-th=l]) .znu, :host([data-th=l]) .vwrap, :host([data-th=l]) .awrap { background: radial-gradient(520px 380px at 0% 0%, #dcecff, transparent 62%), radial-gradient(460px 360px at 100% 6%, #fff1cf, transparent 60%), radial-gradient(560px 480px at 85% 100%, #efe0ff, transparent 62%), radial-gradient(460px 380px at 0% 100%, #ffe3f1, transparent 60%), #f6f7fb !important; background-attachment: fixed !important; }
  :host([data-th=l]) .tile, :host([data-th=l]) .kglass, :host([data-th=l]) .mstack > .was, :host([data-th=l]) .was, :host([data-th=l]) .wsr, :host([data-th=l]) .maf, :host([data-th=l]) .mrow > .tile, :host([data-th=l]) .kr, :host([data-th=l]) .kr:not(.lit), :host([data-th=l]) .cv, :host([data-th=l]) .cv:not(.on), :host([data-th=l]) .mp, :host([data-th=l]) .kspills .mp, :host([data-th=l]) #kview .mp { background: rgba(255,255,255,.74) !important; -webkit-backdrop-filter: blur(16px) saturate(1.4); backdrop-filter: blur(16px) saturate(1.4); border: .5px solid rgba(255,255,255,.9) !important; box-shadow: 0 4px 16px rgba(80,90,140,.08) !important; }
  :host([data-th=l]) .xtabs { background: linear-gradient(180deg, rgba(255,255,255,.62), rgba(255,255,255,.42)) !important; -webkit-backdrop-filter: blur(24px) saturate(1.9) !important; backdrop-filter: blur(24px) saturate(1.9) !important; box-shadow: inset 0 1px 0 rgba(255,255,255,.95), inset 0 -1px 0 rgba(255,255,255,.35), 0 0 0 .5px rgba(60,60,67,.10), 0 10px 30px rgba(70,80,130,.16) !important; }
  :host([data-th=l]) .xtabs button.on { background: rgba(255,255,255,.7) !important; box-shadow: inset 0 1px 0 #fff, 0 2px 8px rgba(70,80,130,.12) !important; color:#007aff !important; }
  :host([data-th=l]) .wrap::after { background: linear-gradient(180deg, rgba(246,247,251,0), rgba(246,247,251,.35)) !important; -webkit-backdrop-filter: blur(10px) !important; backdrop-filter: blur(10px) !important; }
  :host([data-th=l]) .sheet, :host([data-th=l]) .sheet.full, :host([data-th=l]) .sheet.full.lamp, :host([data-th=l]) .sheet.full.therm, :host([data-th=l]) .sheet.full.therm.hot { background: linear-gradient(180deg, rgba(255,255,255,.72), rgba(246,247,251,.94) 40%) !important; -webkit-backdrop-filter: blur(28px) saturate(1.6) !important; backdrop-filter: blur(28px) saturate(1.6) !important; box-shadow: inset 0 1px 0 #fff, 0 -10px 30px rgba(70,80,130,.14) !important; }
  :host([data-th=l]) .shv { background: rgba(40,50,80,.18) !important; }
  :host([data-th=l]) .ksw { background: #e5e5ea !important; }
  :host([data-th=l]) .ksw.on { background: #2bb8b0 !important; }
  :host([data-th=l]) .mstp { display:flex !important; justify-content:flex-start; gap:10px; background:none !important; box-shadow:none !important; overflow:visible !important; }
  :host([data-th=l]) .mstp button { width:46px; height:36px !important; border-radius:99px !important; background: rgba(255,255,255,.9) !important; color:#111318 !important; border:0 !important; box-shadow: inset 0 1px 0 #fff, 0 0 0 .5px rgba(60,60,67,.14), 0 2px 8px rgba(70,80,130,.10) !important; }
  :host([data-th=l]) .mstp button + button { border-left:0 !important; }
  :host([data-th=l]) .xtabs button.on { color:#007aff !important; }
  :host([data-th=l]) .mst .mic, :host([data-th=l]) .mst span b { color:#e8890c; }
  :host([data-th=l]) .thb button.tpow { background:#2bb8b0 !important; color:#fff !important; box-shadow: inset 0 1px 0 rgba(255,255,255,.45), 0 6px 16px rgba(43,184,176,.35) !important; }
  :host([data-th=l]) #g-gray stop:nth-child(1) { stop-color:#dbe4f2!important }
  :host([data-th=l]) #g-gray stop:nth-child(2) { stop-color:#c3cfe2!important }
  :host([data-th=l]) #g-gray stop:nth-child(3) { stop-color:#aebcd3!important }
  :host([data-th=l]) #g-grayL stop:nth-child(1) { stop-color:#edf2f9!important }
  :host([data-th=l]) #g-grayL stop:nth-child(2) { stop-color:#d9e2ef!important }
  :host([data-th=l]) #g-grayL stop:nth-child(3) { stop-color:#c6d1e2!important }
  :host([data-th=l]) #g-grayD stop:nth-child(1) { stop-color:#cdd7e6!important }
  :host([data-th=l]) #g-grayD stop:nth-child(2) { stop-color:#b7c3d6!important }
  :host([data-th=l]) #g-grayD stop:nth-child(3) { stop-color:#a2b0c7!important }
  :host([data-th=l]) .thb button.tpow { display:grid !important; background:#fff !important; color:#8e8e93 !important; box-shadow: inset 0 1px 0 #fff, 0 0 0 .5px rgba(60,60,67,.18), 0 2px 6px rgba(0,0,0,.06) !important; }
  :host([data-th=l]) .thb button.tpow.on { background:#2bb8b0 !important; color:#fff !important; box-shadow: inset 0 1px 0 rgba(255,255,255,.45), 0 6px 16px rgba(43,184,176,.35) !important; }
  :host([data-th=l]) .thb { display:flex !important; justify-content:center; gap:22px !important; }
  :host([data-th=l]) .therm.hot #thArc { filter:none !important; }
  :host([data-th=l]) .thb button { width:64px; height:64px; display:grid !important; place-items:center; }
  :host([data-th=l]) .thb button svg { width:64px !important; height:64px !important; padding:20px !important; background:none !important; border:0 !important; box-shadow:none !important; -webkit-backdrop-filter:none !important; backdrop-filter:none !important; fill:none !important; }
  :host([data-th=l]) .thb button.tpow svg { stroke:currentColor !important; color:inherit !important; padding:19px !important; }
  :host([data-th=l]) .thb button.tpow.on svg { stroke:#fff !important; }
  :host([data-th=l]) .thb button.tpow[hidden] { display:none !important; }
  :host([data-th=l]) .thb button:active { transform:scale(.94); }
  :host([data-th=l]) .thl8 .tht { display:none !important; }
  :host([data-th=l]) .thl8 .thn { font-size:62px; letter-spacing:-.04em; } :host([data-th=l]) .thl8 .thn small { font-size:24px; color:#111318 !important; -webkit-text-fill-color:#111318 !important; margin-left:2px; }
  :host([data-th=l]) .thl8 .thl { font-size:16px; margin-top:10px; }
  :host([data-th=l]) .nst, :host([data-th=l]) .range, :host([data-th=l]) .st, :host([data-th=l]) .status, :host([data-th=l]) .sunl b, :host([data-th=l]) .fbar .k, :host([data-th=l]) .side h3, :host([data-th=l]) .invfoot b, :host([data-th=l]) .invfoot .t, :host([data-th=l]) .col .e { color:#3a3a3c !important; }
  :host([data-th=l]) .znu .bv { fill:#3a3a3c !important; } :host([data-th=l]) .ctitle.txt { color:#6e6e78 !important; } :host([data-th=l]) .foot { color:#8e8e93 !important; }
  :host([data-th=l]) .cbtn { color:#111318 !important; background:rgba(255,255,255,.9) !important; border-color:rgba(60,60,67,.14) !important; }
  :host([data-th=l]) .awrap .tile, :host([data-th=l]) .vwrap .tile { color:#111318; }
  :host([data-th=l]) { --water:#0a84d6 !important; --car:#13a091 !important; --gas:#e0244f !important; --imp:#8a3ffc !important; --faint:#8e8e93 !important; }
  :host([data-th=l]) .csub b, :host([data-th=l]) .cline b, :host([data-th=l]) .chealth b, :host([data-th=l]) .was.ready .rt b { color:#3a3a3c !important; }
  :host([data-th=l]) .bidir, :host([data-th=l]) .ctrack { background:rgba(60,60,67,.10) !important; } :host([data-th=l]) .bidir::after { background:rgba(60,60,67,.3) !important; }
  :host([data-th=l]) #bedTile, :host([data-th=l]) #agTile, :host([data-th=l]) #camTile, :host([data-th=l]) .sheet #tTile { background:none !important; border:0 !important; box-shadow:none !important; -webkit-backdrop-filter:none !important; backdrop-filter:none !important; }
  :host([data-th=l]) #bedTile .label, :host([data-th=l]) #agTile .label { color:#111318 !important; }
  :host([data-th=l]) .was .t .tm { color:#111318 !important; }
  :host([data-th=l]) .was .rt b { color:#2f6fdb !important; } :host([data-th=l]) .was.done .rt b { color:#1f9d55 !important; } :host([data-th=l]) .was.bad .rt b, :host([data-th=l]) .was.pic .rt b { color:#d93636 !important; }
  :host([data-th=l]) .wsub, :host([data-th=l]) .maf .wsub, :host([data-th=l]) #afTile .wsub { color:#6e6e78 !important; }
  :host([data-th=l]) { display:block; background:#f6f7fb; } :host([data-th=l]) .wrap { min-height:100vh; min-height:100dvh; box-sizing:border-box; }
}
`;

class ZonnepanelenCard extends HTMLElement {
  setConfig(config) {
    this._config = { ...DEFAULTS, ...config }; applyTheme(this, config);
    // paneelnummers: 'n' (sommige YAML-lezers maken van de sleutel n een false), of 'nr'; ontbreekt het, dan doornummeren
    let pn = 0;
    this._config.inverters = (this._config.inverters || []).map((inv) => ({ ...inv, panels: (inv.panels || []).map((p) => {
      const v = Number(p.n ?? p.nr ?? p.number ?? p.false ?? p['false']); pn = Number.isFinite(v) && v > 0 ? v : pn + 1; return { ...p, n: pn }; }) }));
    this._config.photo = { ...DEFAULTS.photo, ...(config.photo || {}) };
    this._config.forecast = { ...DEFAULTS.forecast, ...(config.forecast || {}) };
    this._photoKey = null;
    this._todayPts = [];
    this._fcPts = [];
    this._days = [];
    this._build();
    if (this._hass) this._update();
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
    this._fetchStats();
    if (Date.now() - (this._drawnAt || 0) > 60000) this._drawCharts();
  }

  getCardSize() { return 14; }
  getGridOptions() { return { columns: 'full' }; }
  static getStubConfig() { return {}; }

  connectedCallback() {
    this._timer = setInterval(() => this._fetchStats(true), 5 * 60000);
  }
  disconnectedCallback() {
    clearInterval(this._timer);
  }

  $(id) { return this.shadowRoot.getElementById(id); }

  _state(id) { return this._hass?.states[id]; }
  _num(id) {
    const v = parseFloat(this._state(id)?.state);
    return isNaN(v) ? null : v;
  }
  _power(id) {
    const v = this._num(id);
    if (v == null) return null;
    return this._state(id).attributes?.unit_of_measurement === 'kW' ? v * 1000 : v;
  }
  _moreInfo(entityId) {
    this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
  }

  /* ---------- markup ---------- */

  _build() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const c = this._config;

    const sides = {};
    for (const inv of c.inverters) (sides[inv.side] ||= []).push(inv);
    const first = (inv) => Math.min(...inv.panels.map((p) => p.n));
    const sidesHtml = Object.entries(sides).map(([side, invs]) => {
      invs = [...invs].sort((a, b) => first(a) - first(b));
      const groups = invs.map((inv) => `
        <div class="inv" data-e="${inv.temp}">
          <div class="pair">
            ${[...inv.panels].sort((a, b) => a.n - b.n).map((p) => `
              <div class="panel" data-e="${p.entity}" data-panel="${p.entity}">
                <div class="pn">${p.n}</div>
                <div class="pw num">—</div>
              </div>`).join('')}
          </div>
          <div class="invfoot"><b>${inv.name}</b><span class="t"><span class="tb"><i data-tbar="${inv.temp}"></i></span><span data-temp="${inv.temp}">—</span></span></div>
        </div>`).join('');
      return `
        <div class="side">
          <h3>${c.sides[side] || side}<span class="num" data-side="${side}">—</span></h3>
          <div class="groups" style="grid-template-columns: repeat(${invs.length}, minmax(0, 1fr))">${groups}</div>
        </div>`;
    }).join('');

    // gauge: 240° boog, middelpunt (100,100), r=80
    const arc = 'M30.72 140 A80 80 0 1 1 169.28 140';

    this.shadowRoot.innerHTML = `
      <style>${STYLE}${LIGHT}</style>
      ${GLOSSY}
      <div class="wrap znu"><div class="inner">
        ${headerHtml('nu')}

        <div class="grid" style="--gc:${Math.max(1, ...Object.values(sides).map((x) => x.length))}">
          <!-- telefoon: mijn huis met de energiestroom, en twee meters -->
          <div class="tile mob mhome">
            <div class="th"><span class="label">Mijn huis</span><span class="aside" id="mSt"></span></div>
            <!-- zon — huis — net: de rondjes staan op het midden van het huis, de stroomlijnen lopen het huis in -->
            <div class="mfrow">
              <div class="mfs" data-e="${c.solar_power}"><div class="mnode" id="mnSun"><svg viewBox="0 0 100 100"><use href="#gSun"/></svg></div><div class="mval"><b class="num" id="mSun">—</b><span>Zon</span></div></div>
              <i class="mln" id="mc1"></i>
              <div class="mimg" id="mImg"><img src="${c.photo.image}" alt=""></div>
              <i class="mln mlr" id="mc2"></i>
              <div class="mfs"${c.grid_power ? ` data-e="${c.grid_power}"` : ''}><div class="mnode" id="mnGrid"><svg viewBox="0 0 100 100"><use id="mGridIc" href="#gPylon"/></svg></div><div class="mval"><b class="num" id="mGrid">—</b><span id="mGridL">Net</span></div></div>
            </div>
            <div class="mhv"><b class="num" id="mHomeW">—</b><span>Verbruik</span></div>
          </div>
          <div class="mob mgauges">
            ${[['1', 'Opwekking nu', 'gSun', c.solar_power, 'mgo'], ['2', 'Opgewekt vandaag', 'gSolarP', c.solar_today, 'mgg']].map(([k, t, ic, e, g]) => `
            <div class="tile mgt" data-e="${e}"><div class="mgh"><svg viewBox="0 0 100 100"><use href="#${ic}"/></svg>${t}</div>
              <svg class="mgs" viewBox="0 0 200 172">
                <path class="track" d="${arc}" pathLength="100"/>
                <path class="val" id="mg${k}" d="${arc}" pathLength="100" stroke="url(#${g})" stroke-dasharray="0 100"/>
                <circle class="mknob mk${k}" id="mk${k}" r="5.5" cx="30.72" cy="140"/>
                <text class="mgv num" x="100" y="110" text-anchor="middle" id="mv${k}">—</text>
                <text class="gtick" x="30" y="166" text-anchor="middle">0</text><text class="gtick" x="170" y="166" text-anchor="middle" id="mm${k}"></text>
              </svg></div>`).join('')}
            <svg width="0" height="0" style="position:absolute"><defs>
              <linearGradient id="mgo" gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="180" y2="0"><stop offset="0" stop-color="#ff5a2a"/><stop offset=".55" stop-color="#ffb547"/><stop offset="1" stop-color="#ffe27a"/></linearGradient>
              <linearGradient id="mgg" gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="180" y2="0"><stop offset="0" stop-color="#169c55"/><stop offset=".55" stop-color="#2fcf75"/><stop offset="1" stop-color="#7cf0a8"/></linearGradient></defs></svg>
          </div>

          <div class="tile photo s4">
            <div class="th"><span class="label">Mijn huis</span><span class="aside" id="frontSum"></span></div>
            <div class="scene" id="scene">
              <img src="${c.photo.image}" alt="">
              <svg id="psvg" viewBox="0 0 ${c.photo.width} ${c.photo.height}" preserveAspectRatio="xMidYMid meet"></svg>
              <div class="tip" id="ptip"></div>
            </div>
            <div class="fbar" id="fbar"></div>
          </div>

          <div class="tile hero s4">
            <div class="th"><span class="label">Opwekking nu</span><span class="aside" id="peakCap"></span></div>
            <div class="gauge" data-e="${c.solar_power}">
              <svg viewBox="0 0 200 172">
                <defs><linearGradient id="gg" gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="180" y2="0">
                  <stop offset="0" stop-color="#ff5a2a"/><stop offset=".55" stop-color="#ffb547"/><stop offset="1" stop-color="#ffe27a"/>
                </linearGradient></defs>
                <path class="track" d="${arc}" pathLength="100"/>
                <path class="val" id="gval" d="${arc}" pathLength="100" stroke-dasharray="0 100"/>
                <circle class="knob" id="gknob" r="5" cx="30.72" cy="140"/>
                <text class="gtick" x="30" y="166" text-anchor="middle">0</text>
                <text class="gtick" x="170" y="166" text-anchor="middle" id="gmax"></text>
              </svg>
              <div class="gcenter">
                <div class="big num" id="pv">—<span>W</span></div>
                <div class="pct" id="pvpct"></div>
                <div class="sunl" id="sunchip" data-e="${c.sun}"></div>
              </div>
            </div>
            <div class="stats3">
              <div class="stat" data-e="${c.solar_today}" id="st1"></div>
              <div class="stat" id="st2"></div>
              <div class="stat" id="st3"></div>
            </div>
          </div>

          <div class="tile flow s4">
            <div class="th"><span class="label">Energiestroom</span><span class="aside" id="flowNote"></span></div>
            <svg viewBox="0 0 600 236" style="overflow:visible">
              <line class="base" x1="146" y1="78" x2="244" y2="78"/>
              <line class="base" x1="356" y1="78" x2="454" y2="78"/>
              <line class="fl" id="f1" x1="146" y1="78" x2="244" y2="78" stroke="var(--sun)"/>
              <line class="fl" id="f2" x1="356" y1="78" x2="454" y2="78"/>
              <g data-e="${c.solar_power}">
                <circle class="node" cx="90" cy="78" r="50" stroke="var(--sun)" style="filter: drop-shadow(0 0 14px rgba(255,170,60,.35))"/>
                <use href="#gSun" x="62" y="50" width="56" height="56"/>
                <text x="90" y="170" text-anchor="middle"><tspan class="nv num" id="nSun">—</tspan><tspan class="nu" dx="4" id="nSunU">W</tspan></text>
                <text class="nl" x="90" y="196" text-anchor="middle">Zon</text>
              </g>
              <g>
                <circle class="node" cx="300" cy="78" r="50" stroke="var(--home)" style="filter: drop-shadow(0 0 14px rgba(120,160,255,.3))"/>
                <use href="#gHouse" x="272" y="48" width="56" height="56"/>
                <text x="300" y="170" text-anchor="middle"><tspan class="nv num" id="nHome">—</tspan><tspan class="nu" dx="4" id="nHomeU">W</tspan></text>
                <text class="nl" x="300" y="196" text-anchor="middle">Huis</text>
              </g>
              <g data-e="${c.grid_power}">
                <circle class="node" id="gridNode" cx="510" cy="78" r="50" stroke="var(--grid-in)"/>
                <use id="gridIc" href="#gPylon" x="482" y="48" width="56" height="56"/>
                <text x="510" y="170" text-anchor="middle"><tspan class="nv num" id="nGrid">—</tspan><tspan class="nu" dx="4" id="nGridU">W</tspan></text>
                <text class="nl" x="510" y="196" text-anchor="middle" id="nGridL">Net</text>
              </g>
            </svg>
            <div class="ffoot">
              <div class="sec">
                <div class="selfrow"><span class="label">Zelfvoorziening nu</span><span class="v num" id="self">—</span></div>
                <div class="meter"><i id="selfBar" class="self" style="width:0"></i></div>
                <div class="d" id="selfNote"></div>
              </div>
              <div class="sec" id="advice" hidden></div>
            </div>
          </div>

          <div class="tile s8 tday">
            <div class="th"><span class="label"><span class="dl">Vermogen vandaag</span><span class="ml">Vandaag</span></span><span class="aside" id="peak"></span></div>
            <div class="chart" id="chartToday"></div>
          </div>

          <div class="tile s4 tdays">
            <div class="th"><span class="label"><span class="dl">Laatste ${c.days} dagen</span><span class="ml">Opbrengst</span></span><span class="aside dl" id="sum"></span>
              <span class="seg ml" id="dseg"><button data-r="week" class="on">Week</button><button data-r="maand">Maand</button><button data-r="jaar">Jaar</button></span></div>
            <div class="msum ml" id="msum"></div>
            <div class="chart" id="chartDays"></div>
          </div>

          <div class="tile s12 tpan">
            <div class="th"><span class="label"><span class="dl">Panelen &amp; omvormers</span><span class="ml">Panelen</span></span><span class="aside dl" id="panelsNote"></span><span class="aside ml" id="mPanSum"></span></div>
            <div class="alert" id="alert" hidden></div>
            <div class="mpanels mob">${c.inverters.flatMap((inv) => inv.panels).sort((a, b) => a.n - b.n).map((p) => `<div class="panel" data-mp="${p.entity}" data-e="${p.entity}"><div class="pn">${p.n}</div><div class="pw num">—</div></div>`).join('')}</div>
            <div class="minv mob" id="mInv"><span>Omvormers<span id="mInvT"></span></span><span class="chev">›</span><span class="ist" id="mIst"><i></i><span></span></span></div>
            <div class="sides">${sidesHtml}</div>
          </div>

        </div>
      </div></div>`;

    this.shadowRoot.querySelectorAll('[data-e]').forEach((n) =>
      n.addEventListener('click', (e) => { e.stopPropagation(); this._moreInfo(n.dataset.e); }));
    bindNav(this.shadowRoot);

    this._ro?.disconnect();
    this._ro = new ResizeObserver(() => this._drawCharts());
    this._ro.observe(this.$('chartToday'));
    this._ro.observe(this.$('chartDays'));
    this._ro.observe(this.$('scene'));

    const psvg = this.$('psvg'), ptip = this.$('ptip');
    psvg.addEventListener('click', (e) => { const n = e.target.closest('[data-e]'); if (n) this._moreInfo(n.dataset.e); });
    psvg.addEventListener('pointermove', (e) => {
      const n = e.target.closest('[data-n]');
      if (!n) { ptip.classList.remove('on'); return; }
      const r = this.$('scene').getBoundingClientRect();
      ptip.innerHTML = n.dataset.tip;
      ptip.style.left = `${e.clientX - r.left}px`;
      ptip.style.top = `${e.clientY - r.top}px`;
      ptip.classList.add('on');
    });
    psvg.addEventListener('pointerleave', () => ptip.classList.remove('on'));
    // telefoon: tik op het huis = foto met de panelen als venster; tik ernaast = sluiten
    const wrap = this.shadowRoot.querySelector('.wrap');
    this.$('mImg').addEventListener('click', () => wrap.classList.add('mphoto'));
    this.$('mInv').addEventListener('click', () => wrap.classList.toggle('mdet'));
    this.shadowRoot.querySelectorAll('#dseg button').forEach((b) => b.addEventListener('click', () => {
      this._rng = b.dataset.r; this.shadowRoot.querySelectorAll('#dseg button').forEach((x) => x.classList.toggle('on', x === b));
      if (this._rng === 'jaar') this._fetchYear(); this._drawDays();
    }));
    this.shadowRoot.querySelector('.tile.photo').addEventListener('click', (e) => { if (wrap.classList.contains('mphoto') && !e.target.closest('[data-e], [data-n]')) wrap.classList.remove('mphoto'); });
  }

  /* ---------- live values ---------- */

  _update() {
    if (!this._hass || !this.shadowRoot) return;
    const c = this._config;
    const root = this.shadowRoot;
    const set = (id, html) => { const el = this.$(id); if (el && el.innerHTML !== html) el.innerHTML = html; };

    set('date', new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

    const n = c.inverters.length;
    // zon op / onder, onder de meter
    const sun = this._state(c.sun);
    if (sun) {
      const up = sun.state === 'above_horizon';
      const t = up ? sun.attributes.next_setting : sun.attributes.next_rising;
      set('sunchip', `<svg viewBox="0 0 24 24">${up ? '<path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 4v3M4.9 8.9l1.4 1.4M19.1 8.9l-1.4 1.4M12 13v-2M10 11l2 2 2-2"/>' : '<path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 4v3M4.9 8.9l1.4 1.4M19.1 8.9l-1.4 1.4M12 11v2M10 13l2-2 2 2"/>'}</svg>${up ? 'Zon onder' : 'Zon op'} <b>${t ? fmtTime(t) : '—'}</b>`);
    } else this.$('sunchip').style.display = 'none';

    // hero gauge
    const pv = this._power(c.solar_power);
    const pvF = fmtPower(pv);
    set('pv', `${pvF.v}<span>${pvF.u}</span>`);
    const peak = this._peak ? Math.ceil(Math.max(this._peak, pv || 0) / 10) * 10 : c.max_power;
    const ratio = clamp((pv || 0) / peak, 0, 1);
    set('pvpct', pv == null ? 'Geen data' : this._peak ? `${fmt(ratio * 100)}% van je piek (${fmt(peak)} W)` : `${fmt(ratio * 100)}% van ${fmt(peak)} W`);
    set('gmax', fmt(peak));
    this.$('gval').setAttribute('stroke-dasharray', `${(ratio * 100).toFixed(2)} 100`);
    const a = ((150 + 240 * ratio) * Math.PI) / 180;
    this.$('gknob').setAttribute('cx', (100 + 80 * Math.cos(a)).toFixed(2));
    this.$('gknob').setAttribute('cy', (100 + 80 * Math.sin(a)).toFixed(2));

    // today / avg / best — opgewekt vandaag komt alleen van de ECU-teller (geen eigen schatting uit het vermogen)
    const today = this._num(c.solar_today);
    const days = this._dayValues();
    const past = days.slice(0, -1).filter((d) => d.v > 0);
    const avg = past.length ? past.reduce((s, d) => s + d.v, 0) / past.length : null;
    const best = days.length ? days.reduce((m, d) => (d.v > m.v ? d : m), days[0]) : null;
    const stat = (label, v, unit, d = '', extra = '') => `<div class="label">${label}</div><div class="v num">${v}<small>${unit}</small></div>${d ? `<div class="d">${d}</div>` : ''}${extra}`;
    const fc = this._forecast();
    if (fc.today != null) {
      const pct = clamp((today || 0) / fc.today, 0, 1) * 100;
      set('st1', stat('Vandaag', fmt(today, 2), 'kWh', `van ${fmt(fc.today, 1)} verwacht`, `<div class="fcbar"><i style="width:${pct.toFixed(1)}%"></i></div>`));
      set('st2', stat('Nog te gaan', fmt(fc.remaining, 1), 'kWh', 'voorspeld'));
      const pk = this._state(c.forecast.peak_tomorrow)?.state;
      const pkT = pk && !isNaN(Date.parse(pk)) ? `piek rond ${fmtTime(pk)}` : '';
      set('st3', stat('Morgen', fmt(fc.tomorrow, 1), 'kWh', pkT));
      set('sum', days.length ? `Totaal <b class="num">${fmt(days.reduce((s, d) => s + d.v, 0))} kWh</b> · gem. ${fmt(avg, 1)} · beste ${fmt(best?.v, 1)}` : '');
    } else {
      set('st1', stat('Vandaag', fmt(today, 2), 'kWh'));
      set('st2', stat(`Gem. ${c.days} dagen`, fmt(avg, 1), 'kWh'));
      set('st3', stat('Beste dag', best && best.v > 0 ? fmt(best.v, 1) : '—', 'kWh'));
      set('sum', days.length ? `Totaal <b class="num">${fmt(days.reduce((s, d) => s + d.v, 0))} kWh</b>` : '');
    }

    // flow
    const grid = this._power(c.grid_power);
    const home = pv != null && grid != null ? Math.max(0, pv + grid) : null;
    const put = (id, w) => { const f = fmtPower(w == null ? null : Math.abs(w)); set(id, f.v); set(id + 'U', f.u); };
    put('nSun', pv);
    put('nHome', home);
    put('nGrid', grid);
    const exporting = grid != null && grid < -5;
    const importing = grid != null && grid > 5;
    const gcol = exporting ? 'var(--exp)' : 'var(--grid-in)';
    this.$('gridNode').setAttribute('stroke', gcol);
    this.$('gridIc').setAttribute('href', exporting ? '#gPylonX' : '#gPylon');
    set('nGridL', exporting ? 'Teruglevering' : importing ? 'Afname net' : 'Net');
    const speed = (w) => `${clamp(2.4 - Math.log10(Math.max(w, 10)) * 0.55, 0.45, 2.2).toFixed(2)}s`;
    const f1 = this.$('f1');
    f1.classList.toggle('off', !(pv > 5));
    f1.style.animationDuration = speed(pv || 0);
    const f2 = this.$('f2');
    f2.classList.toggle('off', !(exporting || importing));
    f2.classList.toggle('rev', importing);
    f2.setAttribute('stroke', gcol);
    f2.style.animationDuration = speed(Math.abs(grid || 0));

    const self = home == null ? null : home > 0 ? Math.min(1, (pv || 0) / home) : pv > 0 ? 1 : 0;
    set('self', self == null ? '—' : `${fmt(self * 100)}<small>%</small>`);
    this.$('selfBar').style.width = `${(self || 0) * 100}%`;
    set('selfNote', self == null ? '' : home === 0 && !(pv > 0) ? 'Geen verbruik gemeten'
      : self >= 0.995 ? 'Je hele verbruik komt nu van de zon'
      : self <= 0.005 ? 'Je verbruik komt nu volledig van het net'
      : `${fmt(self * 100)}% van je verbruik komt nu van de zon, de rest van het net`);
    set('flowNote', home == null ? '' : `Huis <b class="num">${fmtPower(home).v} ${fmtPower(home).u}</b>`);
    const adv = c.advice ? this._advice(pv, grid, home) : null, advEl = this.$('advice');
    advEl.hidden = !adv;
    if (adv) {
      const maxS = Math.max(800, ...adv.slots.map((x) => x.sv || 0));
      const tl = adv.slots.length ? `<div class="tl"><div class="cells" style="grid-template-columns:repeat(${adv.slots.length},minmax(0,1fr))">${adv.slots.map((x) => {
        const h = x.cls ? 10 + Math.round(clamp((x.sv || 0) / maxS, 0, 1) * 20) : 6;
        const tip = x.sv == null ? x.label : `${x.label} · ${x.sv >= 0 ? '± ' + fmt(Math.round(x.sv / 50) * 50) + ' W over' : 'te weinig zon'}`;
        return `<div class="cell" title="${tip}"><div class="b ${x.cls}${x.cur ? ' cur' : ''}" style="height:${h}px"></div><div class="h${x.cur ? ' hnow' : ''}">${x.cur ? 'nu' : new Date(x.t).getHours()}</div></div>`;
      }).join('')}</div></div>` : '';
      set('advice', `<div class="adv" style="--ac:${adv.col}"><div class="adv-ic"><svg class="gl3" viewBox="0 0 100 100"><use href="#${{ wash: 'gWash', clock: 'gClock', cal: 'gCal' }[adv.icon]}"/></svg></div>
        <div><div class="adv-t">${adv.title}</div><div class="adv-d">${adv.text}</div></div></div>${tl}`);
    }

    // panels
    let sum = 0, count = 0, bestPanel = 0;
    const sideSum = {};
    for (const inv of c.inverters) for (const p of inv.panels) {
      const w = this._power(p.entity);
      if (w != null) { sum += w; count++; bestPanel = Math.max(bestPanel, w); }
      sideSum[inv.side] = (sideSum[inv.side] || 0) + (w || 0);
      const el = root.querySelector(`[data-panel="${p.entity}"]`);
      if (!el) continue;
      const r = clamp((w || 0) / c.panel_max, 0, 1);
      el.style.setProperty('--p', Math.sqrt(r).toFixed(3));
      const html = w == null ? '—' : `${fmt(w)}<small>W</small>`;
      const pw = el.querySelector('.pw');
      if (pw.innerHTML !== html) pw.innerHTML = html;
    }
        // status per omvormer (ECU): elke omvormer die offline is, telt met zijn panelen als offline
        const all = c.inverters.flatMap((inv) => inv.panels);
        const invOnline = this._num(c.inverters_online);
        let on;
        if (invOnline != null) {
          on = Math.round(clamp(invOnline, 0, c.inverters.length) * (all.length / c.inverters.length));
        } else {
          // geen ECU-status beschikbaar: terugvallen op de paneelsensoren zelf
          on = all.filter((p) => { const st = this._state(p.entity)?.state; return st != null && st !== 'unavailable' && st !== 'unknown'; }).length;
        }
        const off = all.length - on;
        const night = this._state(c.sun)?.state === 'below_horizon';
        set('frontSum', off > 0 && night ? '<span class="pstat"><i class="dot idle"></i>Panelen in rust</span>'
          : off === 0 ? '<span class="pstat"><i class="dot"></i>Alle panelen online</span>'
          : on === 0 ? '<span class="pstat"><i class="dot warn"></i>Alle panelen offline</span>'
          : `<span class="pstat"><i class="dot mid"></i><span><b class="num">${on}</b> online · <b class="num">${off}</b> offline</span></span>`);
    const fs = this._flowState(pv, grid), fbar = this.$('fbar');
    if (fbar) {
      const t = fmtPower(fs.w);
      fbar.style.setProperty('--c', fs.col || '#6b7385');
      const html = `<span class="k"><i></i>${fs.text}</span><span class="w">${fs.kind === 'idle' ? '' : `${fs.arrow} ${t.v} ${t.u}`}</span>`;
      if (fbar.innerHTML !== html) fbar.innerHTML = html;
      const sc = this.$('scene');
      sc.classList.toggle('glow', c.flow_style === 'glow' && !!fs.col);
      if (fs.col) sc.style.setProperty('--aura', fs.col);
    }
    this._drawPhoto();
    for (const [side, w] of Object.entries(sideSum)) {
      const el = root.querySelector(`[data-side="${side}"]`);
      if (el) el.textContent = `${fmt(w)} W`;
    }
    // afwijkende panelen: ten opzichte van de mediaan van hetzelfde dakvlak
    const lows = [];
    for (const side of Object.keys(sideSum)) {
      const ps = c.inverters.filter((inv) => inv.side === side).flatMap((inv) => inv.panels.map((p) => ({ ...p, w: this._power(p.entity) })));
      const ws = ps.map((p) => p.w).filter((w) => w != null).sort((a, b) => a - b);
      const med = ws.length ? (ws[(ws.length - 1) >> 1] + ws[ws.length >> 1]) / 2 : 0;
      for (const p of ps) {
        const el = root.querySelector(`[data-panel="${p.entity}"]`);
        if (!el) continue;
        const dev = med > 40 && p.w != null ? (p.w - med) / med : 0;
        const low = dev < -c.deviation;
        el.classList.toggle('low', low);
        let badge = el.querySelector('.dev');
        if (low) {
          if (!badge) { badge = document.createElement('div'); badge.className = 'dev'; el.appendChild(badge); }
          badge.textContent = `−${fmt(-dev * 100)}%`;
          lows.push({ n: p.n, pct: -dev * 100, side });
        } else if (badge) badge.remove();
      }
    }
    const alert = this.$('alert');
    alert.hidden = !lows.length;
    if (lows.length) {
      const sideName = (sd) => (c.sides[sd] || sd).toLowerCase();
      set('alert', '<i class="dot mid"></i><span>' + (lows.length === 1
        ? `<b>Paneel ${lows[0].n} levert ${fmt(lows[0].pct)}% minder</b> dan de andere panelen op de ${sideName(lows[0].side)}. Mogelijk schaduw, vuil of een storing.`
        : `<b>${lows.length} panelen leveren duidelijk minder</b> dan de rest van hun dakvlak: ${lows.map((x) => `paneel ${x.n} (−${fmt(x.pct)}%)`).join(', ')}. Mogelijk schaduw, vuil of een storing.`) + '</span>');
    }

    // omvormers: temperatuur per groep
    const temps = [];
    for (const inv of c.inverters) {
      const t = this._num(inv.temp);
      const bar = root.querySelector(`[data-tbar="${inv.temp}"]`);
      if (bar) {
        bar.style.width = `${clamp((t || 0) / 80, 0, 1) * 100}%`;
        bar.style.background = t == null ? 'transparent' : t < 45 ? 'linear-gradient(90deg,#2fbf8a,#3ddc97)'
          : t < 60 ? 'linear-gradient(90deg,#ff9a2e,#ffb547)' : 'linear-gradient(90deg,#ff5a3a,#ff7262)';
      }
      const lbl = root.querySelector(`[data-temp="${inv.temp}"]`);
      if (lbl) lbl.textContent = t == null ? '—' : `${fmt(t)} °C`;
      if (t != null) temps.push(t);
    }
    set('panelsNote', `${count || n * 2} panelen · ${n} omvormers${temps.length ? ` · ${fmt(Math.min(...temps))}–${fmt(Math.max(...temps))} °C` : ''}`);
    set('peakCap', `${n * 2} panelen`);
    this._updMob(pv, grid, home, today, fc, best, speed);
  }

  // telefoon: mijn huis (zon, huis, net met stromende bolletjes) en de meters Opwekking nu / Opgewekt vandaag
  _updMob(pv, grid, home, today, fc, best, speed) {
    const c = this._config, set = (id, html) => { const el = this.$(id); if (el && el.innerHTML !== html) el.innerHTML = html; };
    const pw = (w) => { if (w == null) return '—'; const f = fmtPower(Math.abs(w)); return `${f.v}<small>${f.u}</small>`; };
    set('mSt', this.$('frontSum').innerHTML);
    set('mSun', pw(pv)); set('mHomeW', pw(home)); set('mGrid', pw(grid));
    const exporting = grid != null && grid < -5, importing = grid != null && grid > 5;
    set('mGridL', exporting ? 'Terug' : importing ? 'Van net' : 'Net');
    this.$('mGrid').className = `num${exporting ? ' exp' : importing ? ' imp' : ''}`;
    this.$('mnSun').classList.toggle('off', !(pv > 5)); this.$('mnGrid').classList.toggle('exp', exporting); this.$('mnGrid').classList.toggle('off', !(exporting || importing));
    // verbruik in de kleur van de bron: groen alles zon, blauw zon + net, paars alles net
    const selfS = home > 0 ? clamp((pv || 0) / home, 0, 1) : pv > 0 ? 1 : 0;
    this.$('mHomeW').parentElement.style.setProperty('--hc', home == null ? 'var(--text)' : exporting || selfS >= 0.995 ? 'var(--exp)' : pv > 5 ? 'var(--home)' : 'var(--grid-in)');
    const m1 = this.$('mc1'), m2 = this.$('mc2');
    m1.classList.toggle('on', pv > 5); m1.style.animationDuration = speed(pv || 0);
    m2.classList.toggle('on', exporting || importing); m2.classList.toggle('rev', importing); m2.classList.toggle('imp', importing);
    m2.style.animationDuration = speed(Math.abs(grid || 0));
    const gauge = (k, r, v, max) => {
      r = clamp(r || 0, 0, 1);
      this.$(`mg${k}`).setAttribute('stroke-dasharray', `${(r * 100).toFixed(2)} 100`);
      const a = ((150 + 240 * r) * Math.PI) / 180;
      this.$(`mk${k}`).setAttribute('cx', (100 + 80 * Math.cos(a)).toFixed(2));
      this.$(`mk${k}`).setAttribute('cy', (100 + 80 * Math.sin(a)).toFixed(2));
      set(`mv${k}`, v); set(`mm${k}`, max);
    };
    gauge('1', (pv || 0) / c.max_power, pv == null ? '—' : `${fmt(pv)}<tspan class="mgu" dx="5">W</tspan>`, fmt(c.max_power));
    // schaal: de beste dag van de afgelopen dagen (incl. vandaag), naar boven afgerond op een even getal; zonder gegevens 20
    const top = Math.max(today || 0, best?.v || 0), dmax = top > 0 ? Math.max(4, Math.ceil(top / 2) * 2) : 20;
    gauge('2', (today || 0) / dmax, today == null ? '—' : `${fmt(today, 1)}<tspan class="mgu" dx="5">kWh</tspan>`, fmt(dmax));
    // panelen: het compacte raster volgt de panelen van de computerweergave (kleur, waarde, afwijking)
    let tot = 0; const temps = [];
    this.shadowRoot.querySelectorAll('[data-mp]').forEach((m) => {
      const d = this.shadowRoot.querySelector(`[data-panel="${m.dataset.mp}"]`); if (!d) return;
      if (m.innerHTML !== d.innerHTML) m.innerHTML = d.innerHTML;
      m.className = d.className; m.style.setProperty('--p', d.style.getPropertyValue('--p'));
      tot += this._power(m.dataset.mp) || 0;
    });
    for (const inv of c.inverters) { const t = this._num(inv.temp); if (t != null) temps.push(t); }
    set('mPanSum', `<b class="num">${fmt(tot)} W</b>`);
    set('mInvT', temps.length ? ` · ${fmt(Math.min(...temps))}–${fmt(Math.max(...temps))} °C` : '');
    // omvormers online: groen alles, oranje een deel, rood geen (overdag); grijs 'In rust' als de zon onder is
    const nInv = c.inverters.length, onInv = this._num(c.inverters_online), night = this._state(c.sun)?.state === 'below_horizon';
    const ist = this.$('mIst'), st = !nInv ? null : night ? 'n' : onInv == null ? null : onInv >= nInv ? 'g' : onInv > 0 ? 'o' : 'r';
    this.$('mInv').classList.toggle('hasst', !!st);
    if (st) { ist.className = `ist ${st}`; set('mIst', `<i></i><span>${st === 'n' ? 'In rust' : `${fmt(clamp(onInv, 0, nInv))} van ${nInv} online`}</span>`); }
  }

  /* ---------- advies ---------- */

  // advies op basis van huidige teruglevering en de voorspelling per uur
  _advice(pv, grid, home) {
    const c = this._config, now = Date.now(), hourMs = Math.floor(now / HOUR) * HOUR;
    const base = clamp(home ?? 400, 250, 800);                // geschat basisverbruik
    const fcMap = new Map((this._fcPts || []).map((p) => [Math.floor(p.t / HOUR) * HOUR, p.v]));
    const surplusAt = (t) => (t === hourMs && grid != null ? -grid : fcMap.has(t) ? fcMap.get(t) - base : null);
    const cls = (sv) => (sv == null ? '' : sv >= 800 ? 'g' : sv >= 250 ? 'm' : '');
    const hh = (t) => fmtTime(t);
    const sunDown = this._state(c.sun)?.state === 'below_horizon';
    const fc = this._forecast();
    const pk = this._state(c.forecast.peak_tomorrow)?.state;
    const tomorrow = () => (fc.tomorrow != null ? {
      icon: 'cal', col: 'var(--home)', title: 'Plan grote verbruikers morgen',
      text: `Morgen verwacht <b>${fmt(fc.tomorrow, 1)} kWh</b>${pk && !isNaN(Date.parse(pk)) ? `, het meeste rond <b>${fmtTime(pk)}</b>` : ''}.`, slots: [],
    } : null);

    if (sunDown || !(pv > 5) && !fcMap.size) return tomorrow();

    // tijdlijn: 3 uur terug tot 6 uur vooruit
    const slots = [];
    for (let i = -3; i <= 6; i++) {
      const t = hourMs + i * HOUR;
      const sv = i < 0 ? (fcMap.has(t) ? fcMap.get(t) - base : null) : surplusAt(t);
      slots.push({ t, sv, cls: cls(sv), cur: i === 0, label: hh(t) });
    }
    const exportNow = grid != null && grid < 0 ? -grid : 0;
    if (exportNow >= 300) {
      let end = null;
      for (let t = hourMs + HOUR; fcMap.size && (surplusAt(t) ?? -1) >= 250; t += HOUR) end = t + HOUR;
      return {
        icon: 'wash', col: 'var(--exp)', title: 'Goed moment voor de wasmachine',
        text: `Je levert <b>${fmt(exportNow)} W</b> terug${end ? `; tot ± <b>${hh(end)}</b> blijft er genoeg over` : ''}.`, slots,
      };
    }
    let bestT = null, bestS = 800;
    for (let t = hourMs + HOUR; t < startOfDay(now) + DAY; t += HOUR) { const sv = surplusAt(t); if (sv != null && sv > bestS) { bestS = sv; bestT = t; } }
    if (bestT) return {
      icon: 'clock', col: 'var(--sun)', title: 'Wacht nog even',
      text: `Rond <b>${hh(bestT)}</b> is er meer zonnestroom over (± <b>${fmt(Math.round(bestS / 50) * 50)} W</b>).`, slots,
    };
    return tomorrow();
  }

  /* ---------- foto ---------- */

  _drawPhoto() {
    const c = this._config, ph = c.photo, svg = this.$('psvg');
    if (!svg || !this._hass) return;
    const panels = [];
    for (const inv of c.inverters) for (const p of inv.panels) if (ph.panels[p.n]) panels.push({ ...p, inv, w: this._power(p.entity) });
    const scale = Math.min(svg.clientWidth / ph.width, svg.clientHeight / ph.height) || 1;
    const pv = this._power(c.solar_power), grid = this._power(c.grid_power);
    const key = JSON.stringify([panels.map((p) => p.w == null ? null : Math.round(p.w)), scale.toFixed(3), Math.round((pv || 0) / 10), Math.round((grid || 0) / 10)]);
    if (key === this._photoKey) return;
    this._photoKey = key;

    const pts = (p) => p.map((q) => q.join(',')).join(' ');
    let out = `<defs>
      <filter id="pb" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter></defs>`;
    let labels = '';
    const fs = 11 / scale, ph2 = 19 / scale;
    for (const p of panels) {
      const poly = ph.panels[p.n], P = pts(poly);
      const r = Math.sqrt(clamp((p.w || 0) / c.panel_max, 0, 1));
      if (r > 0.02) {
        out += `<polygon points="${P}" fill="none" stroke="#ffb53d" stroke-width="12" opacity="${(r * 0.75).toFixed(2)}" filter="url(#pb)"/>`
          + `<polygon points="${P}" fill="#ffd27a" opacity="${(r * 0.22).toFixed(2)}" style="mix-blend-mode:screen"/>`
          + `<polygon points="${P}" fill="none" stroke="#ffd58a" stroke-width="2.5" stroke-linejoin="round" opacity="${(r * 0.95).toFixed(2)}"/>`;
      }
      const tip = `<b>${p.w == null ? '—' : fmt(p.w) + ' W'}</b>Paneel ${p.n} · ${p.inv.name}`;
      out += `<polygon class="hit" points="${P}" fill="transparent" data-n="${p.n}" data-e="${p.entity}" data-tip="${tip.replace(/"/g, '&quot;')}"/>`;
      if (p.w && scale > 0.45) {
        const cx = poly.reduce((a, q) => a + q[0], 0) / poly.length, cy = poly.reduce((a, q) => a + q[1], 0) / poly.length;
        const txt = scale > 0.5 ? `${fmt(p.w)} W` : fmt(p.w), bw = (txt.length * 6.6 + 10) / scale;
        labels += `<g class="pill" transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)})" pointer-events="none"><rect x="${(-bw / 2).toFixed(1)}" y="${(-ph2 / 2).toFixed(1)}" width="${bw.toFixed(1)}" height="${ph2.toFixed(1)}" rx="${(ph2 / 2).toFixed(1)}"/>`
          + `<text y="${(fs * 0.36).toFixed(1)}" text-anchor="middle" style="font-size:${fs.toFixed(1)}px">${txt}</text></g>`;
      }
    }
    if (ph.flow) out += this._flowSvg(ph.flow, pv, grid, scale);
    svg.innerHTML = out + labels;
  }

  // bewegende stippen langs een pad; sneller bij meer vermogen
  _flowSvg(f, pv, grid, scale) {
    const u = 1 / scale, out = [];
    const dur = (w) => clamp(2.6 - Math.log10(Math.max(w, 10)) * 0.6, 0.5, 2.2).toFixed(2);
    const line = (d, col, w, reverse) => {
      const period = 22 * u;
      const anim = `<animate attributeName="stroke-dashoffset" from="${reverse ? -period : 0}" to="${reverse ? 0 : -period}" dur="${dur(w)}s" repeatCount="indefinite"/>`;
      return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${(7 * u).toFixed(1)}" opacity=".18" stroke-linecap="round"/>`
        + `<path d="${d}" fill="none" stroke="${col}" stroke-width="${(1.6 * u).toFixed(1)}" opacity=".55" stroke-linecap="round"/>`
        + `<path d="${d}" fill="none" stroke="${col}" stroke-width="${(4.5 * u).toFixed(1)}" stroke-linecap="round" stroke-dasharray="0 ${period.toFixed(1)}" style="filter:drop-shadow(0 0 ${(3 * u).toFixed(1)}px ${col})">${anim}</path>`;
    };
    const st = this._flowState(pv, grid);
    if (!st.col || this._config.flow_style === 'glow') return '';
    out.push(line(f.path, st.col, st.w, st.kind === 'import'));
    const [tx, ty] = f.top;
    out.push(`<circle cx="${tx}" cy="${ty}" r="${(8 * u).toFixed(1)}" fill="${st.col}" opacity=".25"/><circle cx="${tx}" cy="${ty}" r="${(3.5 * u).toFixed(1)}" fill="${st.col}" style="filter:drop-shadow(0 0 ${(4 * u).toFixed(1)}px ${st.col})"/>`);
    return out.join('');
  }

  // teruglevering: groen omlaag · eigen verbruik: blauw omlaag · afname: paars omhoog (kleuren als de Energiestroom-tegel)
  _flowState(pv, grid) {
    if (grid != null && grid < -5) return { kind: 'export', col: '#22d37f', w: -grid, text: 'Teruglevering', arrow: '↓' };
    if (grid != null && grid > 5) return { kind: 'import', col: '#a855f7', w: grid, text: 'Afname van het net', arrow: '↑' };
    if (pv > 5) return { kind: 'self', col: '#7aa7ff', w: pv, text: 'Eigen verbruik', arrow: '' };
    return { kind: 'idle', col: null, w: 0, text: 'Geen stroom', arrow: '' };
  }

  // som van de voorspellingssensoren (null als geen enkele beschikbaar is)
  _forecast() {
    const f = this._config.forecast || {};
    const sum = (ids) => { const v = (ids || []).map((id) => this._num(id)).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
    return { today: sum(f.today), remaining: sum(f.remaining), tomorrow: sum(f.tomorrow) };
  }

  /* ---------- statistics ---------- */

  async _fetchStats(force = false) {
    if (!this._hass || this._fetching) return;
    if (!force && this._fetchedAt && Date.now() - this._fetchedAt < 5 * 60000) return;
    this._fetching = true;
    const c = this._config;
    const now = Date.now();
    const day0 = startOfDay(now);
    try {
      const [today, days, peaks] = await Promise.all([
        this._hass.callWS({
          type: 'recorder/statistics_during_period',
          start_time: new Date(day0).toISOString(),
          end_time: new Date(now).toISOString(),
          statistic_ids: [c.solar_power],
          period: '5minute',
          types: ['mean', 'max'],
        }),
        this._hass.callWS({
          type: 'recorder/statistics_during_period',
          start_time: new Date(day0 - (c.days - 1) * DAY).toISOString(),
          end_time: new Date(now).toISOString(),
          statistic_ids: [c.solar_today],
          period: 'day',
          types: ['state', 'max'],
        }),
        // hoogste vermogen ooit gemeten (per maand, 3 jaar terug)
        this._hass.callWS({
          type: 'recorder/statistics_during_period',
          start_time: new Date(now - 3 * 365 * DAY).toISOString(),
          end_time: new Date(now).toISOString(),
          statistic_ids: [c.solar_power],
          period: 'month',
          types: ['max'],
        }).catch(() => ({})),
      ]);
      const kw = this._state(c.solar_power)?.attributes?.unit_of_measurement === 'kW' ? 1000 : 1;
      this._todayPts = (today[c.solar_power] || []).map((r) => ({
        t: ts(r.start) + 150000,
        v: (r.mean ?? r.max ?? 0) * kw,
        pk: (r.max ?? r.mean ?? 0) * kw,
      }));
      this._days = (days[c.solar_today] || []).map((r) => ({ t: startOfDay(ts(r.start)), v: r.state ?? r.max ?? 0 }));
      const pk = Math.max(0, ...(peaks?.[c.solar_power] || []).map((r) => (r.max || 0) * kw));
      this._peak = pk > 200 ? pk : null;
      // voorspelde opwekking per uur (zoals het Energie-dashboard die toont); optioneel
      try {
        const fc = await this._hass.callWS({ type: 'energy/solar_forecast' });
        const hours = new Map();
        for (const entry of Object.values(fc || {})) for (const [k, wh] of Object.entries(entry.wh_hours || {})) {
          const t = Date.parse(k);
          hours.set(t, (hours.get(t) || 0) + wh);
        }
        this._fcPts = fcPeriods(hours);
      } catch (e) {
        this._fcPts = [];
      }
    } catch (e) {
      console.warn('zonnepanelen-card: statistieken ophalen mislukt', e);
    } finally {
      this._fetching = false;
      this._fetchedAt = Date.now();
      this._update();
      this._drawCharts();
    }
  }

  _dayValues() {
    const c = this._config;
    const day0 = startOfDay(Date.now());
    const map = new Map(this._days.map((d) => [d.t, d.v]));
    const out = [];
    for (let i = c.days - 1; i >= 0; i--) {
      const d = new Date(day0);
      d.setDate(d.getDate() - i);
      const t = d.getTime();
      out.push({ t, v: i === 0 ? (this._num(c.solar_today) ?? map.get(t) ?? 0) : (map.get(t) ?? 0) });
    }
    return out;
  }

  // telefoon, grafiek Jaar: opbrengst per maand (12 maanden, de huidige maand tot nu)
  _monthValues() {
    if (!this._yearDays) { this._fetchYear(); return []; }
    const now = new Date(), out = [], today = this._num(this._config.solar_today), day0 = startOfDay(Date.now());
    for (let i = 11; i >= 0; i--) {
      const m0 = new Date(now.getFullYear(), now.getMonth() - i, 1).getTime(), m1 = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime();
      let v = this._yearDays.filter((d) => d.t >= m0 && d.t < m1 && d.t !== day0).reduce((s, d) => s + d.v, 0);
      if (i === 0) v += today ?? this._yearDays.find((d) => d.t === day0)?.v ?? 0;
      out.push({ t: m0, v });
    }
    return out;
  }
  async _fetchYear() {
    if (!this._hass || this._yearBusy || (this._yearAt && Date.now() - this._yearAt < HOUR)) return;
    this._yearBusy = true;
    const c = this._config, now = new Date(), start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    try {
      const r = await this._hass.callWS({ type: 'recorder/statistics_during_period', start_time: start.toISOString(), end_time: now.toISOString(),
        statistic_ids: [c.solar_today], period: 'day', types: ['state', 'max'] });
      this._yearDays = (r?.[c.solar_today] || []).map((x) => ({ t: startOfDay(ts(x.start)), v: x.max ?? x.state ?? 0 }));
      this._yearAt = Date.now();
    } catch (e) { this._yearDays = this._yearDays || []; }
    this._yearBusy = false;
    if (this._rng === 'jaar') this._drawDays();
  }

  /* ---------- charts ---------- */

  _drawCharts() {
    if (!this.shadowRoot || !this._hass) return;
    this._drawPhoto();
    this._drawnAt = Date.now();
    this._drawToday();
    this._drawDays();
  }

  _drawToday() {
    const el = this.$('chartToday');
    const W = el.clientWidth;
    if (!W) return;
    const H = 220, pad = { l: 42, r: 10, t: 12, b: 26 };
    const now = Date.now(), day0 = startOfDay(now);
    const pts = this._todayPts.filter((p) => p.t >= day0);
    const live = this._power(this._config.solar_power);
    if (live != null) pts.push({ t: now, v: live, pk: live });

    const fcPts = (this._fcPts || []).filter((p) => p.t >= day0 && p.t < day0 + DAY);
    const on = pts.concat(fcPts).filter((p) => p.v > 1).sort((a, b) => a.t - b.t);
    const phone = window.matchMedia('(max-width: 600px)').matches;
    let t0 = day0 + 6 * HOUR, t1 = day0 + 21 * HOUR;
    if (phone && on.length) {
      // telefoon: alleen het stuk van de dag met zon (een uur marge), en altijd tot nu
      t0 = day0 + Math.floor((on[0].t - day0) / HOUR - 1) * HOUR;
      const lastPv = pts.filter((p) => p.v > 1).map((p) => p.t).pop() || 0, lastFc = fcPts.filter((p) => p.v > 1).map((p) => p.e ?? p.t + HOUR / 2).pop() || 0;
      t1 = day0 + Math.ceil((Math.max(lastPv, lastFc, now) - day0) / HOUR) * HOUR;
    } else if (on.length) {
      t0 = Math.min(t0, day0 + Math.floor((on[0].t - day0) / HOUR) * HOUR);
      t1 = Math.max(t1, day0 + Math.ceil((on[on.length - 1].t - day0) / HOUR) * HOUR);
    }
    t0 = Math.max(t0, day0);
    t1 = Math.min(t1, day0 + DAY);
    const vis = pts.filter((p) => p.t >= t0 && p.t <= t1);
    const fcVis = fcPts.filter((p) => p.t >= t0 && p.t <= t1);
    const ymax = niceMax(Math.max(200, ...vis.map((p) => p.v), ...fcVis.map((p) => p.v)));
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const X = (t) => pad.l + ((t - t0) / (t1 - t0)) * iw;
    const Y = (v) => pad.t + (1 - v / ymax) * ih;

    let axes = '';
    for (let i = 0; i <= 4; i++) {
      const v = (ymax * i) / 4, y = Y(v).toFixed(1);
      axes += `<line class="gl" x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}"/>
        <text class="ax" x="${pad.l - 8}" y="${+y + 4}" text-anchor="end">${v >= 1000 ? fmt(v / 1000, v % 1000 ? 1 : 0) + 'k' : fmt(v)}</text>`;
    }
    const step = W < 500 ? 4 : 2;
    for (let t = t0; t <= t1; t += HOUR) {
      const h = new Date(t).getHours();
      if (h % step) continue;
      axes += `<text class="ax" x="${X(t).toFixed(1)}" y="${H - 6}" text-anchor="middle">${String(h).padStart(2, '0')}:00</text>`;
    }

    let line = '', area = '';
    if (vis.length > 1) {
      line = vis.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
      area = `${line}L${X(vis[vis.length - 1].t).toFixed(1)},${Y(0)}L${X(vis[0].t).toFixed(1)},${Y(0)}Z`;
    }
    let fcLine = '';
    if (fcVis.length > 1) {
      // telefoon: alleen zolang er zon verwacht wordt (de punten staan al in het midden van het uur), van begin tot eind van die uren
      const fon = fcVis.filter((p) => p.v > 1);
      const fp = phone && fon.length ? [{ t: fon[0].s ?? fon[0].t - HOUR / 2, v: 0 }, ...fon, { t: fon[fon.length - 1].e ?? fon[fon.length - 1].t + HOUR / 2, v: 0 }]
        : [{ t: t0, v: 0 }, ...fcVis, { t: t1, v: 0 }];
      fcLine = `<path d="${fp.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join('')}" fill="none" stroke="rgba(255,226,160,.75)" stroke-width="1.6" stroke-dasharray="5 5" stroke-linejoin="round"/>`;
    }
    let nowMark = '';
    if (live != null && now >= t0 && now <= t1) {
      const x = X(now).toFixed(1);
      nowMark = `<line x1="${x}" x2="${x}" y1="${pad.t}" y2="${Y(0)}" stroke="rgba(255,181,71,.35)" stroke-dasharray="2 4"/>
        <circle cx="${x}" cy="${Y(live).toFixed(1)}" r="9" fill="rgba(255,181,71,.18)"/>
        <circle cx="${x}" cy="${Y(live).toFixed(1)}" r="4.5" fill="#ffb547" stroke="#fff" stroke-width="1.5"/>`;
    }

    const peak = pts.reduce((m, p) => (p.pk > (m?.pk ?? -1) ? p : m), null);
    const fcToday = this._forecast().today;
    this.$('peak').innerHTML = (peak && peak.pk > 0 ? `<span class="pkinfo">Piek <b class="num">${fmt(peak.pk)} W</b> om ${fmtTime(peak.t)}</span>` : '')
      + (fcLine ? `<span class="fcleg"><i></i>verwacht${fcToday != null ? ` <b class="num">${fmt(fcToday, 1)} kWh</b>` : ''}</span>` : '');

    el.innerHTML = `
      <svg width="${W}" height="${H}">
        <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffb547" stop-opacity=".45"/><stop offset="1" stop-color="#ffb547" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="gl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff7a1a"/><stop offset="1" stop-color="#ffd36b"/></linearGradient></defs>
        ${axes}
        <path d="${area}" fill="url(#ga)"/>
        ${fcLine}
        <path d="${line}" fill="none" stroke="url(#gl)" stroke-width="2.2" stroke-linejoin="round"/>
        ${nowMark}
        <line class="cursor" y1="${pad.t}" y2="${Y(0)}"/>
        <circle class="hdot" r="4"/>
        <rect x="${pad.l}" y="0" width="${iw}" height="${H}" fill="transparent"/>
      </svg>
      <div class="tip"></div>
      ${vis.length > 1 ? '' : '<div class="empty">Nog geen opwekking vandaag</div>'}`;

    const svg = el.querySelector('svg'), tip = el.querySelector('.tip');
    const cur = el.querySelector('.cursor'), dot = el.querySelector('.hdot');
    svg.onmousemove = (e) => {
      if (!vis.length) return;
      const mx = e.clientX - svg.getBoundingClientRect().left;
      const p = vis.reduce((b, q) => (Math.abs(X(q.t) - mx) < Math.abs(X(b.t) - mx) ? q : b));
      const x = X(p.t), y = Y(p.v);
      cur.setAttribute('x1', x); cur.setAttribute('x2', x);
      dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      [cur, dot, tip].forEach((n) => n.classList.add('on'));
      tip.innerHTML = `<b>${fmt(p.v)} W</b>${fmtTime(p.t)}`;
      tip.style.left = `${clamp(x, 60, W - 60)}px`;
      tip.style.top = `${y}px`;
    };
    svg.onmouseleave = () => [cur, dot, tip].forEach((n) => n.classList.remove('on'));
  }

  _drawDays() {
    const el = this.$('chartDays');
    const W = el.clientWidth;
    if (!W) return;
    const H = 220, pad = { l: 34, r: 6, t: 12, b: 26 };
    const rng = window.matchMedia('(max-width: 600px)').matches ? this._rng || 'week' : 'maand';
    const days = rng === 'week' ? this._dayValues().slice(-7) : rng === 'jaar' ? this._monthValues() : this._dayValues();
    if (!days.length) { el.innerHTML = ''; return; }
    const N = days.length;
    const top = Math.max(2, ...days.map((d) => d.v)), st0 = (top * 1.08) / 4, e10 = 10 ** Math.floor(Math.log10(st0)), f10 = st0 / e10;
    const ymax = window.matchMedia('(max-width: 600px)').matches ? 4 * e10 * [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => x >= f10 - 1e-9) : niceMax(top);
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const band = iw / N, bw = Math.max(2, band * 0.64);
    const Y = (v) => pad.t + (1 - v / ymax) * ih;
    const past = days.slice(0, -1).filter((d) => d.v > 0);
    const avg = past.length ? past.reduce((s, d) => s + d.v, 0) / past.length : 0;
    const best = Math.max(...days.map((d) => d.v));

    let axes = '';
    for (let i = 0; i <= 4; i++) {
      const v = (ymax * i) / 4, y = Y(v).toFixed(1);
      axes += `<line class="gl" x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}"/>
        <text class="ax" x="${pad.l - 8}" y="${+y + 4}" text-anchor="end">${fmt(v, v % 1 ? 1 : 0)}</text>`;
    }
    let bars = '';
    days.forEach((d, i) => {
      const x = pad.l + i * band + (band - bw) / 2;
      const h = Math.max(d.v > 0 ? 2 : 0, Y(0) - Y(d.v));
      const isToday = i === N - 1;
      const fill = isToday ? 'url(#gbt)' : d.v === best && best > 0 ? 'rgba(144,238,144,.9)' : 'rgba(144,238,144,.4)';
      bars += `<rect class="bar" data-i="${i}" x="${x.toFixed(1)}" y="${(Y(0) - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(4, bw / 2)}" fill="${fill}"/>`;
      if (rng === 'week' && d.v > 0) bars += `<text class="ax bv" x="${(x + bw / 2).toFixed(1)}" y="${(Y(0) - h - 6).toFixed(1)}" text-anchor="middle">${fmt(d.v, 1)}</text>`;
      if (rng === 'week' || (rng === 'jaar' && ((N - 1 - i) % 3 === 0)) || (rng === 'maand' && (N - 1 - i) % 7 === 0 && (i === N - 1 || i < N - 5))) {
        const lbl = rng === 'jaar' ? (isToday ? 'Nu' : new Date(d.t).toLocaleDateString('nl-NL', { month: 'short' }).replace('.', ''))
          : rng === 'week' ? new Date(d.t).toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', '')
          : isToday ? 'Vandaag' : new Date(d.t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }).replace('.', '');
        bars += `<text class="ax" x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="${isToday && rng !== 'week' ? 'end' : 'middle'}">${lbl}</text>`;
      }
    });
    const avgLine = avg > 0 && !window.matchMedia('(max-width: 600px)').matches
      ? `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(avg).toFixed(1)}" y2="${Y(avg).toFixed(1)}" stroke="rgba(255,255,255,.45)" stroke-dasharray="4 4"/>
         <text class="ax" x="${W - pad.r}" y="${(Y(avg) - 6).toFixed(1)}" text-anchor="end" style="fill:#cfd5e0">gem. ${fmt(avg, 1)}</text>`
      : '';

    el.innerHTML = `
      <svg width="${W}" height="${H}">
        <defs><linearGradient id="gbt" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#5fd38d"/><stop offset="1" stop-color="#c6ffb3"/></linearGradient></defs>
        ${axes}${bars}${avgLine}
        <rect x="${pad.l}" y="0" width="${iw}" height="${H}" fill="transparent"/>
      </svg>
      <div class="tip"></div>`;
    const msum = this.$('msum');
    if (msum) msum.innerHTML = `Totaal <b class="num">${fmt(days.reduce((s, d) => s + d.v, 0))} kWh</b> · gem. ${fmt(avg, 1)}${rng === 'jaar' ? ' per maand' : ' per dag'} · beste ${fmt(best, 1)}`;

    const svg = el.querySelector('svg'), tip = el.querySelector('.tip');
    const rects = [...el.querySelectorAll('.bar')];
    svg.onmousemove = (e) => {
      const mx = e.clientX - svg.getBoundingClientRect().left;
      const i = clamp(Math.floor((mx - pad.l) / band), 0, N - 1);
      const d = days[i];
      rects.forEach((r, j) => (r.style.opacity = j === i ? 1 : 0.45));
      tip.classList.add('on');
      tip.innerHTML = `<b>${fmt(d.v, 1)} kWh</b>${new Date(d.t).toLocaleDateString('nl-NL', rng === 'jaar' ? { month: 'long', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' })}`;
      tip.style.left = `${clamp(pad.l + i * band + band / 2, 70, W - 70)}px`;
      tip.style.top = `${Y(d.v)}px`;
    };
    svg.onmouseleave = () => { tip.classList.remove('on'); rects.forEach((r) => (r.style.opacity = '')); };
  }
}

customElements.define('zonnepanelen-card', ZonnepanelenCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: 'zonnepanelen-card', name: 'Zonnepanelen', description: 'Compleet zonnepanelen-dashboard' });

/* =====================================================================
 * Verbruik card — stroom, gas en water van de P1- en watermeter
 * ===================================================================== */

const CARD_VERSION = '239';
// telefoon: de balk boven (achter klok en batterij) in dezelfde kleur als het dashboard, op elk tabblad.
// HA zet de themakleuren terug bij laden, wisselen van tabblad of thema; daarom houden we het in de gaten en zetten we het direct opnieuw.
(() => {
  const mq = window.matchMedia('(max-width: 600px)'), root = document.documentElement;
  let BG = '#f6f7fb';
  const VARS = ['--app-header-background-color', '--primary-background-color', '--lovelace-background'];
  let busy = false;
  const apply = () => {
    if (busy) return; busy = true;
    try {
      const cards = [...THEME_CARDS].filter((c) => c.isConnected);
      if (cards.length) BG = cards.some((c) => c.hasAttribute('data-th')) ? '#f6f7fb' : '#0a111d';
      const bgRgb = BG === '#0a111d' ? 'rgb(10, 17, 29)' : 'rgb(246, 247, 251)';
      let meta = document.querySelector('meta[name="theme-color"]');
      if (mq.matches) {
        if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
        if (meta.content !== BG) { meta.dataset.thuisOld = meta.dataset.thuisOld || meta.content; meta.content = BG; }
        VARS.forEach((v) => { if (root.style.getPropertyValue(v).trim() !== BG) root.style.setProperty(v, BG); });
        if (root.style.backgroundColor !== bgRgb) root.style.backgroundColor = BG;
        if (document.body && document.body.style.backgroundColor !== bgRgb) document.body.style.backgroundColor = BG;
      } else if (['#0a111d', '#f6f7fb'].includes(root.style.getPropertyValue('--app-header-background-color').trim())) {
        VARS.forEach((v) => root.style.removeProperty(v)); root.style.backgroundColor = '';
        if (document.body) document.body.style.backgroundColor = '';
        if (meta?.dataset.thuisOld) meta.content = meta.dataset.thuisOld;
      }
    } finally { busy = false; }
  };
  chromeApply = apply;
  mq.addEventListener?.('change', apply); apply();
  new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ['style'] });
  new MutationObserver(apply).observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] });
  window.addEventListener('location-changed', () => setTimeout(apply, 0));
  window.addEventListener('popstate', () => setTimeout(apply, 0));
  document.addEventListener('visibilitychange', apply);
  [500, 1500, 4000, 10000].forEach((t) => setTimeout(apply, t));
})();
console.info(`%c THUIS-ENERGIE-KAART %c v${CARD_VERSION} `, 'background:#ffb547;color:#000;font-weight:700', 'background:#222;color:#fff');

const VDEFAULTS = {
  title: 'Verbruik',
  power: null,
  import: null,
  export: null,
  gas: null,
  tariff: null,
  water: null,
  water_flow: null,
  solar_power: 'sensor.ecu_current_power',
  charger_energy: 'sensor.laadpaal_meterwaarde', // laadpaal; leeg laten als je er geen hebt
  fuse: 35,
  phases: 1,
  voltage: 230,
  contract: 'vast contract',
  // nutsmeters (utility_meter) van Home Assistant voor dag- en maandtotalen; worden gebruikt als ze bestaan
  meters: {
    day: {
      import: 'sensor.stroom_afname_vandaag', export: 'sensor.stroom_teruglevering_vandaag',
      gas: 'sensor.gas_vandaag', water: 'sensor.water_vandaag',
    },
    month: {
      import: 'sensor.stroom_afname_maand', export: 'sensor.stroom_teruglevering_maand',
      gas: 'sensor.gas_maand', water: 'sensor.water_maand',
    },
  },
  // prijzen per kWh / m³; null = uit het Energie-dashboard halen
  prices: { import: 0.243706, export: 0.243706, gas: 1.322966, water: null },
  // vaste kosten: stroom en gas per dag, terugleverkosten per jaar
  fixed: { electricity_day: -0.121406, gas_day: 1.014447, export_year: 231 },
};

const VSTYLE = `
:host { --imp: #a855f7; --exp: #22d37f; --gas: #f0245a; --water: #38bdf8; }
.vwrap { background: radial-gradient(900px 420px at 12% -8%, rgba(168,85,247,.08), transparent 65%), var(--bg); }
/* telefoon: Vandaag als tegels en een compact Net nu */
.mtoday { display: none; } .nwv { display: contents; } .nst { display: none; }
@media (max-width: 600px) {
  .vwrap .grid > .tile.s8:first-child { background: none; border: 0; box-shadow: none; padding: 0; }
  .vwrap .grid > .tile.s8:first-child > .th { margin: 0 4px 10px; }
  .vwrap .todaywrap { display: none; }
  .mtoday { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .mt { padding: 12px 14px; border-radius: 20px; background: linear-gradient(180deg, var(--tile2), var(--tile)); border: 1px solid rgba(110,150,240,.2); box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 0 18px -10px rgba(110,150,240,.6); cursor: pointer; min-width: 0; }
  .mt .mk { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--muted); } .mt .mk .gl3 { width: 18px; height: 18px; }
  .mt .mk .eu { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: 11px; font-weight: 800; color: #1a2a12; background: linear-gradient(180deg, #c6f5d6, #4fd07f 55%, #22a35a); }
  .mt .mv { font-size: 28px; font-weight: 700; letter-spacing: -.02em; margin-top: 6px; line-height: 1.1; white-space: nowrap; } .mt .mv small { font-size: 13px; color: var(--muted); font-weight: 500; margin-left: 3px; }
  .mt .ms { font-size: 12px; color: var(--muted); margin-top: 4px; line-height: 1.35; } .mt .ms b { color: var(--text); font-weight: 600; }
  .nwv { display: block; } .nst { display: block; font-size: 13.5px; color: #cfd5e0; margin-top: 4px; }
  #netState { display: none; } .vwrap .bigv { font-size: 44px; } .vwrap .bidir { margin: 16px 0 6px; }
  .vwrap .tile { padding: 16px 18px; border-radius: 20px; } .vwrap .grid { gap: 14px; }
}
@media (max-width: 600px) { .vwrap { background: radial-gradient(520px 360px at 12% 300px, rgba(168,85,247,.08), transparent 70%), var(--bg) !important; } }
.gl3 { width: 34px; height: 34px; flex: none; overflow: visible; }
.gl3.sm { width: 30px; height: 30px; } .gl3.xs { width: 20px; height: 20px; } .gl3.lg { width: 50px; height: 50px; }
.netrow { display: flex; align-items: center; gap: 14px; cursor: pointer; }
.rcol { display: flex; flex-direction: column; gap: 16px; } .rcol > .tile { flex: none; }
.flow { padding: 14px 0 4px; border-top: 1px solid var(--line); } .flow:first-of-type { border-top: 0; padding-top: 0; }
.fh { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.fv { display: flex; align-items: baseline; gap: 5px; font-weight: 600; } .fv b { font-size: 24px; } .fv small { font-size: 12.5px; color: var(--muted); font-weight: 500; margin-left: 2px; }
.fn { margin-left: auto; font-size: 12.5px; color: var(--muted); }
.fc { position: relative; height: 150px; touch-action: pan-y; } .fc svg { display: block; overflow: visible; }
.col .v .ar { font-size: 16px; margin-right: 4px; } .col .v .ar ~ .ar { margin-left: 12px; }
.col .e span { color: var(--muted); font-size: 12.5px; margin-left: 8px; }
h1.v svg:not(.hi) { stroke: var(--home); filter: drop-shadow(0 0 10px rgba(120,160,255,.6)); }
.tile { display: flex; flex-direction: column; padding: 22px 24px; }
.th { margin-bottom: 18px; }
.dotc { width: 8px; height: 8px; border-radius: 50%; background: var(--c); box-shadow: 0 0 8px var(--c); display: inline-block; flex: none; }
.ic { flex: none; width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 13%, transparent); }
.ic svg { width: 18px; height: 18px; stroke: var(--c); fill: none; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }

.today { display: grid; grid-template-columns: 1.25fr 1fr 1fr; }
.col { padding: 0 24px; border-left: 1px solid var(--line); min-width: 0; cursor: pointer; }
.col:first-child { padding-left: 0; border-left: 0; }
.col .k { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--muted); }
.col .v { font-size: 38px; font-weight: 600; letter-spacing: -.02em; margin-top: 14px; line-height: 1; white-space: nowrap; }
.col .v small { font-size: 16px; color: var(--muted); font-weight: 500; margin-left: 5px; letter-spacing: 0; }
.col .e { font-size: 15px; color: #cfd5e0; margin-top: 8px; font-variant-numeric: tabular-nums; }
.total { display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid var(--line); margin-top: auto; padding-top: 16px; font-size: 14px; color: var(--muted); }
.total b { font-size: 22px; color: var(--text); font-weight: 600; }
.todaywrap { display: flex; flex-direction: column; gap: 22px; flex: 1; }

.bigv { font-size: 52px; font-weight: 600; letter-spacing: -.03em; line-height: 1; cursor: pointer; }
.bigv small { font-size: 18px; color: var(--muted); font-weight: 500; margin-left: 6px; letter-spacing: 0; }
.state { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; margin-top: 10px; color: #cfd5e0; }
.bidir { position: relative; height: 8px; border-radius: 99px; background: rgba(255,255,255,.06); margin: 22px 0 8px; }
.bidir i { position: absolute; top: 0; bottom: 0; border-radius: 99px; transition: width 1s; }
.bidir::after { content: ''; position: absolute; left: 50%; top: -5px; bottom: -5px; width: 2px; background: rgba(255,255,255,.3); }
.scale { display: flex; justify-content: space-between; font-size: 11px; color: var(--faint); }
.mini { display: flex; justify-content: space-between; align-items: baseline; margin-top: auto; padding-top: 18px; font-size: 13px; color: var(--muted); }
.mini b { color: var(--text); font-weight: 600; }
.thin { height: 4px; border-radius: 99px; background: rgba(255,255,255,.06); overflow: hidden; margin-top: 8px; }
.thin i { display: block; height: 100%; border-radius: 99px; transition: width 1s, background 1s; }

.check { display: grid; grid-template-columns: 34px 1fr auto; cursor: default; gap: 12px; align-items: center; padding: 14px 0; border-top: 1px solid var(--line); }
.check:first-child { border-top: 0; padding-top: 0; }
.check .t { font-size: 14px; } .check .s { font-size: 12.5px; color: var(--muted); margin-top: 2px; }
.check .r { font-size: 15px; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }

.seg { display: inline-flex; gap: 4px; padding: 3px; border-radius: 99px; background: rgba(255,255,255,.04); border: 1px solid var(--line); }
.seg button { all: unset; cursor: pointer; font-size: 12.5px; padding: 5px 12px; border-radius: 99px; color: var(--muted); }
.seg button.on { background: rgba(255,255,255,.08); color: var(--text); }

.month { display: grid; grid-template-columns: auto 1fr; gap: 22px; align-items: center; }
.mrow { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; font-size: 13.5px; padding: 7px 0; }
.mrow b { font-weight: 600; font-variant-numeric: tabular-nums; }

@media (max-width: 760px) {
  .today { grid-template-columns: 1fr; gap: 18px; }
  .col { padding: 18px 0 0; border-left: 0; border-top: 1px solid var(--line); }
  .col:first-child { padding-top: 0; border-top: 0; }
  .col .v { font-size: 34px; margin-top: 10px; }
  .bigv { font-size: 44px; }
}
`;



class VerbruikCard extends HTMLElement {
  setConfig(config) {
    applyTheme(this, config);
    this._config = { ...VDEFAULTS, ...config,
      prices: { ...VDEFAULTS.prices, ...(config.prices || {}) },
      fixed: { ...VDEFAULTS.fixed, ...(config.fixed || {}) } };
    this._h = {};
    this._run = {};
    this._mono = {};
    this._fetchedAt = 0;
    this._prefPrices = {};
    this._mode = this._mode || 'stroom';
    this._build();
    if (this._hass) this._update();
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
    this._fetch();
  }

  getCardSize() { return 12; }
  getGridOptions() { return { columns: 'full' }; }
  static getStubConfig() { return {}; }
  connectedCallback() { this._timer = setInterval(() => this._fetch(), 60000); }
  disconnectedCallback() { clearInterval(this._timer); }

  $(id) { return this.shadowRoot.getElementById(id); }
  _state(id) { return this._hass?.states[id]; }
  _num(id) { const v = parseFloat(this._state(id)?.state); return isNaN(v) ? null : v; }
  // meterstand; valt de meter heel even weg, dan de laatst bekende stand gebruiken
  _meter(id) {
    const v = this._num(id);
    if (v != null) (this._lastCur ||= {})[id] = v;
    return v ?? this._lastCur?.[id] ?? null;
  }
  _price(k) { return this._config.prices[k] ?? this._prefPrices[k] ?? null; }
  _moreInfo(entityId) { this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true })); }

  /* ---------- markup ---------- */

  _build() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const c = this._config;
    const flow = (k, icon, label) => `
              <div class="flow">
                <div class="fh">${gl(icon, 'sm')}<div class="fv num" id="fv${k}"></div><span class="fn" id="fn${k}">${label}</span></div>
                <div class="fc" id="fc${k}"></div>
              </div>`;
    this.shadowRoot.innerHTML = `
      <style>${STYLE}${VSTYLE}${LIGHT}</style>
      ${GLOSSY}
      <div class="wrap vwrap"><div class="inner">
        ${headerHtml('verbruik')}
        <div class="grid">
          <div class="tile s8">
            <div class="th"><span class="label">Vandaag</span><span class="aside" id="upto"></span></div>
            <div class="todaywrap">
              <div class="today">
                <div class="col" data-e="${c.import}">
                  <div class="k">${gl('gBolt')}Stroom</div>
                  <div class="v num" id="tNet">—</div>
                  <div class="e" id="tNetE"></div>
                </div>
                <div class="col" data-e="${c.gas}">
                  <div class="k">${gl('gFlame')}Gas</div>
                  <div class="v num" id="tGas">—</div>
                  <div class="e" id="tGasE"></div>
                </div>
                <div class="col" data-e="${c.water}">
                  <div class="k">${gl('gDrop')}Water</div>
                  <div class="v num" id="tWat">—</div>
                  <div class="e" id="tWatE"></div>
                </div>
              </div>
              <div class="total"><span>Totaal vandaag, incl. vaste kosten</span><b class="num" id="tTot">—</b></div>
            </div>
            <div class="mtoday">
              <div class="mt" data-e="${c.import}"><div class="mk">${gl('gBolt', 'xs')}Stroom</div><div class="mv num" id="mtNet">—</div><div class="ms" id="mtNetS"></div></div>
              <div class="mt" data-e="${c.gas}"><div class="mk">${gl('gFlame', 'xs')}Gas</div><div class="mv num" id="mtGas">—</div><div class="ms" id="mtGasS"></div></div>
              <div class="mt" data-e="${c.water}"><div class="mk">${gl('gDrop', 'xs')}Water</div><div class="mv num" id="mtWat">—</div><div class="ms" id="mtWatS"></div></div>
              <div class="mt"><div class="mk"><i class="eu">€</i>Kosten vandaag</div><div class="mv num" id="mtTot">—</div><div class="ms" id="mtTotS"></div></div>
            </div>
          </div>

          <div class="tile s4">
            <div class="th"><span class="label">Net nu</span><span class="aside" id="homeNow"></span></div>
            <div class="netrow" data-e="${c.power}"><svg class="gl3 lg" viewBox="0 0 100 100" id="netIc"></svg><div class="nwv"><div class="bigv num" id="netNow">—</div><div class="nst" id="netState2"></div></div></div>
            <div class="state" id="netState"></div>
            <div class="bidir"><i id="bidir"></i></div>
            <div class="scale"><span>← terug</span><span>0</span><span>af →</span></div>
            <div class="mini"><span>Aansluiting</span><span id="amp"></span></div>
            <div class="thin"><i id="ampBar"></i></div>
          </div>

          <div class="tile s8">
            <div class="th"><span class="label">Verloop</span>
              <span class="seg" id="pseg"><button data-p="dag">Dag</button><button data-p="week">Week</button><button data-p="maand">Maand</button><button data-p="jaar">Jaar</button></span></div>
            ${flow('S', 'gBolt', '')}
            ${flow('G', 'gFlame', '')}
            ${flow('W', 'gDrop', '')}
          </div>

          <div class="s4 rcol">
            <div class="tile">
              <div class="th"><span class="label">Bewaking</span><span class="aside" id="watchNote"></span></div>
              <div>
                <div class="check">${gl('gPlug')}<div><div class="t">Sluipverbruik</div><div class="s" id="baseS"></div></div><div class="r" id="baseR">—</div></div>
                <div class="check" data-e="${c.water_flow}">${gl('gDrop')}<div><div class="t">Waterlek</div><div class="s" id="leakS"></div></div><div class="r" id="leakR">—</div></div>
                <div class="check" data-e="${c.power}">${gl('gGauge')}<div><div class="t">Aansluiting</div><div class="s" id="peakS"></div></div><div class="r" id="peakR">—</div></div>
              </div>
            </div>

            <div class="tile">
              <div class="th"><span class="label" id="monthName">Deze maand</span><span class="aside">t/m vandaag</span></div>
              <div class="month">
                <svg width="120" height="120" viewBox="0 0 42 42" id="donut"></svg>
                <div>
                  <div class="mrow">${gl('gBolt', 'xs')}<span>Stroom</span><b id="mElec">—</b></div>
                  <div class="mrow">${gl('gFlame', 'xs')}<span>Gas</span><b id="mGas">—</b></div>
                  <div class="mrow">${gl('gDrop', 'xs')}<span>Water</span><b id="mWat">—</b></div>
                </div>
              </div>
              <div class="mini" style="border-top:1px solid var(--line);margin-top:18px;padding-top:14px"><span>Zonnestroom zelf gebruikt</span><b class="num" id="mSelf">—</b></div>
            </div>
          </div>
        </div>
      </div></div>`;
    this.shadowRoot.querySelectorAll('[data-e]').forEach((n) =>
      n.addEventListener('click', (e) => { e.stopPropagation(); this._moreInfo(n.dataset.e); }));
    this.shadowRoot.querySelectorAll('#pseg button').forEach((b) => b.addEventListener('click', () => { this._period = b.dataset.p; this._drawFlow(); }));
    ['S', 'G', 'W'].forEach((k) => {
      const el = this.$('fc' + k);
      el.addEventListener('pointermove', (ev) => this._hover(el, ev));
      el.addEventListener('pointerleave', () => this._hover(el, null));
    });
    bindNav(this.shadowRoot);
    this._ro?.disconnect();
    this._ro = new ResizeObserver(() => this._draw());
    this._ro.observe(this.$('fcS'));
  }

  /* ---------- data ---------- */

  async _fetch(force = false) {
    if (!this._hass || this._fetching) return;
    const now = Date.now(), day0 = startOfDay(now);
    if (!force && this._fetchedAt && now - this._fetchedAt < 5 * 60000) return;
    this._fetching = true;
    const c = this._config;
    const m0 = new Date(day0); m0.setDate(1);
    const start = Math.min(m0.getTime(), day0 - 14 * DAY) - 2 * HOUR;
    if (this._dayKey !== day0) { this._dayKey = day0; this._mono = {}; }
    // nooit eindeloos wachten op een antwoord van Home Assistant
    const ws = (msg, ms = 15000) => Promise.race([
      this._hass.callWS(msg),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout ' + msg.type)), ms)),
    ]);
    const ids = [c.import, c.export, c.gas, c.water, c.power, c.solar_power, c.charger_energy].filter(Boolean);
    try {
      // 2. uurstatistiek voor grafieken, vorige dagen en de maand
      const res = await ws({
        type: 'recorder/statistics_during_period',
        start_time: new Date(start).toISOString(), end_time: new Date(now).toISOString(),
        statistic_ids: ids, period: 'hour', types: ['change', 'state', 'mean', 'min', 'max'],
      }, 20000);
      const h = {};
      // maximaal plausibel verbruik per uur; grotere sprongen zijn meterresets of herverbindingen
      const kwhCap = (c.fuse * c.voltage * c.phases) / 1000;
      const cap = { [c.import]: kwhCap, [c.export]: kwhCap, [c.charger_energy]: kwhCap, [c.gas]: 6, [c.water]: 2 };
      for (const id of ids) h[id] = (res[id] || []).map((r) => ({
        t: ts(r.start), state: r.state, mean: r.mean, min: r.min, max: r.max,
        change: r.change != null && cap[id] != null && (r.change < 0 || r.change > cap[id]) ? 0 : r.change,
      }));
      this._h = h;

      // 5-minutenwaarden van vandaag voor de daggrafieken
      const ids5 = [c.power, c.gas, c.water].filter(Boolean);
      const r5 = await ws({
        type: 'recorder/statistics_during_period',
        start_time: new Date(day0).toISOString(), end_time: new Date(now).toISOString(),
        statistic_ids: ids5, period: '5minute', types: ['mean', 'change'],
      }, 20000);
      const cap5 = { [c.gas]: 0.5, [c.water]: 0.2 };
      this._m5 = Object.fromEntries(ids5.map((id) => [id, (r5[id] || []).map((r) => ({
        t: ts(r.start), mean: r.mean,
        change: r.change != null && cap5[id] != null && (r.change < 0 || r.change > cap5[id]) ? 0 : r.change,
      }))]));

      // maandtotalen van dit jaar voor de jaarweergave
      const idsM = [c.import, c.export, c.gas, c.water].filter(Boolean);
      const y0 = new Date(new Date(day0).getFullYear(), 0, 1).getTime();
      const rM = await ws({
        type: 'recorder/statistics_during_period',
        start_time: new Date(y0).toISOString(), end_time: new Date(now).toISOString(),
        statistic_ids: idsM, period: 'month', types: ['change'],
      }, 20000);
      this._mon = Object.fromEntries(idsM.map((id) => [id, (rM[id] || []).map((r) => ({ t: ts(r.start), change: r.change }))]));

      // 3. prijzen uit het Energie-dashboard (eenmalig)
      if (!this._prefsLoaded) {
        try {
          const prefs = await ws({ type: 'energy/get_prefs' }, 10000);
          this._prefsLoaded = true;
          for (const src of prefs.energy_sources || []) {
            if (src.type === 'water' && src.number_energy_price != null) this._prefPrices.water = src.number_energy_price;
            if (src.type === 'gas' && src.number_energy_price != null) this._prefPrices.gas = src.number_energy_price;
            if (src.type === 'grid') {
              const f = (src.flow_from || [])[0], t = (src.flow_to || [])[0];
              if (f?.number_energy_price != null) this._prefPrices.import = f.number_energy_price;
              if (t?.number_energy_price != null) this._prefPrices.export = t.number_energy_price;
            }
          }
        } catch (e) { /* prijzen uit de config gebruiken */ }
      }
    } catch (e) {
      console.warn('verbruik-card: statistieken ophalen mislukt', e);
    } finally {
      this._fetching = false;
      this._fetchedAt = Date.now();
      this._update();
      this._draw();
    }
  }

  // verbruik in [van, tot). Loopt de periode tot nu: live meterstand min de stand aan het begin.
  // Anders: som van de uurwaarden (met sprongen eruit gefilterd).
  // totaal van een nutsmeter, alleen als die de hele periode heeft meegeteld
  _utility(id, period, start) {
    const c = this._config, key = ['import', 'export', 'gas', 'water'].find((k) => c[k] === id);
    const ent = key && c.meters?.[period]?.[key];
    const st = ent && this._state(ent);
    if (!st) return null;
    const v = parseFloat(st.state), lr = Date.parse(st.attributes?.last_reset);
    if (isNaN(v) || isNaN(lr) || lr > start + 5 * 60000) return null;   // pas sinds vandaag/deze maand aangemaakt
    const unit = st.attributes?.unit_of_measurement;
    return unit === 'L' ? v / 1000 : unit === 'Wh' ? v / 1000 : v;
  }

  // `now` is het moment van de lopende update; de aanroeper geeft het door zodat "loopt de periode nog?"
  // niet afhangt van de milliseconden die de update zelf kost
  _sum(id, from, to, now = Date.now()) {
    if (!id) return 0;
    if (to > now) {
      const day0 = startOfDay(now), m0 = new Date(day0); m0.setDate(1);
      const u = from === day0 ? this._utility(id, 'day', day0) : from === m0.getTime() ? this._utility(id, 'month', m0.getTime()) : null;
      if (u != null) return u;
    }
    // alleen afgeronde uren; een half uur dat Home Assistant soms meelevert, wordt genegeerd
    const rows = (this._h[id] || []).filter((r) => r.t + HOUR <= now);
    let s = 0, last = null;
    for (const r of rows) {
      if (r.t >= from && r.t < to) s += r.change || 0;
      if (r.state != null && (last == null || r.t > last.t)) last = r;
    }
    // lopende periode: aanvullen met de live meterstand sinds het laatste afgeronde uur
    if (to > now && last) {
      const cur = this._meter(id), endLast = last.t + HOUR;
      if (cur != null && endLast >= from) s += Math.max(0, cur - last.state);
    }
    if (to > now && from === startOfDay(now)) {
      const key = `${id}|${from}`;
      this._mono[key] = Math.max(this._mono[key] ?? 0, s);
      return this._mono[key];
    }
    return s;
  }

  _hourly(id, field, from, n) {
    const map = new Map((this._h[id] || []).map((r) => [r.t, r[field]]));
    return Array.from({ length: n }, (_, i) => map.get(from + i * HOUR) ?? null);
  }

  _solarKwh(from, to) {
    return (this._h[this._config.solar_power] || []).filter((r) => r.t >= from && r.t < to).reduce((s, r) => s + (r.mean || 0) / 1000, 0);
  }

  _baseload() {
    const rows = this._h[this._config.power] || [], nights = [], day0 = startOfDay(Date.now());
    for (let d = 13; d >= 0; d--) {
      const n0 = day0 - d * DAY;
      const v = rows.filter((r) => r.t >= n0 + HOUR && r.t < n0 + 5 * HOUR && r.min != null).map((r) => r.min);
      if (v.length) nights.push(Math.max(0, Math.min(...v)));
    }
    return nights;
  }

  _dayStarts(n) {
    const day0 = startOfDay(Date.now());
    return Array.from({ length: n }, (_, i) => { const d = new Date(day0); d.setDate(d.getDate() - (n - 1 - i)); return d.getTime(); });
  }

  /* ---------- live waarden ---------- */

  _update() {
    if (!this._hass || !this.shadowRoot) return;
    const c = this._config;
    const set = (id, html) => { const el = this.$(id); if (el && el.innerHTML !== html) el.innerHTML = html; };
    const eur = (v) => (v == null ? '—' : `${v < -0.004 ? '− ' : ''}€ ${fmt(Math.abs(v), 2)}`);
    const now = Date.now(), day0 = startOfDay(now), frac = (now - day0) / DAY;
    const pi = this._price('import'), pe = this._price('export'), pg = this._price('gas'), pw = this._price('water');
    const fx = c.fixed;

    set('date', new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

    // vandaag
    const dImp = this._sum(c.import, day0, now + 1, now), dExp = this._sum(c.export, day0, now + 1, now);
    const dGas = this._sum(c.gas, day0, now + 1, now), dWat = this._sum(c.water, day0, now + 1, now);
    const eNet = pi != null ? dImp * pi - (pe != null ? dExp * pe : 0) : null;
    const dNet = dImp - dExp;
    const ar = (col, v, dec) => `<span class="ar" style="color:${col}">↓</span><span style="color:${col}">${fmt(v, dec)}</span>`;
    set('tNet', `${ar('var(--imp)', dImp, 1)}<span class="ar" style="color:var(--exp)">↑</span><span style="color:var(--exp)">${fmt(dExp, 1)}</span><small>kWh</small>`);
    set('tNetE', `${eur(eNet)}<span>netto ${fmt(Math.abs(dNet), 1)} kWh ${dNet < 0 ? 'teruggeleverd' : 'afgenomen'}</span>`);
    const eGas = pg != null ? dGas * pg : null;
    const yGas = this._sum(c.gas, day0 - DAY, now - DAY, now);
    set('tGas', `${ar('var(--gas)', dGas, 2)}<small>m³</small>`);
    set('tGasE', `${eur(eGas)}<span>gisteren ${fmt(yGas, 2)} m³</span>`);
    const eWat = pw != null ? dWat * pw : null;
    const wd = this._dayStarts(14).slice(0, -1).map((t) => this._sum(c.water, t, t + DAY)).filter((v) => v > 0);
    set('tWat', `${ar('var(--water)', dWat * 1000, 0)}<small>L</small>`);
    set('tWatE', `${eur(eWat)}${wd.length ? `<span>gemiddeld ${fmt(wd.reduce((a, b) => a + b, 0) / wd.length * 1000)} L per dag</span>` : ''}`);
    set('upto', `t/m ${fmtTime(now)}`);
    const fixedToday = frac * ((fx.electricity_day || 0) + (fx.gas_day || 0) + (fx.export_year || 0) / 365);
    set('tTot', eur((eNet || 0) + (eGas || 0) + (eWat || 0) + fixedToday));
    set('mtNet', `<span style="color:var(--imp)">${fmt(dImp, 1)}</span><small>kWh af</small>`);
    set('mtNetS', `<span style="color:var(--exp)">↑ ${fmt(dExp, 1)} kWh terug</span><br><b>${eur(eNet)}</b> · netto ${fmt(Math.abs(dNet), 1)}`);
    set('mtGas', `<span style="color:var(--gas)">${fmt(dGas, 2)}</span><small>m³</small>`);
    set('mtGasS', `<b>${eur(eGas)}</b><br>gisteren ${fmt(yGas, 2)} m³`);
    set('mtWat', `<span style="color:var(--water)">${fmt(dWat * 1000, 0)}</span><small>L</small>`);
    set('mtWatS', `<b>${eur(eWat)}</b>${wd.length ? `<br>gem. ${fmt(wd.reduce((a, b) => a + b, 0) / wd.length * 1000)} L per dag` : ''}`);
    set('mtTot', eur((eNet || 0) + (eGas || 0) + (eWat || 0) + fixedToday));
    set('mtTotS', `incl. <b>${eur(fixedToday)}</b> vaste kosten`);

    // net nu
    const p = this._num(c.power), pv = this._num(c.solar_power) || 0;
    const exp = p != null && p < -5, imp = p != null && p > 5;
    const sc = exp ? 'var(--exp)' : imp ? 'var(--imp)' : 'var(--home)';
    set('netNow', `<span style="color:${exp ? 'var(--exp)' : imp ? 'var(--imp)' : 'inherit'}">${p == null ? '—' : fmt(Math.abs(p))}</span><small>W</small>`);
    set('netIc', `<use href="#${exp ? 'gSun' : 'gBolt'}"/>`);
    set('netState', `<i class="dotc" style="--c:${sc}"></i>${exp ? 'Teruglevering aan het net' : imp ? 'Afname van het net' : 'In balans met het net'}`);
    set('netState2', exp ? 'Teruglevering aan het net' : imp ? 'Afname van het net' : 'In balans met het net');
    const hv = p == null ? null : p + pv;
    set('homeNow', hv == null || hv < -50 ? '' : `huis <b class="num">${fmt(Math.max(0, hv))} W</b>`);
    const bar = this.$('bidir'), w = clamp(Math.abs(p || 0) / 3000, 0, 1) * 50;
    bar.style.width = `${w}%`;
    bar.style.left = imp ? '50%' : 'auto';
    bar.style.right = exp ? '50%' : 'auto';
    bar.style.background = exp ? 'linear-gradient(270deg,#7ff0bd,var(--exp))' : 'linear-gradient(90deg,#d9b3ff,var(--imp))';
    const amps = Math.abs(p || 0) / c.voltage / c.phases, ampPct = amps / c.fuse;
    const ampCol = (x) => (x < 0.6 ? 'var(--exp)' : x < 0.8 ? 'var(--sun)' : 'var(--imp)');
    set('amp', `<b class="num">${fmt(amps, 1)} A</b> van ${c.fuse} A`);
    const ab = this.$('ampBar');
    ab.style.width = `${clamp(ampPct, 0, 1) * 100}%`;
    ab.style.background = ampCol(ampPct);

    // bewaking
    const nights = this._baseload().sort((a, b) => a - b);
    const base = nights.length ? (nights[(nights.length - 1) >> 1] + nights[nights.length >> 1]) / 2 : null;
    set('baseR', base == null ? '—' : `${fmt(base)} W`);
    set('baseS', base == null ? 'nog geen nachtmeting' : `≈ ${fmt(base * 8.76)} kWh${pi != null ? ` · ${eur(base * 8.76 * pi)}` : ''} per jaar`);
    const night = this._hourly(c.water, 'change', day0, Math.min(6, Math.max(0, Math.floor((now - day0) / HOUR))));
    let run = 0, best = 0;
    for (const v of night) { if (v != null && v < 0.001) { run++; best = Math.max(best, run); } else run = 0; }
    const leak = night.length >= 3 && best === 0;
    set('leakR', night.length < 3 ? '—' : leak ? '<span style="color:var(--sun)">Let op</span>' : '<span style="color:var(--exp)">Geen</span>');
    set('leakS', night.length < 3 ? 'controle na 03:00' : leak ? 'vannacht liep er elk uur water' : `vannacht ${best} uur zonder water`);
    const pk = (this._h[c.power] || []).filter((r) => r.t >= day0 && r.max != null).reduce((m, r) => (Math.abs(r.max) > Math.abs(m?.max ?? 0) ? r : m), null);
    const pkA = pk ? Math.abs(pk.max) / c.voltage / c.phases : null, pkPct = pkA != null ? pkA / c.fuse : null;
    set('peakR', pkPct == null ? '—' : `<span style="color:${ampCol(pkPct)}">${fmt(pkPct * 100)}%</span>`);
    set('peakS', pk ? `piek vandaag ${fmt(pkA, 1)} A rond ${fmtTime(pk.t)}` : 'nog geen piek gemeten');
    const issues = (leak ? 1 : 0) + (pkPct >= 0.8 ? 1 : 0);
    set('watchNote', issues ? `<span style="color:var(--sun)">${issues} aandachtspunt${issues > 1 ? 'en' : ''}</span>` : 'alles in orde');

    // deze maand
    const m0 = new Date(day0); m0.setDate(1);
    const ms = m0.getTime(), dm = (now - ms) / DAY;
    set('monthName', m0.toLocaleDateString('nl-NL', { month: 'long' }));
    const mImp = this._sum(c.import, ms, now + 1, now), mExp = this._sum(c.export, ms, now + 1, now);
    const mGas = this._sum(c.gas, ms, now + 1, now), mWat = this._sum(c.water, ms, now + 1, now);
    const cE = (pi != null ? mImp * pi : 0) - (pe != null ? mExp * pe : 0) + dm * (fx.electricity_day || 0) + (dm * (fx.export_year || 0)) / 365;
    const cG = pg != null ? mGas * pg + dm * (fx.gas_day || 0) : 0;
    const cW = pw != null ? mWat * pw : 0;
    set('mElec', eur(cE)); set('mGas', pg != null ? eur(cG) : '—'); set('mWat', pw != null ? eur(cW) : '—');
    const tot = Math.max(0, cE) + Math.max(0, cG) + Math.max(0, cW);
    let off = 25, ring = '<circle cx="21" cy="21" r="15.9" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="5"/>';
    for (const [v, col] of [[cE, 'var(--imp)'], [cG, 'var(--gas)'], [cW, 'var(--water)']]) {
      if (tot <= 0 || v <= 0) continue;
      const pct = (v / tot) * 100;
      ring += `<circle cx="21" cy="21" r="15.9" fill="none" stroke="${col}" stroke-width="5" pathLength="100" stroke-dasharray="${Math.max(0, pct - 1).toFixed(2)} ${(101 - pct).toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/>`;
      off -= pct;
    }
    ring += `<text x="21" y="20" text-anchor="middle" style="font-size:6.2px;font-weight:600;fill:#fff">€ ${fmt(tot)}</text><text x="21" y="26" text-anchor="middle" style="font-size:3.4px;fill:var(--muted)">totaal</text>`;
    set('donut', ring);
    const mSol = this._solarKwh(ms, now + 1);
    set('mSelf', mSol > 0.5 ? `${fmt(clamp((mSol - mExp) / mSol, 0, 1) * 100)}%` : '—');

    if (Date.now() - (this._drawnAt || 0) > 60000) this._draw();
  }

  /* ---------- grafieken ---------- */

  _draw() {
    if (!this.shadowRoot || !this._hass) return;
    this._drawnAt = Date.now();
    this._drawFlow();
  }

  // dagen van de gekozen periode (week: ma–zo, maand: 1–laatste dag)
  _periodDays(p) {
    const d0 = new Date(startOfDay(Date.now()));
    const first = new Date(d0);
    if (p === 'week') first.setDate(d0.getDate() - ((d0.getDay() + 6) % 7));
    else first.setDate(1);
    const n = p === 'week' ? 7 : new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => { const d = new Date(first); d.setDate(first.getDate() + i); return d.getTime(); });
  }

  _drawFlow() {
    const c = this._config, p = this._period || 'dag';
    if (!this.$('fcS')?.clientWidth || !this._hass) return;
    this.shadowRoot.querySelectorAll('#pseg button').forEach((b) => b.classList.toggle('on', b.dataset.p === p));
    const now = Date.now(), day0 = startOfDay(now);
    const head = (k, html, note) => { this.$('fv' + k).innerHTML = html; this.$('fn' + k).textContent = note; };
    const v1 = (col, v, dec, unit) => `<span style="color:${col}">↓</span><b style="color:${col}">${fmt(v, dec)}</b><small>${unit}</small>`;
    const v2 = (a, b) => `<span style="color:var(--imp)">↓</span><b style="color:var(--imp)">${fmt(a, 1)}</b><span style="color:var(--exp);margin-left:8px">↑</span><b style="color:var(--exp)">${fmt(b, 1)}</b><small>kWh</small>`;

    if (p === 'dag') {
      const m5 = this._m5 || {}, mid = 150000;
      const pw = (m5[c.power] || []).filter((r) => r.t >= day0 && r.mean != null).map((r) => ({ t: r.t + mid, v: r.mean }));
      const live = this._num(c.power);
      if (live != null) pw.push({ t: now, v: live, live: true });
      const per5 = (id, mul) => (m5[id] || []).filter((r) => r.t >= day0).map((r) => ({ t: r.t + mid, v: Math.max(0, (r.change || 0) * mul) }));
      head('S', v2(this._sum(c.import, day0, now + 1, now), this._sum(c.export, day0, now + 1, now)), 'vermogen · W');
      head('G', v1('var(--gas)', this._sum(c.gas, day0, now + 1, now), 2, 'm³'), 'per 5 minuten · m³');
      head('W', v1('var(--water)', this._sum(c.water, day0, now + 1, now) * 1000, 0, 'L'), 'per 5 minuten · liter');
      this._area('S', pw, { col: '#a855f7', neg: '#22d37f', dec: 0, unit: 'W', floor: 500, signed: true });
      this._area('G', per5(c.gas, 1), { col: '#f0245a', dec: 2, unit: 'm³', floor: 0.05 });
      this._area('W', per5(c.water, 1000), { col: '#38bdf8', dec: 0, unit: 'L', floor: 10 });
      return;
    }

    let labels, imp, exp, gas, wat, todayIdx = -1, wUnit = 'L', wMul = 1000;
    if (p === 'jaar') {
      const y = new Date(day0).getFullYear(), m0 = new Date(day0); m0.setDate(1);
      const cur = new Date(day0).getMonth();
      labels = Array.from({ length: 12 }, (_, i) => new Date(y, i, 1).toLocaleDateString('nl-NL', { month: 'short' }).replace('.', ''));
      const mon = (id) => Array.from({ length: 12 }, (_, i) => {
        if (i > cur) return null;
        if (i === cur) return this._sum(id, m0.getTime(), now + 1, now);
        const t = new Date(y, i, 1).getTime();
        const r = (this._mon?.[id] || []).find((x) => x.t === t);
        return r ? Math.max(0, r.change || 0) : 0;
      });
      imp = mon(c.import); exp = mon(c.export); gas = mon(c.gas); wat = mon(c.water);
      wUnit = 'm³'; wMul = 1; todayIdx = cur;
    } else {
      const days = this._periodDays(p), end = (t) => { const d = new Date(t); d.setDate(d.getDate() + 1); return d.getTime(); };
      const per = (id) => days.map((t) => (t > day0 ? null : this._sum(id, t, end(t), now)));
      imp = per(c.import); exp = per(c.export); gas = per(c.gas); wat = per(c.water);
      todayIdx = days.indexOf(day0);
      labels = p === 'week'
        ? days.map((t) => new Date(t).toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', ''))
        : days.map((t) => String(new Date(t).getDate()));
    }
    const sum = (a) => a.reduce((s, v) => s + (v || 0), 0);
    const note = { week: 'deze week', maand: new Date(day0).toLocaleDateString('nl-NL', { month: 'long' }), jaar: String(new Date(day0).getFullYear()) }[p];
    head('S', v2(sum(imp), sum(exp)), note);
    head('G', v1('var(--gas)', sum(gas), 1, 'm³'), note);
    head('W', v1('var(--water)', sum(wat) * wMul, wUnit === 'L' ? 0 : 1, wUnit), note);
    const showVals = p !== 'maand';
    this._bars('S', labels, [[imp, '#a855f7'], [exp, '#22d37f']], { dec: p === 'jaar' ? 0 : 1, todayIdx, showVals });
    this._bars('G', labels, [[gas, '#f0245a']], { dec: p === 'jaar' ? 0 : 1, todayIdx, showVals });
    this._bars('W', labels, [[wat.map((v) => (v == null ? null : v * wMul)), '#38bdf8']], { dec: 0, todayIdx, showVals });
  }

  // vloeiende lijn met kleurverloop (dagweergave), met cursor bij "nu" of onder de muis
  _area(k, pts, o) {
    const el = this.$('fc' + k), W = el.clientWidth, H = 150, pl = 4, pr = 46, pt = 12, pb = 22;
    const day0 = startOfDay(Date.now()), iw = W - pl - pr, ih = H - pt - pb;
    const vals = pts.map((q) => q.v), hi = Math.max(o.floor, ...vals, 0), lo = o.signed ? Math.min(0, ...vals) : 0;
    const max = niceMax(hi), min = lo < 0 ? -niceMax(Math.max(-lo, max * 0.15)) : 0;
    const X = (t) => pl + clamp((t - day0) / DAY, 0, 1) * iw, Y = (v) => pt + (1 - (v - min) / (max - min)) * ih, y0 = Y(0);
    const tk = (v) => fmt(v, v % 1 ? Math.max(o.dec, 1) : 0);
    let s = '', lastY = -99;
    // rasterlijnen; een label dat te dicht op het vorige staat, valt weg
    for (const v of [...new Set([max, max / 2, 0, min])]) {
      if (Math.abs(Y(v) - lastY) < 14) continue;
      lastY = Y(v);
      s += `<line class="gl" x1="${pl}" x2="${W - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="ax" x="${W - pr + 8}" y="${(Y(v) + 3.5).toFixed(1)}">${v < 0 ? '−' : ''}${tk(Math.abs(v))}</text>`;
    }
    for (let h = 4; h < 24; h += 4) s += `<text class="ax" x="${X(day0 + h * HOUR).toFixed(1)}" y="${H - 4}" text-anchor="middle">${String(h).padStart(2, '0')}:00</text>`;
    const xy = pts.map((q) => [X(q.t), Y(q.v)]);
    el._pts = pts.map((q, i) => ({ ...q, x: xy[i][0], y: xy[i][1] }));
    el._o = { ...o, H, pt, pb, W };
    if (xy.length > 1) {
      let d = `M${xy[0][0].toFixed(1)} ${xy[0][1].toFixed(1)}`;
      for (let i = 0; i < xy.length - 1; i++) {
        const p0 = xy[i - 1] || xy[i], p1 = xy[i], p2 = xy[i + 1], p3 = xy[i + 2] || p2;
        // knikpunten van een gat in de data niet afronden
        d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
      }
      const last = xy[xy.length - 1], fill = `${d} L${last[0].toFixed(1)} ${y0.toFixed(1)} L${xy[0][0].toFixed(1)} ${y0.toFixed(1)} Z`;
      s += `<defs><linearGradient id="a${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.col}" stop-opacity=".75"/><stop offset="1" stop-color="${o.col}" stop-opacity=".04"/></linearGradient>
        <linearGradient id="b${k}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${o.neg}" stop-opacity=".8"/><stop offset="1" stop-color="${o.neg}" stop-opacity=".08"/></linearGradient>
        <clipPath id="u${k}"><rect x="0" y="0" width="${W}" height="${y0.toFixed(1)}"/></clipPath><clipPath id="n${k}"><rect x="0" y="${y0.toFixed(1)}" width="${W}" height="${H}"/></clipPath></defs>
        <g clip-path="url(#u${k})"><path d="${fill}" fill="url(#a${k})"/><path d="${d}" stroke="${o.col}" stroke-width="2" fill="none" style="filter:drop-shadow(0 0 4px ${o.col})"/></g>`;
      if (o.neg) s += `<g clip-path="url(#n${k})"><path d="${fill}" fill="url(#b${k})"/><path d="${d}" stroke="${o.neg}" stroke-width="2" fill="none" style="filter:drop-shadow(0 0 4px ${o.neg})"/></g>`;
    }
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${s}<g class="hv"></g></svg>`;
    this._hover(el, null);
  }

  _hover(el, ev) {
    const pts = el._pts, o = el._o, g = el.querySelector('.hv');
    if (!g || !pts?.length) { if (g) g.innerHTML = ''; return; }
    let q = pts[pts.length - 1];
    if (ev) {
      const x = ev.clientX - el.getBoundingClientRect().left;
      q = pts.reduce((b, r) => (Math.abs(r.x - x) < Math.abs(b.x - x) ? r : b), q);
    }
    const t = q.live ? q.t : q.t - 150000;
    const neg = o.signed && q.v < 0, col = neg ? o.neg : o.col;
    const val = `${neg ? '↑' : '↓'} ${fmt(Math.abs(q.v), o.dec)} ${o.unit}`;
    const bx = clamp(q.x - 54, 0, o.W - 108);
    g.innerHTML = `<line x1="${q.x.toFixed(1)}" x2="${q.x.toFixed(1)}" y1="${o.pt}" y2="${o.H - o.pb}" stroke="rgba(255,255,255,.35)" stroke-dasharray="2 3"/>
      <circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="3.5" fill="${col}" stroke="#fff" stroke-width="1.5"/>
      <rect x="${bx.toFixed(1)}" y="${o.pt - 10}" width="108" height="34" rx="9" fill="rgba(14,18,25,.92)" stroke="rgba(255,255,255,.1)"/>
      <text x="${(bx + 54).toFixed(1)}" y="${o.pt + 4}" text-anchor="middle" class="ax" style="fill:#cfd5e0">${!ev && q.live ? 'Nu' : fmtTime(t)}</text>
      <text x="${(bx + 54).toFixed(1)}" y="${o.pt + 18}" text-anchor="middle" style="font-size:12px;font-weight:600;fill:${col}">${val}</text>`;
  }

  // dunne afgeronde staven met de waarde erboven (week, maand, jaar)
  _bars(k, labels, sets, o) {
    const el = this.$('fc' + k), W = el.clientWidth, H = 150, pl = 4, pr = 46, pt = 18, pb = 22;
    el._pts = null;
    const n = labels.length, iw = W - pl - pr, ih = H - pt - pb, band = iw / n;
    const all = sets.flatMap(([v]) => v.filter((x) => x != null));
    const max = niceMax(Math.max(0.1, ...all)), Y = (v) => pt + (1 - v / max) * ih;
    const bw = clamp(band * (sets.length > 1 ? 0.26 : 0.34), 3, 10), gap = sets.length > 1 ? clamp(band * 0.12, 2, 12) : 0;
    const tot = sets.length * bw + (sets.length - 1) * gap;
    let s = '';
    for (const v of [0, max / 2, max]) s += `<line class="gl" x1="${pl}" x2="${W - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="ax" x="${W - pr + 8}" y="${(Y(v) + 3.5).toFixed(1)}">${fmt(v, v % 1 ? 1 : 0)}</text>`;
    const every = n > 20 ? 5 : 1;
    labels.forEach((l, i) => {
      const cx = pl + band * i + band / 2, today = i === o.todayIdx;
      if (i % every === 0 || today) s += `<text class="ax" x="${cx.toFixed(1)}" y="${H - 4}" text-anchor="middle"${today ? ' style="fill:#fff"' : ''}>${l}</text>`;
      sets.forEach(([vals, col], j) => {
        const v = vals[i];
        if (v == null) return;
        const x = cx - tot / 2 + j * (bw + gap), h = Math.max(v > 0 ? 2 : 0, Y(0) - Y(v));
        s += `<rect x="${x.toFixed(1)}" y="${(Y(0) - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${(bw / 2).toFixed(1)}" fill="url(#g${k}${j})" style="filter:drop-shadow(0 0 5px ${col}88)"><title>${l} · ${fmt(v, o.dec)}</title></rect>`;
        if (o.showVals && v > 0) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${(Y(0) - h - 6).toFixed(1)}" text-anchor="middle" style="font-size:11px;font-weight:600;fill:#e6e9ef">${fmt(v, v >= 100 ? 0 : o.dec)}</text>`;
      });
    });
    const defs = sets.map(([, col], j) => `<linearGradient id="g${k}${j}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}"/><stop offset="1" stop-color="${col}" stop-opacity=".35"/></linearGradient>`).join('');
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${s}</svg>`;
  }
}

customElements.define('verbruik-card', VerbruikCard);
window.customCards.push({ type: 'verbruik-card', name: 'Verbruik', description: 'Stroom, gas en water van P1- en watermeter' });


/* =====================================================================
 * Auto card — BYD Seal (integratie hass-byd-vehicle) + Zaptec-laadpaal
 * ===================================================================== */

const ADEFAULTS = {
  name: 'BYD Seal',
  image: '/local/auto-render.png',
  prefix: 'byd_seal',            // entiteiten heten sensor.<prefix>_batterijniveau enz.
  charger_mode: 'sensor.laadpaal_opladermodus',
  charger_power: 'sensor.laadpaal_laadvermogen',
  charger_last: 'sensor.laadpaal_laatste_laadsessie',
  charger_name: 'Zaptec Go 2',
  charger_current: 'number.laadpaal_max_stroom',          // maximale laadstroom (A), wordt via de schuif ingesteld
  charger_resume: 'button.laadpaal_hervat_het_opladen',
  charger_stop: 'button.laadpaal_stop_het_opladen',
  charger_switch: 'switch.laadpaal_opladen',      // Zaptec-schakelaar Opladen: echte pauze/hervatten (sessie blijft open); anders de knoppen
  charger_online: 'binary_sensor.laadpaal_online',
  charger_temp: 'sensor.laadpaal_temperatuur_intern',
  charger_firmware: 'update.laadpaal_firmware',
  charger_voltage: 'sensor.laadpaal_spanning_fase1',
  charger_energy: 'sensor.laadpaal_meterwaarde',
  charger_min_a: 6,
  charger_max_a: 16,
  charger_phases: 1,
  battery_kwh: 82.5,             // bruikbare accucapaciteit, voor de tijd tot vol
  efficiency: 0.92,              // laadverlies
  price: null,                   // € per kWh; null = uit het Energie-dashboard, anders de prijs van de Verbruik-kaart
  tyre_diff: 0.3,                // bar verschil links/rechts waarbij een band oranje wordt
  map_zoom: 15,
  refresh_minutes: 5,            // staat automatisch ophalen uit: zo vaak verversen terwijl het tabblad zichtbaar is
};

const ASTYLE = `
:host { --car: #5ee1d0; --heat: #ff9a4d; --cool: #6fb7ff; }
.awrap { background: radial-gradient(900px 460px at 30% -10%, rgba(94,225,208,.10), transparent 65%), var(--bg); }
@media (max-width: 600px) { .awrap { background: radial-gradient(520px 360px at 30% 300px, rgba(94,225,208,.09), transparent 70%), var(--bg) !important; } }
.tile { display: flex; flex-direction: column; padding: 22px 24px; }
.hero { display: grid; grid-template-columns: 1.25fr 1fr; gap: 28px; align-items: center; }
.scene2 { position: relative; height: 330px; }
.scene2::before { content: ''; position: absolute; inset: 5% 0 0; background: radial-gradient(50% 45% at 50% 62%, var(--glow, rgba(94,225,208,.28)), transparent 72%); transition: background 1s; }
.scene2.charging::before { animation: aura 2.4s ease-in-out infinite; }
.carbox { position: absolute; left: 4%; width: 92%; top: 50%; transform: translateY(-50%); }
.carbox img { position: relative; display: block; width: 100%; height: auto; max-height: 300px; object-fit: contain; filter: drop-shadow(0 14px 16px rgba(0,0,0,.5)); }
.floor { position: absolute; left: 6%; right: 6%; bottom: -4%; height: 16%; border-radius: 50%; background: radial-gradient(closest-side, rgba(0,0,0,.6), transparent); }
.model { font-size: 13px; color: var(--muted); letter-spacing: .12em; text-transform: uppercase; font-weight: 600; }
.soc { display: flex; align-items: baseline; gap: 10px; margin-top: 6px; cursor: pointer; }
.soc b { font-size: 84px; font-weight: 600; letter-spacing: -.04em; line-height: 1; }
.soc span { font-size: 26px; color: var(--muted); }
.range { font-size: 18px; color: #cfd5e0; margin-top: 4px; cursor: pointer; } .range b { color: var(--car); font-size: 22px; }
.batt { position: relative; height: 14px; border-radius: 99px; background: rgba(255,255,255,.07); margin: 22px 0 8px; overflow: hidden; }
.batt i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 99px; background: linear-gradient(90deg, #2bb3a3, var(--car)); box-shadow: 0 0 18px rgba(94,225,208,.5); transition: width 1s; }
.batt.low i { background: linear-gradient(90deg, #ff5a3a, var(--imp)); box-shadow: 0 0 18px rgba(255,114,98,.5); }
.batt.charging i { background-image: linear-gradient(90deg, #2bb3a3, var(--car)), repeating-linear-gradient(110deg, rgba(255,255,255,.0) 0 12px, rgba(255,255,255,.25) 12px 20px); background-blend-mode: overlay; animation: stripes 1s linear infinite; background-size: 100% 100%, 40px 100%; }
@keyframes stripes { to { background-position: 0 0, 40px 0; } }
.bscale { display: flex; justify-content: space-between; font-size: 11px; color: var(--faint); }
.status { display: grid; grid-template-columns: repeat(var(--n, 4), minmax(0, 1fr)); gap: 8px; margin-top: 22px; }
.st { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px 6px; border-radius: 14px; background: rgba(255,255,255,.03); border: 1px solid var(--line); font-size: 12px; color: #cfd5e0; text-align: center; cursor: pointer; }
.st svg { width: 22px; height: 22px; fill: none; stroke: var(--c); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.st.warn { background: color-mix(in srgb, var(--sun) 10%, transparent); border-color: color-mix(in srgb, var(--sun) 40%, transparent); }
.st small { display: block; color: var(--muted); font-size: 11px; margin-top: -4px; }
.tyres { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; flex: 1; }
.tyre { text-align: center; cursor: pointer; }
.tyre b { font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; } .tyre b small { font-size: 13px; color: var(--muted); margin-left: 3px; font-weight: 500; }
.tyre.warn b { color: var(--sun); }
.tyre div { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.tcol { display: flex; flex-direction: column; gap: 70px; }
.note { font-size: 12.5px; color: var(--muted); line-height: 1.45; margin-top: 14px; border-top: 1px solid var(--line); padding-top: 12px; }
.ktile { position: relative; overflow: hidden; --c: var(--muted); }
.ktile.active::before { content: ''; position: absolute; inset: 0; background: radial-gradient(60% 50% at 50% 38%, color-mix(in srgb, var(--c) 22%, transparent), transparent 70%); animation: breathe 3.4s ease-in-out infinite; pointer-events: none; }
@keyframes breathe { 50% { opacity: .45; } }
.ktile > * { position: relative; }
.dial { position: relative; width: 100%; max-width: 330px; margin: 6px auto 0; touch-action: none; }
.dial svg { width: 100%; height: auto; display: block; }
.dial .knob { cursor: grab; } .dial.drag .knob { cursor: grabbing; }
.kcenter { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding-top: 18px; text-align: center; pointer-events: none; }
.kcenter .t { font-size: 80px; font-weight: 600; letter-spacing: -.03em; line-height: 1; font-variant-numeric: tabular-nums; cursor: pointer; pointer-events: auto; transition: color .2s; }
.kcenter .t small { font-size: 28px; color: var(--muted); font-weight: 500; vertical-align: top; margin-left: 2px; }
.dial.drag .t { color: var(--c); }
.kcenter .s { font-size: 14px; color: var(--muted); margin-top: 10px; min-height: 18px; } .kcenter .s b { color: var(--c); font-weight: 600; }
.steps { display: flex; gap: 14px; margin-top: 12px; pointer-events: auto; }
.steps div { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.05); border: 1px solid var(--line); color: #dfe4ec; font-size: 20px; cursor: pointer; user-select: none; transition: background .15s; }
.steps div:hover { background: rgba(255,255,255,.09); } .steps div:active { transform: scale(.94); }
.temps { display: flex; justify-content: center; gap: 26px; font-size: 14px; color: var(--muted); margin-top: -10px; }
.temps span { cursor: pointer; } .temps b { color: var(--text); font-weight: 600; font-variant-numeric: tabular-nums; }
.go { margin-top: 16px; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 13px; border-radius: 14px; font-size: 15px; font-weight: 600; cursor: pointer; user-select: none;
  background: color-mix(in srgb, var(--gc) 14%, transparent); border: 1px solid color-mix(in srgb, var(--gc) 45%, transparent); color: #fff; transition: background .2s; }
.go svg { width: 18px; height: 18px; fill: none; stroke: var(--gc); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.go.stop { background: rgba(255,255,255,.04); border-color: var(--line); color: #dfe4ec; } .go.stop svg { stroke: #cfd5e0; }
.go.busy { cursor: default; color: var(--muted); background: rgba(255,255,255,.03); border-color: var(--line); }
.go.err { color: #ffd9d4; background: rgba(255,114,98,.1); border-color: rgba(255,114,98,.4); font-weight: 500; font-size: 13px; }
.spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(94,225,208,.25); border-top-color: var(--car); animation: sp 1s linear infinite; }
@keyframes sp { to { transform: rotate(360deg); } }
.presets { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.pre { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 9px; border-radius: 12px; font-size: 13px; color: #cfd5e0; background: rgba(255,255,255,.03); border: 1px solid var(--line); cursor: pointer; user-select: none; }
.pre i { width: 7px; height: 7px; border-radius: 50%; background: var(--p); box-shadow: 0 0 6px var(--p); }
.pre.on { border-color: color-mix(in srgb, var(--p) 50%, transparent); background: color-mix(in srgb, var(--p) 12%, transparent); color: #fff; }
.kfoot { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; color: var(--muted); margin-top: auto; padding-top: 14px; }
.kfoot span { cursor: pointer; } .kfoot b { font-weight: 600; }
.ktile.nocontrol .steps, .ktile.nocontrol .knob, .ktile.nocontrol .go, .ktile.nocontrol .presets { visibility: hidden; }
.map { position: relative; flex: 1; min-height: 260px; border-radius: 16px; overflow: hidden; background: #0f141c; border: 1px solid var(--line); }
.hamap { position: absolute; inset: 0; pointer-events: none; }
.hamap .leaflet-marker-pane, .hamap .leaflet-control-container { display: none !important; }
.pulse { position: absolute; left: 50%; top: 50%; z-index: 2; pointer-events: none; }
.pulse b { position: absolute; left: -9px; top: -9px; width: 18px; height: 18px; border-radius: 50%; background: var(--car); border: 3px solid #fff; box-sizing: border-box; box-shadow: 0 0 16px rgba(94,225,208,.9); }
.pulse i { position: absolute; left: -9px; top: -9px; width: 18px; height: 18px; border-radius: 50%; background: rgba(94,225,208,.45); animation: ping 2s cubic-bezier(0,0,.2,1) infinite; }
@keyframes ping { 0% { transform: scale(1); opacity: .9; } 80%, 100% { transform: scale(4.2); opacity: 0; } }
.map { cursor: pointer; }
.hamap > * { display: block; height: 100%; --ha-card-background: transparent; --ha-card-border-width: 0; --ha-card-border-radius: 0; --ha-card-box-shadow: none; }
.place { z-index: 2; pointer-events: none; }
.place { position: absolute; left: 14px; bottom: 14px; padding: 8px 12px; border-radius: 12px; background: rgba(14,18,25,.85); backdrop-filter: blur(6px); border: 1px solid var(--line); font-size: 13px; }
.place b { font-size: 15px; display: block; } .place span { color: var(--muted); font-size: 12px; }
.plug { flex: none; width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; background: rgba(255,255,255,.04); border: 1px solid var(--line); }
.plug svg { width: 26px; height: 26px; stroke: var(--pc, var(--muted)); fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.toggle { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-top: 1px solid var(--line); font-size: 14px; cursor: pointer; }
.toggle.first { margin-top: 18px; }
.foot { font-size: 12px; color: var(--faint); margin-top: 16px; text-align: right; }
.st.cmd { --c: var(--exp); transition: background .15s, border-color .15s; user-select: none; }
.st.cmd:hover { background: rgba(255,255,255,.06); } .st.cmd:active { transform: scale(.97); }
.st.cmd.sent { --c: var(--exp); border-color: color-mix(in srgb, var(--exp) 45%, transparent); background: color-mix(in srgb, var(--exp) 10%, transparent); }
.st.cmd.off { opacity: .4; cursor: default; }
.tstat { margin-top: 14px; }
.ctile { position: relative; overflow: hidden; }
.ctile.live::before { content: ''; position: absolute; inset: 0; background: radial-gradient(70% 45% at 30% 15%, rgba(94,225,208,.13), transparent 70%); pointer-events: none; }
.ctile > * { position: relative; }
.chero { display: grid; grid-template-columns: 130px 1fr; gap: 20px; align-items: center; margin-top: 2px; cursor: pointer; }
.chero svg.zap { width: 130px; height: 150px; overflow: visible; }
.ctitle { font-size: 42px; font-weight: 600; letter-spacing: -.02em; line-height: 1.05; font-variant-numeric: tabular-nums; }
.ctitle small { font-size: 19px; color: var(--muted); font-weight: 500; margin: 0 6px 0 3px; }
.ctitle.txt { font-size: 32px; color: #aeb6c4; }
.csub { font-size: 13px; color: var(--muted); margin-top: 6px; } .csub b { color: #cfd5e0; font-weight: 600; }
.clines { margin-top: 16px; display: flex; flex-direction: column; gap: 7px; }
.cline { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; color: var(--muted); padding-top: 7px; border-top: 1px solid var(--line); cursor: pointer; }
.cline b { color: #cfd5e0; font-weight: 600; font-variant-numeric: tabular-nums; }
.zap .led.run { animation: ledp 1.6s ease-in-out infinite; }
@keyframes ledp { 50% { opacity: .45; } }
.zap .cflow { stroke-dasharray: 3 13; animation: flowc .9s linear infinite; }
@keyframes flowc { to { stroke-dashoffset: -16; } }
.cbtn { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 12px; border-radius: 14px; font-size: 14.5px; font-weight: 600; background: rgba(255,255,255,.04); border: 1px solid var(--line); color: #dfe4ec; margin-top: 14px; cursor: pointer; user-select: none; }
.cbtn svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.cbtn.go { background: color-mix(in srgb, var(--car) 14%, transparent); border-color: color-mix(in srgb, var(--car) 45%, transparent); color: #fff; }
.cbtn.off { opacity: .45; cursor: default; }
.cbtn.busy { color: var(--muted); cursor: default; }
.cspd { margin-top: 18px; }
.cspd .top { display: flex; justify-content: space-between; font-size: 13.5px; color: #cfd5e0; } .cspd .top b { font-weight: 600; font-variant-numeric: tabular-nums; } .cspd .top span { color: #cfd5e0; } .cspd .top span em { color: var(--muted); font-style: normal; }
.ctrack { position: relative; height: 12px; border-radius: 99px; background: rgba(255,255,255,.08); margin: 28px 0 4px; cursor: pointer; touch-action: none; }
.ctrack::before { content: ''; position: absolute; left: 0; right: 0; top: -14px; bottom: -10px; }
.ctrack i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 99px; background: linear-gradient(90deg, #2bb3a3, var(--car)); box-shadow: 0 0 14px rgba(94,225,208,.5); transition: width .6s; }
.ctrack i.run::after { content: ''; position: absolute; inset: 0; border-radius: 99px; background: repeating-linear-gradient(110deg, transparent 0 12px, rgba(255,255,255,.22) 12px 20px); background-size: 40px 100%; animation: stripes 1s linear infinite; }
.ctrack .cap { position: absolute; top: -5px; bottom: -5px; width: 3px; border-radius: 2px; background: #fff; transform: translateX(-50%); box-shadow: 0 0 0 3px rgba(12,15,20,.8); }
.ctrack.drag .cap { width: 5px; background: var(--car); }
.ctrack .cap::after { content: attr(data-l); position: absolute; top: -22px; left: 50%; transform: translateX(-50%); font-size: 11px; color: var(--muted); white-space: nowrap; }
.ctrack .cap.r::after { left: auto; right: -2px; transform: none; } .ctrack .cap.l::after { left: -2px; transform: none; }
.ctrack.drag .cap::after { color: var(--car); font-weight: 600; }
.cticks { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--faint); }
.chealth { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--muted); margin-top: auto; padding-top: 14px; border-top: 1px solid var(--line); }
.chealth span { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; } .chealth b { color: #cfd5e0; font-weight: 600; }
.cspin { width: 13px; height: 13px; border-radius: 50%; border: 2px solid rgba(94,225,208,.25); border-top-color: var(--car); animation: sp 1s linear infinite; display: inline-block; }
.th .aside { display: inline-flex; align-items: center; gap: 8px; }
.cd { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--c); box-shadow: 0 0 8px var(--c); }
@media (max-width: 1100px) { .hero { grid-template-columns: 1fr; } .scene2 { height: 240px; } }
@media (max-width: 600px) { .soc b { font-size: 64px; } .status { gap: 6px; } .st { padding: 10px 2px; font-size: 11px; } .st small { font-size: 10px; } }
`;

// gestileerde wandlader; state: run | wait | full | off
const zapSvg = (led, state) => {
  const on = state !== 'off';
  let s = `<defs>
    <radialGradient id="zg"><stop offset="0" stop-color="${led}" stop-opacity="${on ? .35 : .13}"/><stop offset="1" stop-color="${led}" stop-opacity="0"/></radialGradient>
    <linearGradient id="zb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9edf2"/><stop offset="1" stop-color="#aab3bf"/></linearGradient>
    <linearGradient id="zf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a313c"/><stop offset="1" stop-color="#151a22"/></linearGradient></defs>
    <ellipse cx="62" cy="60" rx="66" ry="70" fill="url(#zg)"/>
    <rect x="18" y="10" width="88" height="100" rx="26" fill="url(#zb)"/>
    <rect x="24" y="16" width="76" height="88" rx="21" fill="url(#zf)"/>
    <rect class="led${state === 'run' ? ' run' : ''}" x="44" y="38" width="36" height="5" rx="2.5" fill="${led}" opacity="${on ? 1 : .55}" style="filter:drop-shadow(0 0 6px ${led})"/>
    <circle cx="62" cy="80" r="11" fill="#0d1117" stroke="#3a4350" stroke-width="2"/>
    <circle cx="58" cy="78" r="1.6" fill="#4a5462"/><circle cx="66" cy="78" r="1.6" fill="#4a5462"/><circle cx="62" cy="84" r="1.6" fill="#4a5462"/>`;
  if (!on) {
    const d = 'M62 91 C62 118 40 122 38 134 C36 146 70 148 86 140';
    s += `<path d="${d}" stroke="#2b333f" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="${d}" stroke="#3a4452" stroke-width="2" fill="none" stroke-linecap="round" opacity=".6"/>
      <rect x="84" y="132" width="22" height="15" rx="6" fill="#2f3743" transform="rotate(-12 95 139)"/>
      <ellipse cx="62" cy="152" rx="44" ry="4" fill="#000" opacity=".35"/>`;
  } else {
    const d = 'M62 91 C62 122 90 128 140 128';
    s += `<path d="${d}" stroke="#2b333f" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    if (state === 'run') s += `<path class="cflow" d="${d}" stroke="${led}" stroke-width="3" fill="none" stroke-linecap="round" style="filter:drop-shadow(0 0 4px ${led})"/>`;
  }
  return s;
};

// geometrie van de thermostaatring (viewBox 320 × 300)
const KD = { cx: 160, cy: 160, r: 135, a0: 135, a1: 405 };

const AICONS = {
  lockOpen: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/>',
  door: '<path d="M5 21v-9l5.5-8H19v17H5z"/><path d="M8.5 12l3.5-5h4.5v5H8.5z"/><path d="M13.5 15.5H16"/>',
  window: '<path d="M3.5 18L9.5 5h11v13h-17z"/><path d="M14.5 5v13"/>',
  trunk: '<path d="M3 17v-3.5l2.5-1L8 8h6.5l4 4.5 2.5.6V17H3z"/><path d="M14.5 8l4 4.5"/><circle cx="7" cy="17" r="1.6"/><circle cx="17" cy="17" r="1.6"/>',
  trunkOpen: '<path d="M3 17v-3.5l2.5-1L8 8h6.5l3 4.5h3V17H3z"/><path d="M14.5 8l6-2.5"/><circle cx="7" cy="17" r="1.6"/><circle cx="17" cy="17" r="1.6"/>',
  lights: '<path d="M9 6c-3 0-5 2.7-5 6s2 6 5 6c1.7 0 2.5-2.7 2.5-6S10.7 6 9 6z"/><path d="M15 8h5M15 12h6M15 16h5"/>',
  horn: '<path d="M4 10v4h3l6 4V6l-6 4H4z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
  winUp: '<path d="M3.5 18L9.5 5h11v13h-17z"/><path d="M13 15.5v-6M10.5 12 13 9.5l2.5 2.5"/>',
  plug: '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0V7zM12 17v5"/>',
  power: '<path d="M12 3v9M7 6.5a7 7 0 1 0 10 0"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  seat: '<path d="M7 4v9a3 3 0 0 0 3 3h7M7 13h8a2 2 0 0 1 2 2v5"/>',
  wheel: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M4.5 10h5.5M14 10h5.5M12 14v6"/>',
};

class AutoCard extends HTMLElement {
  setConfig(config) {
    this._config = { ...ADEFAULTS, ...config }; applyTheme(this, config);
    this._build();
    if (this._hass) this._update();
  }
  set hass(hass) { this._hass = hass; this._update(); this._maybeRefresh(); }
  getCardSize() { return 12; }
  getGridOptions() { return { columns: 'full' }; }
  static getStubConfig() { return {}; }

  $(id) { return this.shadowRoot.getElementById(id); }
  _e(dom, key) { return `${dom}.${this._config.prefix}_${key}`; }
  _state(id) { return this._hass?.states[id]; }
  _num(id) { const v = parseFloat(this._state(id)?.state); return isNaN(v) ? null : v; }
  _on(id) { return this._state(id)?.state === 'on'; }
  _moreInfo(entityId) { this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true })); }

  _build() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const c = this._config, e = (d, k) => this._e(d, k);
    const tyre = (k, label) => `<div class="tyre" id="t_${k}" data-e="${e('sensor', 'bandenspanning_' + k)}"><b>—</b><div>${label}</div></div>`;
    this.shadowRoot.innerHTML = `
      <style>${STYLE}${ASTYLE}${LIGHT}</style>
      <div class="wrap awrap"><div class="inner">
        ${headerHtml('auto')}
        <div class="grid">
          <div class="tile s8">
            <div class="hero">
              <div class="scene2" id="scene"><div class="carbox"><div class="floor"></div><img src="${c.image}" alt=""></div></div>
              <div>
                <div class="model">${c.name}</div>
                <div class="soc" data-e="${e('sensor', 'batterijniveau')}"><b class="num" id="soc">—</b><span>%</span></div>
                <div class="range" data-e="${e('sensor', 'bereik')}">Bereik <b class="num" id="range">—</b></div>
                <div class="batt" id="batt"><i id="battBar" style="width:0"></i></div>
                <div class="bscale"><span>0%</span><span id="battNote"></span><span>100%</span></div>
                <div class="status" id="aCtrl">
                  <div class="st" id="sLock" data-e="${e('binary_sensor', 'vergrendeld')}"></div>
                  <div class="st cmd" data-btn="${e('button', 'sluit_ramen')}"><svg viewBox="0 0 24 24">${AICONS.winUp}</svg>Ramen dicht<small>sluiten</small></div>
                  <div class="st cmd" data-btn="${e('button', 'vind_auto')}"><svg viewBox="0 0 24 24">${AICONS.horn}</svg>Claxon<small>toeteren</small></div>
                  <div class="st cmd" data-btn="${e('button', 'flitslichten')}"><svg viewBox="0 0 24 24">${AICONS.lights}</svg>Lichten<small>knipperen</small></div>
                </div>
              </div>
            </div>
          </div>

          <div class="tile s4">
            <div class="th"><span class="label">Locatie</span><span class="aside" id="gpsTime"></span></div>
            <div class="map" id="map" data-e="${e('device_tracker', 'locatie')}">
              <div class="hamap" id="hamap"></div>
              <div class="pulse"><i></i><b></b></div>
              <div class="place"><b id="zone">—</b><span id="zoneSub"></span></div>
              
            </div>
          </div>

          <div class="tile s4 ktile" id="kTile">
            <div class="th"><span class="label">Klimaat</span><span class="aside" id="kNote"></span></div>
            <div class="dial" id="kWrap">
              <svg id="kDial" viewBox="0 0 320 300"></svg>
              <div class="kcenter">
                <div class="t" id="kT" data-e="${e('climate', 'klimaat')}">—</div><div class="s" id="kS"></div>
                <div class="steps"><div id="kMinus">−</div><div id="kPlus">+</div></div>
              </div>
            </div>
            <div class="temps">
              <span data-e="${e('sensor', 'cabine_temperatuur')}">binnen <b id="tIn">—</b></span>
              <span data-e="${e('sensor', 'buitentemperatuur')}">buiten <b id="tOut">—</b></span>
            </div>
            <div class="go" id="kGo"></div>
            <div class="presets">
              <div class="pre" id="kMaxHeat" style="--p:var(--heat)"><i></i>Max warm</div>
              <div class="pre" id="kMaxCool" style="--p:var(--cool)"><i></i>Max koel</div>
            </div>
            <div class="kfoot"><span data-e="${e('sensor', 'pm2_5')}">Fijnstof in cabine <b id="pm">—</b></span><span id="airNote"></span></div>
          </div>

          <div class="tile s4">
            <div class="th"><span class="label">Bandenspanning</span><span class="aside" id="tyreNote"></span></div>
            <div class="tyres">
              <div class="tcol">${tyre('linksvoor', 'linksvoor')}${tyre('links_achter', 'linksachter')}</div>
              <svg width="92" height="190" viewBox="0 0 92 190">
                <rect x="16" y="6" width="60" height="178" rx="26" fill="#1a212c" stroke="rgba(255,255,255,.12)"/>
                <rect x="24" y="50" width="44" height="40" rx="8" fill="#0f141c"/><rect x="24" y="118" width="44" height="30" rx="8" fill="#0f141c"/>
                <rect id="w_linksvoor" x="6" y="30" width="12" height="30" rx="5"/><rect id="w_rechtsvoor" x="74" y="30" width="12" height="30" rx="5"/>
                <rect id="w_links_achter" x="6" y="128" width="12" height="30" rx="5"/><rect id="w_rechtsachter" x="74" y="128" width="12" height="30" rx="5"/>
              </svg>
              <div class="tcol">${tyre('rechtsvoor', 'rechtsvoor')}${tyre('rechtsachter', 'rechtsachter')}</div>
            </div>
            <div class="note">Links en rechts horen gelijk te zijn. Wijkt een band ${fmt(c.tyre_diff, 1)} bar of meer af van zijn tegenhanger, dan wordt hij oranje.</div>
            <div class="status tstat" id="tStat">
              <div class="st" id="sDoor" data-e="${e('binary_sensor', 'deuren_open')}"></div>
              <div class="st" id="sWin" data-e="${e('binary_sensor', 'ramen_open')}"></div>
              <div class="st" id="sTrunk" data-e="${e('binary_sensor', 'kofferbak')}"></div>
            </div>
          </div>

          <div class="tile s4 ctile" id="cTile">
            <div class="th"><span class="label">Laden</span><span class="aside" id="cNote"></span></div>
            <div class="chero" data-e="${c.charger_mode}">
              <svg class="zap" id="cZap" viewBox="0 0 130 155"></svg>
              <div><div class="ctitle" id="cBig">—</div><div class="csub" id="cSub"></div></div>
            </div>
            <div class="clines" id="cLines"></div>
            <div class="cbtn" id="cBtn"></div>
            <div class="cspd" id="cSpd">
              <div class="top"><span id="cSpdLbl">Laadsnelheid</span><b id="cSpdVal">—</b></div>
              <div class="ctrack" id="cTrack"><i id="cFill" style="width:0"></i><span class="cap" id="cCap"></span></div>
              <div class="cticks"><span id="cMinKw"></span><span id="cMaxKw"></span></div>
            </div>
            <div class="chealth" id="cHealth"></div>
          </div>
        </div>
        <div class="foot" id="foot"></div>
      </div></div>`;
    this.shadowRoot.querySelectorAll('[data-e]').forEach((n) =>
      n.addEventListener('click', (ev) => { ev.stopPropagation(); this._moreInfo(n.dataset.e); }));
    this.$('kMinus').addEventListener('click', () => this._klStep(-1));
    this.$('kPlus').addEventListener('click', () => this._klStep(1));
    const dial = this.$('kDial');
    dial.addEventListener('pointerdown', (ev) => this._klDragStart(ev));
    dial.addEventListener('pointermove', (ev) => this._klDragMove(ev));
    dial.addEventListener('pointerup', (ev) => this._klDragEnd(ev));
    dial.addEventListener('pointercancel', (ev) => this._klDragEnd(ev));
    this.$('kGo').addEventListener('click', () => this._klToggle());
    this.$('kMaxHeat').addEventListener('click', () => this._klPreset('max_heat'));
    this.$('kMaxCool').addEventListener('click', () => this._klPreset('max_cool'));
    this.$('cBtn').addEventListener('click', () => this._chargeBtn());
    this.shadowRoot.querySelectorAll('[data-btn]').forEach((n) => n.addEventListener('click', () => {
      if (n.classList.contains('sent') || !this._press(n.dataset.btn)) return;
      const sm = n.querySelector('small'), was = sm?.textContent;
      n.classList.add('sent');
      if (sm) sm.textContent = 'verstuurd';
      setTimeout(() => { n.classList.remove('sent'); if (sm) sm.textContent = was; }, 4000);
    }));
    const tr = this.$('cTrack');
    tr.addEventListener('pointerdown', (ev) => this._spdStart(ev));
    tr.addEventListener('pointermove', (ev) => this._spdMove(ev));
    tr.addEventListener('pointerup', () => this._spdEnd());
    tr.addEventListener('pointercancel', () => this._spdEnd());
    bindNav(this.shadowRoot);
    this._mapEl = null;
  }

  connectedCallback() {
    this._ctimer = setInterval(() => { this._fetchCharge(); this._update(); this._maybeRefresh(); }, 60000);
    this._onVis = () => this._maybeRefresh();
    document.addEventListener('visibilitychange', this._onVis);
    setTimeout(() => this._maybeRefresh(), 500);
  }
  disconnectedCallback() {
    clearInterval(this._ctimer);
    document.removeEventListener('visibilitychange', this._onVis);
  }

  // Staat "Ophalen uitschakelen" aan, dan vraagt alleen deze kaart gegevens op: bij openen en daarna
  // elke refresh_minutes, maar alleen zolang het tabblad echt zichtbaar is.
  _maybeRefresh() {
    if (!this._hass || !this._on(this._e('switch', 'ophalen_uitschakelen'))) return;
    if (document.visibilityState !== 'visible' || !this.isConnected || !this.getClientRects().length) return;
    const now = Date.now(), upd = Date.parse(this._state(this._e('sensor', 'laatst_bijgewerkt'))?.state) || 0;
    if (now - Math.max(upd, this._lastForce || 0) < this._config.refresh_minutes * 60000) return;
    if (!this._press(this._e('button', 'geforceerd_ophalen'))) return;
    this._lastForce = now;
    this._refreshing = { t: now, from: upd };
    this._update();
  }


  // ---- laadpaal ----
  _press(id) { if (id && this._state(id) && this._state(id).state !== 'unavailable') { this._hass.callService('button', 'press', { entity_id: id }); return true; } return false; }

  _chargeBtn() {
    const c = this._config;
    if (this._cBusy || !this._hass) return;
    const st = this._chargeState();
    // alleen de laadpaal bedienen; de auto levert alleen accu en tijd
    const sw = this._state(c.charger_switch), useSw = sw && !['unavailable', 'unknown'].includes(sw.state);
    const cur = this._state(c.charger_current), canZero = cur && Number(cur.attributes.min) === 0;
    const setA = (v) => this._hass.callService('number', 'set_value', { entity_id: c.charger_current, value: v });
    if (st.charging && !st.paused) {
      // echte pauze: laadstroom naar 0 A; de sessie blijft open en de auto gaat vanzelf verder als de stroom terugkomt
      if (canZero) { const v = parseFloat(cur.state); try { localStorage.setItem('thuis-laadstroom', String(v > 0 ? v : c.charger_max_a || 16)); } catch (e) { /* geen opslag */ } setA(0); }
      else if (useSw) this._hass.callService('switch', 'turn_off', { entity_id: c.charger_switch }); else this._press(c.charger_stop);
    } else if (st.plugged) {
      let back = c.charger_max_a || 16; try { back = parseFloat(localStorage.getItem('thuis-laadstroom')) || back; } catch (e) { /* geen opslag */ }
      const go = () => { if (canZero && !(parseFloat(this._state(c.charger_current)?.state) > 0)) setA(back);
        if (useSw && this._state(c.charger_switch)?.state === 'off') this._hass.callService('switch', 'turn_on', { entity_id: c.charger_switch });
        const rb = this._state(c.charger_resume); if (rb && rb.state !== 'unavailable') this._press(c.charger_resume);
        setTimeout(() => { const id = this._e('button', 'start_charging'), cb = this._state(id), pw = this._num(c.charger_power); if (cb && cb.state !== 'unavailable' && !(pw > 300)) Promise.resolve(this._hass.callService('button', 'press', { entity_id: id }, undefined, false)).catch(() => {}); }, 4000); };
      go(); clearTimeout(this._cRetry);
      this._cRetry = setTimeout(() => { const p = this._num(c.charger_power); if (this._chargeState().plugged && !(p > 300)) go(); }, 45000);
    }
    else return;
    this._cBusy = { t: Date.now(), charging: st.charging, mode: st.mode };
    clearTimeout(this._cBusyT); this._cBusyT = setTimeout(() => { this._cBusy = null; this._update(); }, 45000);
    this._update();
  }

  _ampRange() {
    const c = this._config, n = this._state(c.charger_current);
    const lo = Math.max(c.charger_min_a, n?.attributes.min ?? 0), hi = Math.min(c.charger_max_a, n?.attributes.max ?? 99);
    const v = this._num(c.charger_voltage);
    const volt = v > 150 && v < 270 ? v : 230;
    return { lo, hi, kw: (a) => a * volt * c.charger_phases / 1000 };
  }

  _spdFromEvent(ev) {
    const r = this.$('cTrack').getBoundingClientRect(), { lo, hi } = this._ampRange();
    return Math.round(lo + clamp((ev.clientX - r.left) / r.width, 0, 1) * (hi - lo));
  }
  _spdStart(ev) {
    const n = this._state(this._config.charger_current);
    if (!n || n.state === 'unavailable') return;
    this.$('cTrack').setPointerCapture(ev.pointerId);
    this._spdDrag = this._spdFromEvent(ev);
    this._update();
  }
  _spdMove(ev) {
    if (this._spdDrag == null) return;
    const v = this._spdFromEvent(ev);
    if (v !== this._spdDrag) { this._spdDrag = v; this._update(); }
  }
  _spdEnd() {
    if (this._spdDrag == null) return;
    const v = this._spdDrag, id = this._config.charger_current;
    this._spdDrag = null;
    if (v !== Math.round(this._num(id))) {
      this._spdSet = { v, t: Date.now() };
      this._hass.callService('number', 'set_value', { entity_id: id, value: v });
    }
    this._update();
  }

  _chargeState() {
    // de laadpaal (Zaptec) is leidend; de auto meldt zijn status vaak minuten later (na pauzeren bleef "laadt" staan)
    const c = this._config, mode = this._state(c.charger_mode)?.state || '', hasMode = !!mode && mode !== 'unavailable' && mode !== 'unknown';
    const soc = parseFloat(this._state(this._e('sensor', 'batterijniveau'))?.state ?? this._state(c.car_battery)?.state);
    const charging = hasMode ? mode === 'connected_charging' : this._on(this._e('binary_sensor', 'opladen'));
    const plugged = charging || mode.startsWith('connected') || (!hasMode && this._on(this._e('binary_sensor', 'stekker')));
    // Zaptec meldt na pauzeren ook "connected_finished": alleen vol als de accu (bijna) vol is, anders gepauzeerd
    const done = mode === 'connected_finished', full = done && (isNaN(soc) || soc >= 99);
    const zeroA = parseFloat(this._state(c.charger_current)?.state) === 0;
    return { mode, charging: charging && !zeroA, plugged, finished: full, paused: (done && !full) || (plugged && zeroA) };
  }

  // maandtotaal (kWh) en aantal sessies; elke 10 minuten
  async _fetchCharge() {
    const c = this._config;
    if (!this._hass || this._cFetching || (this._cFetchedAt && Date.now() - this._cFetchedAt < 10 * 60000)) return;
    this._cFetching = true;
    const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0);
    const ws = (msg) => Promise.race([this._hass.callWS(msg), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))]);
    try {
      if (c.charger_energy) {
        const res = await ws({ type: 'recorder/statistics_during_period', start_time: m0.toISOString(), period: 'month', statistic_ids: [c.charger_energy], types: ['change'] });
        const rows = res[c.charger_energy] || [];
        this._cMonth = rows.reduce((t, r) => t + (r.change > 0 ? r.change : 0), 0);
      }
      if (c.price == null && this._cPrice == null) {
        try {
          const prefs = await ws({ type: 'energy/get_prefs' });
          const grid = (prefs.energy_sources || []).find((x) => x.type === 'grid');
          const f = (grid?.flow_from || [])[0];
          if (f?.number_energy_price != null) this._cPrice = f.number_energy_price;
        } catch (e) { /* standaardprijs */ }
      }
    } catch (e) {
      console.warn('auto-card: laadgegevens ophalen mislukt', e);
    } finally {
      this._cFetching = false;
      this._cFetchedAt = Date.now();
      this._update();
    }
  }

  _updateCharge(soc, range) {
    const c = this._config, set = (id, html) => { const el = this.$(id); if (el && el.innerHTML !== html) el.innerHTML = html; };
    this._fetchCharge();
    const st = this._chargeState(), modeSt = this._state(c.charger_mode);
    const cpSt = this._state(c.charger_power);
    let cpW = this._num(c.charger_power);
    if (cpW != null && /kw/i.test(cpSt?.attributes.unit_of_measurement || '')) cpW *= 1000;
    const { lo, hi, kw } = this._ampRange();
    const limA = this._spdDrag ?? this._spdSet?.v ?? this._num(c.charger_current) ?? hi;
    if (this._spdSet && (Math.round(this._num(c.charger_current)) === this._spdSet.v || Date.now() - this._spdSet.t > 60000)) this._spdSet = null;
    if (this._cBusy && (st.charging !== this._cBusy.charging || st.mode !== this._cBusy.mode || Date.now() - this._cBusy.t > 45000)) { this._cBusy = null; clearTimeout(this._cBusyT); }

    // kop
    const mins = (iso) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    const dur = (m) => m >= 60 ? `${Math.floor(m / 60)} u ${m % 60} min` : `${m} min`;
    set('cNote', st.charging ? `<i class="cd" style="--c:var(--car)"></i><b>laadt</b>${modeSt ? ` · ${dur(mins(modeSt.last_changed))}` : ''}`
      : st.finished || (st.plugged && soc >= 100) ? '<i class="cd" style="--c:var(--exp)"></i><b>aangesloten</b> · vol'
      : st.paused ? '<i class="cd" style="--c:var(--home)"></i><b>gepauzeerd</b>'
      : st.plugged ? '<i class="cd" style="--c:var(--home)"></i><b>aangesloten</b> · wacht'
      : '<i class="cd" style="--c:#6b7385"></i>niet aangesloten');
    this.$('cTile').classList.toggle('live', st.charging);

    // tijd tot vol
    const remKwh = soc == null ? null : Math.max(0, (100 - soc) / 100 * c.battery_kwh);
    const hm = (h) => { const m = Math.round(h * 60); return m >= 60 ? `${Math.floor(m / 60)}<small>u</small>${String(m % 60).padStart(2, '0')}<small>min</small>` : `${m}<small>min</small>`; };
    const sched = this._on(this._e('switch', 'schedule_enabled')), start = this._state(this._e('time', 'start_time'))?.state;
    const startTxt = sched && start && /^\d\d:\d\d/.test(start) ? start.slice(0, 5) : null;
    const full = st.plugged && !st.paused && (st.finished || soc >= 100 || remKwh === 0);
    let bigHtml, subHtml = '', txt = false;
    if (!st.plugged) { txt = true; bigHtml = 'Niet<br>aangesloten'; }
    else if (st.paused) { txt = true; bigHtml = 'Gepauzeerd'; subHtml = remKwh != null ? `nog ${fmt(remKwh, 1)} kWh tot vol` : ''; }
    else if (full) { bigHtml = 'Vol'; subHtml = 'klaar met laden'; }
    else if (remKwh == null) { txt = true; bigHtml = st.charging ? 'Laadt' : 'Aangesloten'; }
    else {
      const pkw = st.charging && cpW > 300 ? cpW / 1000 : kw(limA);
      const h = remKwh / (pkw * c.efficiency);
      bigHtml = hm(h);
      subHtml = st.charging ? `tot vol · klaar om <b>${fmtTime(Date.now() + h * 3600000)}</b>`
        : startTxt ? `tot vol na start om <b>${startTxt}</b>` : `tot vol bij ${fmt(pkw, 1)} kW`;
    }
    const big = this.$('cBig');
    big.classList.toggle('txt', txt);
    if (big.innerHTML !== bigHtml) big.innerHTML = bigHtml;
    set('cSub', subHtml);

    // laadpaal-tekening: lampje en kabel volgen de toestand
    const zs = st.charging ? 'run' : st.plugged ? (full ? 'full' : 'wait') : 'off';
    const led = { run: '#5ee1d0', full: '#3ddc97', wait: '#7aa7ff', off: '#8b95a7' }[zs];
    if (this._zapKey !== zs) { this._zapKey = zs; this.$('cZap').innerHTML = zapSvg(led, zs); }

    // regels: auto of laatste sessie, en de laadkosten van deze maand
    if (st.charging && this._cStartSoc == null) this._cStartSoc = soc;
    if (!st.charging) this._cStartSoc = null;
    const price = c.price ?? this._cPrice ?? VDEFAULTS.prices.import;
    const month = new Date().toLocaleDateString('nl-NL', { month: 'long' });
    const lines = [];
    if (st.plugged) {
      const kmPerPct = range != null && soc > 0 ? range / soc : null;
      const kmAdd = st.charging && kmPerPct && this._cStartSoc != null ? Math.round((soc - this._cStartSoc) * kmPerPct) : 0;
      lines.push([this._e('sensor', 'batterijniveau'), 'Auto', soc == null ? '—' : `${fmt(soc)}%${kmAdd > 0 ? ` · +${kmAdd} km` : range != null ? ` · ${fmt(range)} km` : ''}`]);
    } else {
      const last = this._num(c.charger_last), ls = this._state(c.charger_last);
      if (last != null) lines.push([c.charger_last, 'Laatste sessie', `${fmt(last, 1)} kWh${ls ? ' · ' + new Date(ls.last_changed).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : ''}`]);
    }
    if (this._cMonth != null) lines.push([c.charger_energy, `Laadkosten ${month}`, `€ ${fmt(this._cMonth * price)} · ${fmt(this._cMonth)} kWh`]);
    const lh = lines.map(([id, k, v]) => `<div class="cline" data-e="${id}"><span>${k}</span><b>${v}</b></div>`).join('');
    const le = this.$('cLines');
    if (le.innerHTML !== lh) { le.innerHTML = lh; le.querySelectorAll('[data-e]').forEach((x) => x.addEventListener('click', (ev) => { ev.stopPropagation(); this._moreInfo(x.dataset.e); })); }

    // knop
    const btn = this.$('cBtn');
    let bh, bc = 'cbtn';
    if (this._cBusy) { bc += ' busy'; bh = '<i class="cspin"></i>Opdracht verstuurd…'; }
    else if (st.charging) bh = '<svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg>Laden pauzeren';
    else { bc += st.plugged && !st.finished ? ' go' : ' off'; bh = `<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>${st.paused ? 'Laden hervatten' : 'Nu laden'}`; }
    btn.className = bc;
    if (btn.innerHTML !== bh) btn.innerHTML = bh;

    // laadsnelheid
    const n = this._state(c.charger_current);
    this.$('cSpd').style.display = n ? '' : 'none';
    if (n) {
      const pct = (a) => clamp((a - lo) / (hi - lo || 1) * 100, 0, 100);
      const liveKw = st.charging && cpW != null ? cpW / 1000 : null;
      const fill = this.$('cFill');
      fill.style.width = liveKw ? `${clamp((liveKw - kw(lo)) / (kw(hi) - kw(lo) || 1) * 100, 3, 100)}%` : '0';
      fill.classList.toggle('run', !!liveKw);
      const cap = this.$('cCap'), p = pct(limA);
      cap.style.left = `${p}%`;
      cap.className = 'cap' + (p > 82 ? ' r' : p < 18 ? ' l' : '');
      cap.dataset.l = `max ${fmt(kw(limA), 1)} kW${this._spdDrag != null ? ` · ${limA} A` : ''}`;
      this.$('cTrack').classList.toggle('drag', this._spdDrag != null);
      set('cSpdLbl', `Laadsnelheid${this._spdSet ? ' <em>· wordt ingesteld…</em>' : !st.charging && st.plugged && !st.finished ? ' <em>· gepland</em>' : ''}`);
      set('cSpdVal', liveKw ? `${fmt(liveKw, 2)} kW` : '—');
      set('cMinKw', `${fmt(kw(lo), 1)} kW`);
      set('cMaxKw', `${fmt(kw(hi), 1)} kW`);
    }

    // gezondheid
    const on = this._state(c.charger_online), temp = this._num(c.charger_temp), fw = this._state(c.charger_firmware);
    const parts = [];
    if (on) parts.push(`<span data-e="${c.charger_online}"><i class="cd" style="--c:${on.state === 'on' ? 'var(--exp)' : 'var(--imp)'}"></i>${c.charger_name} ${on.state === 'on' ? 'online' : 'offline'}</span>`);
    if (temp != null) parts.push(`<span data-e="${c.charger_temp}">intern <b>${fmt(temp)}°</b></span>`);
    if (fw) parts.push(`<span data-e="${c.charger_firmware}">firmware <b${fw.state === 'on' ? ' style="color:var(--sun)"' : ''}>${fw.state === 'on' ? 'update beschikbaar' : 'actueel'}</b></span>`);
    const hh = parts.join('');
    const he = this.$('cHealth');
    if (he.innerHTML !== hh) {
      he.innerHTML = hh;
      he.querySelectorAll('[data-e]').forEach((x) => x.addEventListener('click', () => this._moreInfo(x.dataset.e)));
    }
  }

  // ---- klimaatbediening ----
  // Let op: de BYD-integratie negeert set_temperature als de airco uit staat. Daarom houden we
  // de gekozen temperatuur lokaal bij en sturen we hem pas na het aanzetten mee.
  _kl() { return this._state(this._e('climate', 'klimaat')); }
  _klTargetNow(kl) { return this._klTarget ?? kl?.attributes.temperature ?? 21; }

  _klCall(service, data, done) {
    const kl = this._kl();
    if (!kl || !this._hass) return;
    this._klBusy = { t: Date.now(), done };
    this._klErr = null;
    this._hass.callService('climate', service, { entity_id: kl.entity_id, ...data }).catch((err) => {
      this._klBusy = null;
      this._klErr = err?.message || 'Opdracht mislukt';
      this._update();
      clearTimeout(this._klErrTimer);
      this._klErrTimer = setTimeout(() => { this._klErr = null; this._update(); }, 10000);
    });
    this._update();
  }

  _klStep(dir) {
    const kl = this._kl();
    if (!kl || kl.state === 'unavailable') return;
    const a = kl.attributes, step = a.target_temp_step || 1;
    this._klTarget = clamp(this._klTargetNow(kl) + dir * step, a.min_temp ?? 17, a.max_temp ?? 33);
    this._update();
    clearTimeout(this._klTimer);
    if (kl.state !== 'off') {
      this._klTimer = setTimeout(() => {
        const t = this._klTarget;
        if (t != null && t !== this._kl()?.attributes.temperature) this._klCall('set_temperature', { temperature: t }, (k) => k.attributes.temperature === t);
      }, 1500);
    }
  }

  // slepen over de ring (zelfde geometrie als de tekening in _updateClimate)
  _klFromEvent(ev, onlyRing) {
    const kl = this._kl(), a = kl.attributes, min = a.min_temp ?? 17, max = a.max_temp ?? 33, step = a.target_temp_step || 1;
    const r = this.$('kDial').getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width * 320 - KD.cx, y = (ev.clientY - r.top) / r.height * 300 - KD.cy;
    const dist = Math.hypot(x, y);
    if (onlyRing && (dist < KD.r - 34 || dist > KD.r + 34)) return null;
    let deg = Math.atan2(y, x) * 180 / Math.PI;
    if (deg < 90) deg += 360;                       // nu 90…450°; de ring loopt van a0 (135°) tot a1 (405°)
    if (deg < KD.a0 || deg > KD.a1) return null;     // in de opening onderaan: waarde laten staan
    return clamp(Math.round((min + (deg - KD.a0) / (KD.a1 - KD.a0) * (max - min)) / step) * step, min, max);
  }

  _klDragStart(ev) {
    const kl = this._kl();
    if (!kl || kl.state === 'unavailable') return;
    const v = this._klFromEvent(ev, true);
    if (v == null) return;
    ev.preventDefault();
    this.$('kDial').setPointerCapture(ev.pointerId);
    clearTimeout(this._klTimer);
    this._klDrag = true;
    this._klTarget = v;
    this._update();
  }

  _klDragMove(ev) {
    if (!this._klDrag) return;
    const v = this._klFromEvent(ev, false);
    if (v != null && v !== this._klTarget) { this._klTarget = v; this._update(); }
  }

  _klDragEnd() {
    if (!this._klDrag) return;
    this._klDrag = false;
    const kl = this._kl(), t = this._klTarget;
    if (kl && kl.state !== 'off' && t != null && t !== kl.attributes.temperature) this._klCall('set_temperature', { temperature: t }, (k) => k.attributes.temperature === t);
    else this._update();
  }

  _klToggle() {
    const kl = this._kl();
    if (!kl || kl.state === 'unavailable' || this._klBusy) return;
    if (kl.state === 'off') {
      const t = this._klTargetNow(kl);
      this._klStart = t !== kl.attributes.temperature ? t : null;
      this._klCall('set_hvac_mode', { hvac_mode: 'heat_cool' }, (k) => k.state !== 'off');
    } else {
      this._klStart = null;
      this._klCall('set_hvac_mode', { hvac_mode: 'off' }, (k) => k.state === 'off');
    }
  }

  _klPreset(preset) {
    const kl = this._kl();
    if (!kl || kl.state === 'unavailable' || this._klBusy) return;
    this._klTarget = null; this._klStart = null;
    this._klCall('set_preset_mode', { preset_mode: preset }, (k) => k.state !== 'off' && k.attributes.preset_mode === preset);
  }

  _updateClimate() {
    const set = (id, html) => { const el = this.$(id); if (el && el.innerHTML !== html) el.innerHTML = html; };
    const kl = this._kl(), tile = this.$('kTile');
    const tIn = this._num(this._e('sensor', 'cabine_temperatuur')) ?? kl?.attributes.current_temperature ?? null;
    const tOut = this._num(this._e('sensor', 'buitentemperatuur'));
    set('tIn', tIn == null ? '—' : `${fmt(tIn)}°`);
    set('tOut', tOut == null ? '—' : `${fmt(tOut)}°`);
    const pm = this._num(this._e('sensor', 'pm2_5'));
    const pmQ = pm == null ? null : pm <= 10 ? ['goed', 'var(--exp)'] : pm <= 25 ? ['matig', 'var(--sun)'] : ['slecht', 'var(--imp)'];
    set('pm', pm == null ? '—' : `<span style="color:${pmQ[1]}">${fmt(pm)} µg/m³</span>`);
    set('airNote', pmQ ? `luchtkwaliteit ${pmQ[0]}` : '');

    const ok = kl && kl.state !== 'unavailable';
    tile.classList.toggle('nocontrol', !ok);
    if (!kl) { set('kT', tIn == null ? '—' : `${fmt(tIn)}<small>°C</small>`); set('kS', 'binnen'); set('kNote', ''); return; }
    const a = kl.attributes, on = kl.state !== 'off' && ok;

    // opdracht afgerond?
    if (this._klBusy && (this._klBusy.done(kl) || Date.now() - this._klBusy.t > 90000)) this._klBusy = null;
    // temperatuur door iemand anders gewijzigd (app/auto): lokale keuze loslaten
    if (this._klSeen !== undefined && this._klSeen !== a.temperature && !this._klBusy && !this._klStart) this._klTarget = null;
    this._klSeen = a.temperature;
    // na het aanzetten alsnog de gekozen temperatuur sturen
    if (on && this._klStart != null && !this._klBusy) {
      const t = this._klStart; this._klStart = null;
      if (t !== a.temperature) this._klCall('set_temperature', { temperature: t }, (k) => k.attributes.temperature === t);
    }
    if (!on && !this._klBusy) this._klStart = null;

    const target = this._klTargetNow(kl), min = a.min_temp ?? 17, max = a.max_temp ?? 33;
    const mode = !on ? 'off' : tIn == null ? 'on' : target > tIn + 0.5 ? 'heat' : target < tIn - 0.5 ? 'cool' : 'on';
    const col = { off: 'var(--muted)', heat: 'var(--heat)', cool: 'var(--cool)', on: 'var(--car)' }[mode];
    tile.style.setProperty('--c', col);
    tile.classList.toggle('active', on);

    const since = Math.max(0, Math.round((Date.now() - Date.parse(kl.last_changed)) / 60000));
    const word = { heat: 'verwarmt', cool: 'koelt', on: 'op temperatuur' }[mode];
    set('kNote', !ok ? '<i class="cd" style="--c:#6b7385"></i>niet bereikbaar'
      : on ? `<i class="cd" style="--c:${col}"></i><b>${word}</b>${since ? ` · ${since} min` : ''}` : '<i class="cd" style="--c:#6b7385"></i>uit');
    set('kT', `${fmt(target)}<small>°C</small>`);
    this.$('kWrap').classList.toggle('drag', !!this._klDrag);
    set('kS', this._klDrag ? (on ? 'loslaten om in te stellen' : 'temperatuur kiezen')
      : this._klBusy && on ? '<i class="spin" style="display:inline-block;vertical-align:-2px;margin-right:6px"></i>naar de auto gestuurd…'
      : on && tIn != null ? `nu <b>${fmt(tIn)}°</b> → ${fmt(target)}°` : 'ingestelde temperatuur');

    // draaiknop
    const { cx, cy, r, a0, a1 } = KD, drag = !!this._klDrag;
    const ang = (v) => a0 + (clamp(v, min, max) - min) / (max - min || 1) * (a1 - a0);
    const pt = (deg, rr = r) => [cx + rr * Math.cos(deg * Math.PI / 180), cy + rr * Math.sin(deg * Math.PI / 180)];
    const arc = (f, t) => { if (t < f) [f, t] = [t, f]; const [x0, y0] = pt(f), [x1, y1] = pt(t); return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${t - f > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
    const grad = mode === 'cool' ? ['#a8d4ff', '#4b9bff'] : mode === 'on' ? ['#8ff0e3', '#2bb3a3'] : ['#ffc56b', '#ff7a3d'];
    let s = `<defs><linearGradient id="kg" x1="0" x2="1"><stop offset="0" stop-color="${grad[0]}"/><stop offset="1" stop-color="${grad[1]}"/></linearGradient></defs>`;
    s += `<path d="${arc(a0, a1)}" stroke="rgba(255,255,255,.07)" stroke-width="18" fill="none" stroke-linecap="round"/>`;
    if (on && tIn != null) {
      s += `<path d="${arc(a0, ang(Math.min(tIn, target)))}" stroke="url(#kg)" stroke-width="18" fill="none" stroke-linecap="round" style="filter:drop-shadow(0 0 8px ${col})"/>`;
      if (Math.abs(ang(target) - ang(tIn)) > 2) s += `<path d="${arc(ang(tIn), ang(target))}" stroke="${col}" stroke-opacity=".28" stroke-width="18" fill="none" stroke-linecap="round"/>`;
    } else if (!on && drag) s += `<path d="${arc(a0, ang(target))}" stroke="rgba(255,154,77,.3)" stroke-width="18" fill="none" stroke-linecap="round"/>`;
    if (tIn != null) { const [ix, iy] = pt(ang(tIn)); s += `<circle cx="${ix.toFixed(1)}" cy="${iy.toFixed(1)}" r="4" fill="${on ? '#fff' : '#8b95a7'}"/>`; }
    const [tx, ty] = pt(ang(target)), kr = drag ? 17 : 13;
    const kc = on ? { heat: '#ff9a4d', cool: '#6fb7ff', on: '#5ee1d0' }[mode] : drag ? (tIn != null && target < tIn - 0.5 ? '#6fb7ff' : '#ff9a4d') : '#cfd5e0';
    if (drag) s += `<circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="30" fill="${kc}" opacity=".16"/>`;
    s += `<g class="knob"><circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="${kr + 12}" fill="transparent"/>`
      + `<circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="${kr}" fill="#12161d" stroke="${kc}" stroke-width="4" style="filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))"/>`
      + `<circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="${kr - 7}" fill="${kc}"/></g>`;
    if (this._klDialHtml !== s) { this.$('kDial').innerHTML = s; this._klDialHtml = s; }

    // hoofdknop
    const go = this.$('kGo');
    let gh, gc = 'go';
    if (this._klErr) { gc += ' err'; gh = `Mislukt: ${this._klErr}`; }
    else if (this._klBusy) { gc += ' busy'; gh = '<i class="spin"></i>Opdracht verstuurd · wacht op de auto…'; }
    else if (on) { gc += ' stop'; gh = `<svg viewBox="0 0 24 24">${AICONS.stop}</svg>Klimaat uitzetten`; }
    else {
      const w = tIn == null ? 'Klimaat aan op' : target > tIn + 0.5 ? 'Voorverwarmen naar' : target < tIn - 0.5 ? 'Koelen naar' : 'Klimaat aan op';
      gh = `<svg viewBox="0 0 24 24">${AICONS.power}</svg>${w} ${fmt(target)}°`;
    }
    go.className = gc;
    go.style.setProperty('--gc', tIn != null && target < tIn - 0.5 ? 'var(--cool)' : 'var(--heat)');
    if (go.innerHTML !== gh) go.innerHTML = gh;
    this.$('kMaxHeat').classList.toggle('on', on && a.preset_mode === 'max_heat');
    this.$('kMaxCool').classList.toggle('on', on && a.preset_mode === 'max_cool');

  }

  _update() {
    if (!this._hass || !this.shadowRoot) return;
    const c = this._config, e = (d, k) => this._e(d, k);
    const set = (id, html) => { const el = this.$(id); if (el && el.innerHTML !== html) el.innerHTML = html; };
    const ago = (iso) => {
      const t = Date.parse(iso); if (isNaN(t)) return '—';
      const m = Math.round((Date.now() - t) / 60000);
      return m < 1 ? 'zojuist' : m < 60 ? `${m} min geleden` : startOfDay(t) === startOfDay(Date.now()) ? fmtTime(t) : new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) + ' ' + fmtTime(t);
    };
    set('date', new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));


    // accu
    const soc = this._num(e('sensor', 'batterijniveau'));
    const range = this._num(e('sensor', 'bereik'));
    const plugged = this._on(e('binary_sensor', 'stekker'));
    const charging = this._on(e('binary_sensor', 'opladen'));
    const speed = this._num(e('sensor', 'snelheid'));
    set('soc', soc == null ? '—' : fmt(soc));
    set('range', range == null ? '—' : `${fmt(range)} km`);
    this.$('battBar').style.width = `${clamp(soc || 0, 0, 100)}%`;
    this.$('batt').classList.toggle('low', soc != null && soc < 20);
    this.$('batt').classList.toggle('charging', charging);
    const cp = this._num(c.charger_power);
    set('battNote', charging ? `aan het laden${cp ? ` · ${fmtPower(cp).v} ${fmtPower(cp).u}` : ''}` : plugged ? 'aangesloten' : speed > 1 ? `rijdt · ${fmt(speed)} km/h` : 'geparkeerd');
    const sc = this.$('scene');
    sc.classList.toggle('charging', charging);
    sc.style.setProperty('--glow', charging ? 'rgba(94,225,208,.42)' : soc != null && soc < 20 ? 'rgba(255,114,98,.25)' : 'rgba(94,225,208,.22)');

    // status (binary_sensor lock/door/window: on = open)
    const tile = (id, ok, icon, title, sub) => {
      const el = this.$(id);
      el.classList.toggle('warn', !ok);
      el.style.setProperty('--c', ok ? 'var(--exp)' : 'var(--sun)');
      const html = `<svg viewBox="0 0 24 24">${icon}</svg>${title}<small>${sub}</small>`;
      if (el.innerHTML !== html) el.innerHTML = html;
    };
    const lockSt = this._state(e('binary_sensor', 'vergrendeld'))?.state;
    // klikken opent het echte slot (met bevestiging van HA zelf), anders de sensor
    this.$('sLock').dataset.e = this._state(e('lock', 'slot')) ? e('lock', 'slot') : e('binary_sensor', 'vergrendeld');
    tile('sLock', lockSt !== 'on', lockSt === 'on' ? AICONS.lockOpen : AICONS.lock, lockSt === 'on' ? 'Open' : 'Op slot', lockSt === 'on' ? 'niet vergrendeld' : lockSt === 'off' ? 'vergrendeld' : 'onbekend');
    const doors = this._on(e('binary_sensor', 'deuren_open'));
    tile('sDoor', !doors, AICONS.door, 'Deuren', doors ? 'open' : 'dicht');
    const wins = this._on(e('binary_sensor', 'ramen_open'));
    tile('sWin', !wins, AICONS.window, 'Ramen', wins ? 'open' : 'dicht');
    const trunkSt = this._state(e('binary_sensor', 'kofferbak'));
    this.$('sTrunk').style.display = trunkSt ? '' : 'none';
    this.$('tStat').style.setProperty('--n', trunkSt ? 3 : 2);
    if (trunkSt) tile('sTrunk', trunkSt.state !== 'on', trunkSt.state === 'on' ? AICONS.trunkOpen : AICONS.trunk, 'Kofferbak', trunkSt.state === 'on' ? 'open' : 'dicht');

    // bediening: alleen knoppen die in Home Assistant bestaan
    let nAct = 1;
    this.shadowRoot.querySelectorAll('[data-btn]').forEach((n) => {
      const st = this._state(n.dataset.btn);
      n.style.display = st ? '' : 'none';
      n.classList.toggle('off', !!st && st.state === 'unavailable');
      if (st) nAct++;
    });
    this.$('aCtrl').style.setProperty('--n', nAct);

    // banden
    const tk = ['linksvoor', 'rechtsvoor', 'links_achter', 'rechtsachter'];
    const tv = Object.fromEntries(tk.map((k) => [k, this._num(e('sensor', 'bandenspanning_' + k))]));
    const pair = { linksvoor: 'rechtsvoor', rechtsvoor: 'linksvoor', links_achter: 'rechtsachter', rechtsachter: 'links_achter' };
    let bad = 0;
    for (const k of tk) {
      const v = tv[k], o = tv[pair[k]];
      const warn = v != null && o != null && o - v >= c.tyre_diff - 1e-9;
      if (warn) bad++;
      const el = this.$('t_' + k);
      el.classList.toggle('warn', warn);
      const b = el.querySelector('b'), html = v == null ? '—' : `${fmt(v, 1)}<small>bar</small>`;
      if (b.innerHTML !== html) b.innerHTML = html;
      this.$('w_' + k).setAttribute('fill', v == null ? '#4f5868' : warn ? 'var(--sun)' : 'var(--exp)');
    }
    set('tyreNote', `<i class="cd" style="--c:${bad ? 'var(--sun)' : 'var(--exp)'}"></i>${bad ? `controleer ${bad === 1 ? 'band' : 'banden'}` : 'in orde'}`);

    // klimaat
    this._updateClimate();

    // locatie
    const trk = this._state(e('device_tracker', 'locatie'));
    if (trk) {
      const zoneName = trk.state === 'home' ? 'Thuis' : trk.state === 'not_home' ? 'Onderweg' : trk.state;
      set('zone', zoneName);
      const dir = trk.attributes.gps_direction;
      const dirs = ['noord', 'noordoost', 'oost', 'zuidoost', 'zuid', 'zuidwest', 'west', 'noordwest'];
      set('zoneSub', speed > 1 ? `rijdt · ${fmt(speed)} km/h${dir != null ? ' · richting ' + dirs[Math.round(dir / 45) % 8] : ''}` : 'geparkeerd');
      set('gpsTime', trk.attributes.gps_timestamp ? `GPS ${ago(trk.attributes.gps_timestamp)}` : '');
      this._drawMap();
    }

    // laden
    this._updateCharge(soc, range);

    const poll = this._num(e('number', 'telemetry_poll_interval'));
    const updIso = this._state(e('sensor', 'laatst_bijgewerkt'))?.state;
    if (this._refreshing && ((Date.parse(updIso) || 0) > this._refreshing.from || Date.now() - this._refreshing.t > 90000)) this._refreshing = null;
    const manual = this._on(e('switch', 'ophalen_uitschakelen'));
    set('foot', this._refreshing ? '<i class="cspin" style="vertical-align:-2px;margin-right:6px"></i>Gegevens ophalen…'
      : `Laatst bijgewerkt ${ago(updIso)}${manual ? ' · ververst bij openen' : poll ? ` · telemetrie elke ${fmt(poll / 60)} min` : ''}`);
  }

  // markering en knoppen van de HA-kaart verbergen; ons eigen pulserende bolletje staat in het midden
  _hideMarker(tries = 0) {
    // zoek door alle (geneste) shadow roots naar de Leaflet-kaart en verberg daar markering en knoppen
    const css = '.leaflet-marker-pane, .leaflet-shadow-pane, .leaflet-control-container, .leaflet-control, .leaflet-bar, ha-entity-marker, ha-icon-button, ha-icon-button-toggle, mwc-icon-button { display: none !important; }';
    const roots = [], walk = (node) => {
      if (!node) return;
      if (node.shadowRoot) { roots.push(node.shadowRoot); walk(node.shadowRoot); }
      for (const ch of node.children || []) walk(ch);
    };
    walk(this._mapEl);
    let found = false;
    for (const r of roots) {
      if (r.querySelector('.leaflet-container, .leaflet-marker-pane, ha-entity-marker')) found = true;
      if (!r.getElementById('zp-hide')) { const st = document.createElement('style'); st.id = 'zp-hide'; st.textContent = css; r.appendChild(st); }
    }
    if (!found && tries < 60) setTimeout(() => this._hideMarker(tries + 1), 250);
  }

  // de kaart van Home Assistant zelf (zelfde tegels als de map-kaart), in donkere modus
  async _drawMap() {
    if (this._mapEl) { this._mapEl.hass = this._hass; this._hideMarker(55); return; }
    if (this._mapLoading || !window.loadCardHelpers) return;
    this._mapLoading = true;
    try {
      const helpers = await window.loadCardHelpers();
      const el = helpers.createCardElement({
        type: 'map', entities: [this._e('device_tracker', 'locatie')],
        default_zoom: this._config.map_zoom, theme_mode: 'dark', hours_to_show: 0, aspect_ratio: '100%',
      });
      el.hass = this._hass;
      this.$('hamap').appendChild(el);
      this._mapEl = el;
      this._hideMarker();
    } catch (err) {
      console.warn('auto-card: kaart laden mislukt', err);
    } finally {
      this._mapLoading = false;
    }
  }
}

customElements.define('auto-card', AutoCard);
window.customCards.push({ type: 'auto-card', name: 'Auto', description: 'BYD-auto met accu, banden, klimaat, locatie en laden' });


/* =====================================================================
 * Thuis card — startscherm voor de muurtablet: aanwezigheid, thermostaat,
 * weer, camera's, verlichting en afval
 * ===================================================================== */

const TDEFAULTS = {
  climate: null,                       // leeg = de eerste climate.* (Toon)
  weather: null,                       // leeg = automatisch: Buienradar, anders de eerste weer-entiteit
  weather_place: null,               // plaatsnaam naast het weer
  rain_now: 'sensor.buienradar_regen_2u', // regen per 5 minuten voor de komende 2 uur (REST-sensor)  // voor de regenkans als de eigen verwachting die niet heeft
  radar_zoom: 11,                      // Buienradar-kaart: hoger = verder ingezoomd
  inside_name: 'Woonkamer',
  // Energie nu
  solar_power: 'sensor.ecu_current_power',
  solar_today: 'sensor.ecu_today_energy',
  grid_power: null,            // binnentemperatuur komt van de thermostaat
  gas_today: 'sensor.gas_vandaag',
  persons: [],
  cameras: [],                         // leeg = alle camera.*
  // lampen op naam (zoals in de Hue-app) of als entiteit; leeg = de eerste 8 Hue-kamers
  lights: [],
  calendars: [],
  // plaatje bij afspraken waarvan de titel een van deze woorden bevat
  agenda_icons: [{ match: 'picnic', image: '/local/picnic.png' }, { match: ['jarig', 'verjaardag'], image: '/local/taart.png' }],
  calendars_placeholder: null,                       // leeg = alle calendar.*; of [{ entity: 'calendar.…', color: '#ff453a' }]
  // rolluiken, in deze volgorde; de naam komt uit Home Assistant (zonder 'Rolluik ')
  covers: [],
  washer: 'sensor.wasmachine',
  dishwasher: 'vaatwasser',            // Home Connect: sensor.vaatwasser_status, …
  oven: 'oven',                        // Home Connect: sensor.oven_status, …         // Miele: status; programma, fase, tijden worden afgeleid (sensor.wasmachine_…)
  waste: [],                           // leeg = automatisch (Afvalbeheer); anders [{ name: 'GFT', type: 'gft', entity: 'sensor.…' }] — type: gft, pmd, papier, rest
  car_battery: 'sensor.byd_seal_batterijniveau',   // pil "Auto" op de telefoon (het tabblad Auto maakt daar plaats voor Kamers)
  car_charging: 'sensor.laadpaal_opladermodus',
  car_refresh: 'button.byd_seal_geforceerd_ophalen', car_updated: 'sensor.byd_seal_laatst_bijgewerkt', // auto verversen bij openen van de app (alleen als hij aan de laadpaal hangt)
  charger_power: 'sensor.laadpaal_laadvermogen',   // laadvermogen (W of kW) voor de laadkaart op Thuis
  charger_online: 'binary_sensor.laadpaal_online', charger_temp: 'sensor.laadpaal_temperatuur_intern', charger_firmware: 'update.laadpaal_firmware',
  charger_name: 'Zaptec Go 2', charger_current_a: 'number.laadpaal_max_stroom', charger_switch: 'switch.laadpaal_opladen',
  charger_stop: 'button.laadpaal_stop_het_opladen', charger_resume: 'button.laadpaal_hervat_het_opladen', charger_max_a: 16, car_start_button: 'button.byd_seal_start_charging', car_range: 'sensor.byd_seal_bereik',
  battery_kwh: 82.5,                               // bruikbare accucapaciteit, voor 'vol om'
  car_name: 'BYD Seal', car_image: '/local/auto-render.png',
  car_schedule: 'switch.byd_seal_schedule_enabled', car_start: 'time.byd_seal_start_time',
  efficiency: 0.92,
  // tabblad Kamers: per kamer de lampen (Hue-kamers worden herkend en niet dubbel geteld), rolluiken, temperatuur en apparaten;
  // icon: sofa, pot, door, toilet, bed, bath, desk, stairs, tree, drive, shed, wash; apps: was, dish, oven
  rooms: [],
};

const TSTYLE = `
.twrap { padding-bottom: 12px; --heat: #ff9a4d; --water: #38bdf8; background: radial-gradient(900px 500px at 15% -10%, rgba(80,120,220,.10), transparent 65%), radial-gradient(800px 500px at 95% 0%, rgba(60,140,200,.08), transparent 60%), var(--bg); padding-top: 34px; }
.thead { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 20px; margin-bottom: 15px; }
.thead > .xtabs { justify-self: center; align-self: start; } /* zelfde hoogte en afstand tot de vakken als op de andere tabbladen */
.hppl { display: flex; gap: 10px; justify-self: end; padding-bottom: 6px; } .hppl .av { width: 64px; } .hppl .av .nm { display: none; }
@media (max-width: 1100px) {
  .thead { grid-template-columns: minmax(0, 1fr) auto; row-gap: 16px; }
  .thead .clock { grid-column: 1; grid-row: 1; min-width: 0; }
  .thead .hppl { grid-column: 2; grid-row: 1; justify-self: end; gap: 6px; padding-bottom: 4px; }
  .thead > .xtabs { grid-column: 1 / -1; grid-row: 2; justify-self: start; }
  .hppl .av { width: auto; } .hppl .av .ring { width: 44px; height: 44px; } .hppl .av .badge { top: 36px; font-size: 8.5px; padding: 1px 6px; }
  .xhead { grid-template-columns: minmax(0, 1fr); } .xhead > .xtabs { justify-self: start; }
}
@media (max-width: 600px) { .clock { gap: 10px; } .clock b { font-size: 38px; } .clock div span { font-size: 15px; } .clock div #tdate { font-size: 12.5px !important; } }
.thead .xtabs { margin: 0; }
.clock { display: flex; align-items: last baseline; gap: 16px; }
.clock b { font-size: 46px; font-weight: 600; letter-spacing: -.03em; line-height: 1; font-variant-numeric: tabular-nums; }
.clock div { font-size: 14px; color: var(--muted); line-height: 1.4; } .clock div span { display: block; color: #dfe4ec; font-size: 17px; font-weight: 500; }
.tcols { display: grid; grid-template-columns: 1fr 1.12fr 1fr; gap: 16px; align-items: stretch; }
.tcol { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.tcol > .tile { padding: 16px 20px; }
.tcol > .tile.grow { flex: 1; }
.tile .th { margin-bottom: 10px; }
.aside b { color: #fff; font-weight: 600; }
.twrap .aside .cd { margin-right: 7px; }
.gl3 { width: 34px; height: 34px; flex: none; overflow: visible; vertical-align: middle; } .gl3.xs { width: 18px; height: 18px; }
.cd { width: 7px; height: 7px; border-radius: 50%; background: var(--c); box-shadow: 0 0 8px var(--c); display: inline-block; flex: none; }
@media (max-width: 1100px) { .tcols { grid-template-columns: 1fr; } }

/* aanwezig */
.ppl { display: flex; align-items: flex-start; justify-content: center; gap: 44px; flex-wrap: wrap; }
.av { position: relative; width: 70px; text-align: center; cursor: pointer; }
.av .ring { width: 54px; height: 54px; margin: 0 auto; border-radius: 50%; padding: 3px; background: var(--pc); box-shadow: 0 0 16px -2px var(--pc); }
.av.away .ring { box-shadow: none; }
.av .face { width: 100%; height: 100%; border-radius: 50%; border: 2px solid #12161d; background: #2a313c center/cover; display: grid; place-items: center; font-size: 20px; font-weight: 600; }
.av.away .face { filter: grayscale(.45) brightness(.85); }
.av .badge { position: absolute; left: 50%; top: 44px; transform: translateX(-50%); padding: 2px 8px; border-radius: 99px; font-size: 9.5px; font-weight: 700; letter-spacing: .06em; color: #fff; background: var(--pc); border: 2px solid #14181f; white-space: nowrap; text-transform: uppercase; }
.av .nm { font-size: 12.5px; color: #dfe4ec; margin-top: 11px; }

/* thermostaat */
.heat::before { content: ''; position: absolute; inset: 0; background: radial-gradient(60% 45% at 50% 32%, color-mix(in srgb, var(--c) 18%, transparent), transparent 70%); pointer-events: none; }
.tile.heat > * { position: relative; }
.tdial { position: relative; width: 100%; max-width: 215px; margin: 0 auto; touch-action: none; }
.tdial svg { width: 100%; height: auto; display: block; }
.tdial .knob { cursor: grab; }
.tdc { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding-top: 16px; pointer-events: none; }
.tdc .t { font-size: 50px; font-weight: 600; letter-spacing: -.03em; line-height: 1; font-variant-numeric: tabular-nums; pointer-events: auto; cursor: pointer; transition: color .2s; }
.tdc .t small { font-size: 20px; color: var(--muted); font-weight: 500; vertical-align: top; margin-left: 2px; }
.tdial.drag .tdc .t { color: var(--c); }
.tdc .s { font-size: 13.5px; color: var(--muted); margin-top: 8px; min-height: 17px; } .tdc .s b { color: var(--c); font-weight: 600; }
.tsteps { display: flex; gap: 14px; margin-top: 10px; pointer-events: auto; }
.tsteps div { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.05); border: 1px solid var(--line); font-size: 19px; cursor: pointer; user-select: none; }
.tsteps div:active { transform: scale(.94); }
/* thermostaatstand: één glazen keuzeknop met een menu */
.pick { position: relative; display: flex; justify-content: center; margin-top: 8px; }
.pb { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; padding: 10px 18px 10px 16px; min-width: 170px; justify-content: center; border-radius: 99px; background: linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.05)); border: 1px solid rgba(255,255,255,.16); box-shadow: inset 0 1px 0 rgba(255,255,255,.32), 0 8px 22px rgba(0,0,0,.35); color: #fff; font-size: 15px; font-weight: 600; }
.pb .fi { width: 19px; height: 19px; fill: currentColor; } .pb .chev { width: 16px; height: 16px; color: #aeb6c4; margin-left: auto; } .pb.wait { opacity: .55; }
.menu { display: none; position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%); width: 230px; padding: 8px; border-radius: 22px; z-index: 5; background: linear-gradient(160deg, rgba(150,170,230,.38), rgba(120,140,210,.24)); -webkit-backdrop-filter: blur(26px) saturate(180%); backdrop-filter: blur(26px) saturate(180%); border: 1px solid rgba(255,255,255,.22); box-shadow: inset 0 1px 0 rgba(255,255,255,.4), 0 18px 40px rgba(0,0,0,.5); }
.pick.open .menu { display: block; animation: popin .18s ease-out; } @keyframes popin { from { opacity: 0; transform: translateX(-50%) translateY(6px) scale(.96); } }
.mi { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; color: #fff; font-size: 15px; cursor: pointer; } .mi.on { background: rgba(255,255,255,.12); }
.mi i { width: 16px; display: grid; place-items: center; } .mi .ck { width: 15px; height: 15px; } .mi .fi { width: 19px; height: 19px; fill: currentColor; }

/* binnen & buiten */

/* bediening: lampen en rolluiken in één vak, met een licht streepje ertussen */
.bsep { height: 1px; background: linear-gradient(90deg, transparent, rgba(150,185,255,.38) 15%, rgba(150,185,255,.38) 85%, transparent); margin: 16px 0 14px; }
/* rolluiken */
.covers { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.cv { text-align: center; padding: 9px 3px 7px; border-radius: 14px; background: rgba(255,255,255,.03); border: 1px solid var(--line); cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; transition: background .3s, border-color .3s, transform .15s; }
.cv.on { background: linear-gradient(180deg, rgba(79,163,240,.14), rgba(79,163,240,.03)); border-color: rgba(79,163,240,.4); }
.cv.press { transform: scale(.95); }
.cv svg.shut { display: block; margin: 0 auto 4px; width: 32px; height: 32px; overflow: visible; }
.cv b { display: block; font-size: 11.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .cv span { font-size: 10px; color: var(--muted); }

/* weer */
.wseg { position: relative; display: inline-flex; margin: -6px 0 -4px; gap: 2px; padding: 2px; border-radius: 99px; background: rgba(255,255,255,.04); border: 1px solid var(--line); }
.wseg button { all: unset; position: relative; z-index: 1; cursor: pointer; font-size: 11.5px; padding: 3px 10px; border-radius: 99px; color: var(--muted); }
.wseg button.on { background: rgba(255,255,255,.09); color: var(--text); }
.radar { display: none; position: relative; border-radius: 14px; overflow: hidden; background: #0a0d12; }
.radar iframe { position: absolute; left: 0; top: 0; width: 550px; height: 512px; border: 0; transform-origin: 0 0; pointer-events: none; }
.radar .home { position: absolute; left: 50%; top: 50%; width: 9px; height: 9px; margin: -5px 0 0 -5px; border-radius: 50%; background: #fff; border: 2px solid #0a0d12; box-shadow: 0 0 0 5px rgba(255,255,255,.18); }
.tile.rmode .wview { display: none; } .tile.rmode .radar { display: block; }
.sky { position: relative; height: 100%; min-height: 236px; padding-top: 4px; cursor: pointer; }
.sky .skyic { position: absolute; right: 0; top: -4px; width: 150px; height: 150px; overflow: visible; }
.skyt { position: relative; font-size: 62px; font-weight: 600; letter-spacing: -.04em; line-height: 1; color: #fff; font-variant-numeric: tabular-nums; }
.skyc { position: relative; font-size: 16px; color: #dfe4ec; margin-top: 4px; }
.skyn { position: relative; margin-top: 14px; font-size: 13px; color: var(--muted); }
#wHint { color: #fff; font-size: 15px; font-weight: 600; margin-bottom: 3px; white-space: nowrap; } #wHint.warn { color: #ffb35c; }
.skyn .mm { display: flex; align-items: center; gap: 4px; font-size: 14px; } .skyn .mm i { font-style: normal; color: var(--muted); font-size: 12px; }
.skyn .mm b { margin-right: 8px; font-weight: 600; } .skyn .mm .lo { color: #7cc4ff; } .skyn .mm .hi { color: #ffb35c; }
.skyd { position: absolute; left: 0; right: 0; bottom: 2px; display: flex; justify-content: space-between; font-size: 13px; color: #dfe4ec; border-top: 1px solid var(--line); padding-top: 9px; }
.skyd svg { width: 18px; height: 18px; display: inline-block; vertical-align: -4px; margin: 0 3px; overflow: visible; }

/* camera's */
.cam { position: relative; flex: 1; min-height: 198px; border-radius: 14px; overflow: hidden; background: #0a0d12; }
.cam .live { position: absolute; inset: 0; pointer-events: none; }
.cam .hit { position: absolute; inset: 0; z-index: 1; -webkit-tap-highlight-color: transparent; }
.cam .live > * { height: 100%; display: block; --ha-card-border-radius: 0; --ha-card-border-width: 0; --ha-card-background: #0a0d12; }
.cam .tag { position: absolute; right: 11px; top: 11px; z-index: 2; display: flex; }
.cam .dotl { width: 9px; height: 9px; border-radius: 50%; background: #ff3b5c; box-shadow: 0 0 8px #ff3b5c; animation: blink 1.4s infinite; } @keyframes blink { 50% { opacity: .3; } }
.cam { cursor: pointer; }
.cfull { position: fixed; inset: 0; z-index: 20; display: flex; flex-direction: column; padding: 24px 32px; background: rgba(6,8,12,.9); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.cfull[hidden] { display: none; }
.cft { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; } .cft b { font-size: 20px; font-weight: 600; }
.cfl { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #ff6b81; } .cfl i { width: 8px; height: 8px; border-radius: 50%; background: #ff3b5c; }
.cfs { all: unset; cursor: pointer; margin-left: auto; height: 40px; padding: 0 14px 0 11px; border-radius: 99px; background: rgba(255,255,255,.1); display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 600; color: #fff; white-space: nowrap; flex: none; }
.cfs svg { width: 20px; height: 20px; } .cfs.on { background: #fff; color: #0a111d; }
#cfX { all: unset; cursor: pointer; margin-left: 8px; flex: none; width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,.08); text-align: center; line-height: 40px; font-size: 18px; color: var(--text); }
.cfbig { flex: 1; min-height: 0; border-radius: 18px; overflow: hidden; background: #000; }
.cfbig > * { height: 100%; display: block; --ha-card-border-radius: 0; --ha-card-border-width: 0; --ha-card-background: #000; }
.cfrow { display: flex; gap: 12px; justify-content: center; margin-top: 14px; }
.cfrow div { position: relative; width: 170px; height: 96px; border-radius: 12px; overflow: hidden; border: 2px solid transparent; opacity: .65; cursor: pointer; background: #0a0d12; }
.cfrow div.on { border-color: color-mix(in srgb, var(--home) 80%, transparent); opacity: 1; }
.cfrow img { width: 100%; height: 100%; object-fit: cover; display: block; } .cfrow span { position: absolute; left: 8px; bottom: 6px; font-size: 12px; text-shadow: 0 1px 3px #000; }
.thumbs { display: grid; grid-template-columns: repeat(var(--n, 3), 1fr); gap: 8px; margin-top: 8px; }
.thumb { position: relative; height: 64px; border-radius: 11px; overflow: hidden; background: #0a0d12; border: 1px solid var(--line); cursor: pointer; }
.thumb.on { border-color: color-mix(in srgb, var(--home) 70%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--home) 60%, transparent); }
.thumb img { width: 100%; height: 100%; object-fit: cover; opacity: .85; display: block; }
.thumb i { position: absolute; right: 7px; top: 6px; width: 7px; height: 7px; border-radius: 50%; background: var(--c); box-shadow: 0 0 6px var(--c); }

/* verlichting */
.lights { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.lt { position: relative; padding: 7px 3px 6px; text-align: center; border-radius: 14px; background: rgba(255,255,255,.03); border: 1px solid var(--line); overflow: hidden; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; transition: background .3s, border-color .3s, transform .15s; }
.lt.on { background: linear-gradient(180deg, color-mix(in srgb, var(--lc) 24%, transparent), color-mix(in srgb, var(--lc) 6%, transparent)); border: 1.5px solid var(--lc); box-shadow: 0 0 12px -2px var(--lc), 0 10px 24px -14px var(--lc); }
.lt.on .n { color: #fff; font-weight: 600; }
.lt.off2 { opacity: .45; } .lt.press { transform: scale(.95); }
.lt svg.bulb { width: 30px; height: 30px; display: block; margin: 2px auto 5px; overflow: visible; }
.lt .n { font-size: 11.5px; font-weight: 500; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lt .s { font-size: 10px; color: var(--muted); margin-top: 1px; }
@media (max-width: 600px) { .lt { padding: 8px 2px 7px; } .lt .n { font-size: 11px; white-space: normal; } }
.tcol > .was { margin-top: 0; }
/* energie nu */
.entile { cursor: pointer; }
.en { display: grid; grid-template-columns: auto 1fr auto 1fr auto; align-items: center; gap: 6px; margin-top: 2px; }
.en .n { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 64px; }
.en .c { width: 46px; height: 46px; border-radius: 50%; border: 2px solid var(--k); display: grid; place-items: center; background: #10141b; box-shadow: 0 0 12px -3px var(--k); }
.en .c svg { width: 28px; height: 28px; overflow: visible; }
.en b { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; } .en b small { font-size: 11px; color: var(--muted); font-weight: 500; margin-left: 2px; }
.en .l { font-size: 10px; letter-spacing: .08em; color: var(--muted); font-weight: 600; text-transform: uppercase; margin-top: -3px; }
.en .ln { height: 4px; margin-bottom: 34px; border-radius: 2px; background: radial-gradient(circle, var(--k) 1.6px, transparent 2.2px) 0 50% / 11px 4px repeat-x; filter: drop-shadow(0 0 3px var(--k)); animation: enflow 1.2s linear infinite; transition: opacity .4s; }
.en .ln.rev { animation-direction: reverse; } .en .ln.off { opacity: .12; animation: none; filter: none; }
@keyframes enflow { to { background-position: 11px 50%; } }
.was { margin-top: 12px; padding: 12px 14px; border-radius: 16px; background: rgba(255,255,255,.03); border: 1px solid var(--line); cursor: pointer; }
.was[hidden] { display: none; }
.was.run { background: linear-gradient(135deg, rgba(77,163,255,.12), rgba(77,163,255,.03)); border-color: rgba(77,163,255,.25); }
.was.done { background: linear-gradient(135deg, rgba(61,220,151,.12), rgba(61,220,151,.03)); border-color: rgba(61,220,151,.3); }
.was.bad { border-color: rgba(255,90,90,.45); }
.was.dish.run { background: linear-gradient(135deg, rgba(56,189,248,.12), rgba(56,189,248,.03)); border-color: rgba(56,189,248,.3); }
.was.oven.run { background: linear-gradient(135deg, rgba(255,154,77,.13), rgba(255,154,77,.03)); border-color: rgba(255,154,77,.32); }
.was.ready { background: rgba(255,255,255,.035); border-color: rgba(255,255,255,.1); } .was.ready .rt b { color: #cfd5e0; }
.was.cool { background: linear-gradient(135deg, rgba(255,114,98,.12), rgba(255,114,98,.03)); border-color: rgba(255,114,98,.3); }
.was.dish .rt b { color: #7dd3fc; } .was.oven .rt b { color: #ffb37a; } .was.cool .rt b { color: #ff8a8a; }
.was.dish .bar i { background: linear-gradient(90deg, #a5e4ff, #38bdf8); box-shadow: 0 0 8px #38bdf8; } .was.oven .bar i { background: linear-gradient(90deg, #ffd3a8, #ff9a4d); box-shadow: 0 0 8px #ff9a4d; }
.achips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.achips em { font-style: normal; font-size: 11px; color: #cfe3ff; padding: 3px 9px; border-radius: 99px; background: rgba(255,255,255,.06); border: 1px solid var(--line); }
/* meldingen */
#notTile[hidden], #enTile[hidden] { display: none; }
.alrt { display: flex; flex-direction: column; gap: 12px; } .alrt[hidden] { display: none; }
.alr { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 22px; cursor: pointer; background: linear-gradient(135deg, rgba(255,69,58,.34), rgba(150,28,40,.34)) #0e1626; box-shadow: inset 0 0 0 1.5px rgba(255,90,80,.55), 0 10px 30px -12px rgba(255,59,48,.55); }
.alr i { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,69,58,.34); flex: none; animation: lkp 1.6s ease-in-out infinite; } .alr i .ri2 { width: 30px; height: 30px; }
.alr b { display: block; font-size: 17px; font-weight: 700; color: #ffd2cc; } .alr span { display: block; font-size: 13.5px; color: #ffb0a8; margin-top: 2px; }
.alr em { margin-left: auto; font-style: normal; font-size: 26px; color: #ffb0a8; }
.alr.warn { background: linear-gradient(135deg, rgba(255,159,10,.30), rgba(150,80,10,.30)) #0e1626; box-shadow: inset 0 0 0 1.5px rgba(255,170,60,.5); } .alr.warn i { background: rgba(255,159,10,.3); animation: none; } .alr.warn b { color: #ffe2b8; } .alr.warn span, .alr.warn em { color: #ffc680; }
@keyframes lkp { 50% { box-shadow: 0 0 0 7px rgba(255,69,58,0); } 0%, 100% { box-shadow: 0 0 0 0 rgba(255,69,58,.5); } }
.shsrc { float: right; font-style: normal; text-transform: none; letter-spacing: 0; font-weight: 500; color: var(--muted); }
.shpl { white-space: nowrap; display: flex; flex-direction: column; justify-content: center; margin-left: 14px; padding-left: 14px; border-left: 1px solid rgba(255,255,255,.12); font-size: 13px; color: var(--muted); line-height: 1.35; align-self: center; } .shpl em { font-style: normal; font-size: 17px; font-weight: 600; color: #fff; }
.nrow .mi svg.ri2 { width: 21px; height: 21px; position: static; margin: 0; transform: none; }
.nrow { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-top: 1px solid var(--line); } .nrow:first-child { border-top: 0; padding-top: 0; }
.nrow .mi { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; gap: 0; border-radius: 50%; background: color-mix(in srgb, var(--c) 18%, transparent); color: var(--c); flex: none; } .nrow .mi svg { width: 16px; height: 16px; }
.nrow > div { flex: 1; min-width: 0; } .nrow b { display: block; font-size: 13.5px; font-weight: 600; } .nrow span { display: block; font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nrow button { all: unset; cursor: pointer; font-size: 11.5px; color: #cfe3ff; padding: 3px 10px; border-radius: 99px; background: rgba(255,255,255,.06); border: 1px solid var(--line); }
.was .r { display: flex; align-items: center; gap: 12px; } .was svg { width: 38px; height: 38px; flex: none; overflow: visible; }
.was .t { flex: 1; min-width: 0; } .was .t b { display: block; font-size: 15px; font-weight: 600; } .was .t .tm { font-size: 22px; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.was .t span { font-size: 12.5px; color: var(--muted); } .was .rt { text-align: right; font-size: 12px; color: var(--muted); white-space: nowrap; }
.was .rt b { display: block; font-size: 13px; font-weight: 600; color: #cfe3ff; margin-bottom: 2px; } .was.done .rt b { color: #9ff0c4; } .was.bad .rt b { color: #ff8a8a; }
.was.idle { padding: 9px 14px; } .was.idle svg { width: 26px; height: 26px; } .was.idle .t b { font-size: 13.5px; font-weight: 500; }
.was.xchg { padding: 12px 16px 14px; border-radius: 22px; background: radial-gradient(90% 120% at 85% 60%, rgba(94,225,208,.28), transparent 60%), linear-gradient(135deg, #10283a, #0e1a2c) !important; border: 1px solid rgba(94,225,208,.38); box-shadow: 0 14px 34px -18px rgba(94,225,208,.75); }
.was.xchg .xh { display: flex; align-items: center; gap: 10px; } .was.xchg .xh b { display: block; font-size: 15px; font-weight: 700; white-space: nowrap; } .was.xchg .xh span { display: block; font-size: 12.5px; color: #9fb3c8; white-space: nowrap; }
.was.xchg .xq { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; background: linear-gradient(160deg, rgba(94,225,208,.35), rgba(25,120,110,.35)); color: #5ee1d0; flex: none; } .was.xchg .xq svg { width: 18px; height: 18px; fill: currentColor; }
.was.xchg .xp { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 99px; font-size: 13px; font-weight: 700; color: #d6fbf5; background: rgba(94,225,208,.22); border: 1px solid rgba(94,225,208,.45); white-space: nowrap; } .was.xchg .xp svg { width: 14px; height: 14px; fill: #5ee1d0; flex: none; }
.was.xchg .xr { display: flex; align-items: center; gap: 6px; } .was.xchg .xl { flex: 1; min-width: 0; }
.was.xchg .xh b .xs { display: inline; font-size: 14px; font-weight: 500; color: #9fb3c8; margin: 0; }
.was.xchg .xtop { display: flex; align-items: center; gap: 12px; } .was.xchg .xtop .xbig { margin: 0; }
.was.xchg .xnx { padding-left: 12px; border-left: 1px solid rgba(255,255,255,.14); line-height: 1.3; white-space: nowrap; } .was.xchg .xnx b { display: block; font-size: 15px; font-weight: 600; } .was.xchg .xnx span { display: block; font-size: 13px; color: #9fb3c8; }
.was.xchg .xbig { margin-top: 2px; font-size: 34px; font-weight: 700; letter-spacing: -.03em; line-height: 1; } .was.xchg .xbig small { font-size: 22px; margin-left: 1px; }
.was.xchg .xk { font-size: 13px; color: #a9bccd; margin-top: 4px; white-space: nowrap; }
.was.xchg .bar { height: 6px; margin-top: 10px; } .was.xchg .bar i { background: linear-gradient(90deg, #1fa893, #7cf0dd); box-shadow: 0 0 10px rgba(94,225,208,.8); }
.was.xchg svg.xi { width: 150px; height: 72px; flex: none; margin-right: -4px; }
.was.xchg .evp { stroke-dasharray: 12 120; animation: evp 1.8s linear infinite; filter: drop-shadow(0 0 4px #5ee1d0); }
@keyframes evp { from { stroke-dashoffset: 20; } to { stroke-dashoffset: -100; } }
.was.xchg.evwait { background: linear-gradient(135deg, #142338, #0f1a2c) !important; border-color: rgba(140,170,220,.22); box-shadow: none; }
.was.xchg.evwait .xq { background: rgba(255,255,255,.08); color: #cfd8e6; } .was.xchg.evwait .xh span, .was.xchg.evwait .xk { color: #93a3bb; }
.was.xchg.evwait .xp { color: #dbe6f5; background: rgba(255,255,255,.07); border-color: rgba(255,255,255,.16); } .was.xchg.evwait .xp svg { fill: #cfd8e6; }
.was.xchg.evwait .bar i { background: linear-gradient(90deg, #5aa8ff, #8fd0ff); box-shadow: 0 0 8px rgba(90,168,255,.6); }
.was .bar { height: 6px; border-radius: 99px; background: rgba(255,255,255,.08); margin-top: 10px; overflow: hidden; }
.was .bar i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #7cc4ff, #4da3ff); box-shadow: 0 0 8px #4da3ff; transition: width 1s; } .was.done .bar i { background: #3ddc97; box-shadow: 0 0 8px #3ddc97; }

/* afval */
.wsub { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); font-weight: 600; margin: 12px 0 12px; }
.wsub em { font-style: normal; text-transform: none; letter-spacing: 0; font-weight: 500; color: #9ff0c4; }
#mAfval[hidden], #afTile[hidden], #agTile[hidden] { display: none; } #mAfval .wsub, #afTile .wsub { margin-top: 0; }
/* agenda in Apple-stijl: neemt de ruimte die overblijft */
.agt { cursor: default; }
.agin .th { margin-bottom: 2px; }
.agin .sec { font-size: 12px; font-weight: 700; letter-spacing: .06em; color: #6b7486; margin: 12px 0 6px; }
.ev { display: flex; gap: 10px; margin: 0 0 9px; cursor: pointer; }
.ev i { width: 5px; border-radius: 3px; background: var(--c); flex: none; }
.ev div { min-width: 0; } .ev b { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; font-size: 14.5px; font-weight: 600; line-height: 1.25; overflow: hidden; }
.ev span { display: block; font-size: 13px; color: #aab2c0; margin-top: 1px; }
.ev > div { flex: 1; } .ev .eimg { height: 34px; width: auto; align-self: center; flex: none; margin-left: 8px; filter: drop-shadow(0 4px 6px rgba(0,0,0,.4)); } .ev.past { opacity: .4; }
.agin .ev + .sec { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 14px; }
.agin .none { font-size: 13px; color: var(--muted); margin-top: 8px; }
@media (min-width: 1101px) {
  .agt { flex: 1 1 0; min-height: 0; position: relative; overflow: hidden; padding: 0 !important; }
  .agin { position: absolute; inset: 0; padding: 14px 20px; overflow: hidden; -webkit-mask-image: linear-gradient(#000 calc(100% - 28px), transparent); mask-image: linear-gradient(#000 calc(100% - 28px), transparent); }
}
.bins { display: grid; grid-template-columns: repeat(var(--n, 4), 1fr); gap: 8px; }
.bin { position: relative; text-align: center; padding: 8px 4px 6px; border-radius: 14px; background: rgba(255,255,255,.03); border: 1px solid var(--line); cursor: pointer; }
.bin svg { width: 50px; height: 50px; display: block; margin: 2px auto 2px; overflow: visible; }
.bin .n { font-size: 12px; font-weight: 600; } .bin .d { font-size: 10.5px; color: var(--muted); margin-top: 2px; }
.bin.next { background: linear-gradient(180deg, color-mix(in srgb, var(--bc) 22%, transparent), color-mix(in srgb, var(--bc) 6%, transparent)); border-color: color-mix(in srgb, var(--bc) 55%, transparent); box-shadow: 0 10px 24px -14px var(--bc); }
.bin.next .d { color: #fff; font-weight: 600; }
.bin .tag { position: absolute; top: -8px; left: 50%; transform: translateX(-50%); padding: 2px 8px; border-radius: 99px; font-size: 9.5px; font-weight: 700; letter-spacing: .06em; color: #fff; background: var(--bc); white-space: nowrap; }
.wempty { font-size: 13px; color: var(--muted); line-height: 1.5; padding: 12px 14px; border-radius: 14px; border: 1px dashed rgba(255,255,255,.12); }

/* ---------- telefoon ---------- */
.mcol, .lt .mi2, .lt .ms, .cv .mi2, #pic, .mcvh { display: none; }
.was.pic { background: linear-gradient(135deg, rgba(255,77,77,.13), rgba(255,77,77,.03)); border-color: rgba(255,90,90,.32); }
.was.pic .rt b { color: #ff8f8f; } .was.pic .t .tm { font-size: 20px; }
.was.pic .pici { width: 50px; height: auto; flex: none; filter: drop-shadow(0 4px 6px rgba(0,0,0,.45)); }
.was.pic .bar i { background: linear-gradient(90deg, #ffb3b3, #ff5a5a); box-shadow: 0 0 8px #ff5a5a; }
@media (max-width: 600px) {
  .twrap { padding-top: 14px; background: radial-gradient(520px 360px at 15% 260px, rgba(80,120,220,.09), transparent 70%), radial-gradient(480px 360px at 95% 320px, rgba(60,140,200,.07), transparent 65%), var(--bg); }
  .thead { display: block; margin: 0; } .thead .clock, .thead .hppl { display: none; }
  .tcols { display: none; }
  .mcol { display: flex; flex-direction: column; gap: 12px; }
  .mstack { display: flex; flex-direction: column; gap: 12px; } .mstack:empty { display: none; }
  .mstack > #pic:not([hidden]) { display: block; }
  .mstack > .gone { display: none !important; }
  .twrap { padding-bottom: calc(112px + env(safe-area-inset-bottom, 0px) / 3); }
  .mdate { cursor: pointer; }
  /* panelen */
  .shv { position: fixed; inset: 0; z-index: 60; background: rgba(3,6,12,.55); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
  .sheet { --k: #ffc83d; position: fixed; left: 0; right: 0; bottom: 0; z-index: 61; max-height: calc(100vh - env(safe-area-inset-top, 0px) - 30px); overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; box-sizing: border-box;
    border-radius: 28px 28px 0 0; padding: 10px 16px calc(24px + env(safe-area-inset-bottom, 0px)); color: var(--text);
    background: radial-gradient(600px 320px at 30% 0%, color-mix(in srgb, var(--k) 12%, transparent), transparent 70%), linear-gradient(180deg, #152036, #0e1626); border-top: 1px solid rgba(130,170,255,.18); box-shadow: 0 -20px 40px rgba(0,0,0,.5); transition: transform .2s; animation: shup .28s cubic-bezier(.3,.7,.2,1); }
  @keyframes shup { from { transform: translateY(60%); opacity: .4; } }
  .shv[hidden], .sheet[hidden] { display: none; }
  .sheet .grab { width: 40px; height: 5px; border-radius: 9px; background: rgba(255,255,255,.25); margin: 0 auto 10px; }
  .shtop { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
  .shx { all: unset; cursor: pointer; flex: none; width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,.1); display: grid; place-items: center; font-size: 15px; }
  .shttl { font-size: 13px; font-weight: 700; letter-spacing: .08em; color: var(--muted); text-transform: uppercase; }
  .shnow { font-size: 56px; font-weight: 600; letter-spacing: -.04em; line-height: 1; margin-top: 6px; font-variant-numeric: tabular-nums; } .shnow small { font-size: 24px; color: var(--muted); vertical-align: top; font-weight: 500; }
  .shst { font-size: 15px; font-weight: 600; color: var(--k); margin-top: 6px; display: flex; align-items: center; gap: 6px; } .shst b { color: var(--text); }
  .shst .gf { width: 18px; height: 18px; overflow: visible; display: block; } .shst .ok { display: grid; } .shst .ok svg { width: 17px; height: 17px; }
  .shcard { margin-top: 14px; padding: 12px 14px; border-radius: 18px; background: rgba(255,255,255,.05); }
  .shlab { font-size: 11.5px; font-weight: 700; letter-spacing: .08em; color: var(--muted); text-transform: uppercase; margin-bottom: 8px; display: flex; justify-content: space-between; gap: 8px; }
  .shlab span { text-transform: none; letter-spacing: 0; font-weight: 500; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sheet #tTile { background: none; border: 0; box-shadow: none; padding: 0; } .sheet #tTile::before { display: none; } .sheet #tTile > .th { display: none; }
  .sheet .tdial { max-width: 250px; } .sheet .tdc .s { display: none; }
  .shchips { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 8px; }
  .shchips button { all: unset; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 4px; border-radius: 16px; background: rgba(255,255,255,.06); font-size: 12.5px; font-weight: 600; color: #cfd5e0; -webkit-tap-highlight-color: transparent; }
  .shchips .fi { width: 22px; height: 22px; fill: currentColor; } .shchips button.on { background: color-mix(in srgb, var(--c) 16%, transparent); color: #fff; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 55%, transparent); }
  .shwx { display: flex; align-items: center; gap: 6px; } .shwx svg { width: 88px; height: 88px; overflow: visible; } .shwx b { font-size: 58px; font-weight: 600; letter-spacing: -.04em; line-height: 1; }
  .shcond { font-size: 17px; color: #dfe4ec; margin-top: 2px; } .shmm { font-size: 14px; color: var(--muted); margin-top: 4px; } .shmm .lo { color: #7cc4ff; } .shmm .hi { color: #ffb35c; }
  .shrain { display: flex; align-items: flex-end; gap: 2px; height: 46px; } .shrain i { flex: 1; background: linear-gradient(180deg, #7cc4ff, #2f7fe0); border-radius: 2px 2px 0 0; }
  .shrx { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-top: 5px; }
  .shhrs { display: flex; justify-content: space-between; } .shhrs div { display: flex; flex-direction: column; align-items: center; gap: 5px; font-size: 12px; color: var(--muted); width: 46px; }
  .shhrs svg { width: 26px; height: 26px; overflow: visible; } .shhrs b { color: var(--text); font-size: 14px; font-weight: 600; } .shhrs em { font-style: normal; font-size: 10.5px; color: #38bdf8; min-height: 12px; white-space: nowrap; }
  .shday { display: grid; grid-template-columns: 62px 28px 30px 1fr 34px; align-items: center; gap: 8px; padding: 7px 0; border-top: 1px solid var(--line); font-size: 14.5px; } .shlab + .shday { border-top: 0; }
  .shday svg { width: 26px; height: 26px; overflow: visible; } .shday .l { color: var(--muted); text-align: right; } .shday .h { font-weight: 600; }
  .shbar { position: relative; height: 5px; border-radius: 9px; background: rgba(255,255,255,.08); } .shbar i { position: absolute; top: 0; bottom: 0; border-radius: 9px; background: linear-gradient(90deg, #7cc4ff, #ffd166, #ff9a4d); }
  .shgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; } .shgrid div { padding: 12px 14px; border-radius: 18px; background: rgba(255,255,255,.05); }
  .shgrid small { display: block; font-size: 11.5px; font-weight: 700; letter-spacing: .08em; color: var(--muted); text-transform: uppercase; } .shgrid b { display: block; font-size: 22px; font-weight: 600; margin-top: 6px; } .shgrid span { font-size: 12.5px; color: var(--muted); }
  .shrbtn { all: unset; cursor: pointer; display: block; box-sizing: border-box; width: 100%; margin-top: 14px; padding: 13px; border-radius: 16px; background: rgba(56,189,248,.14); color: #7dd3fc; text-align: center; font-weight: 600; font-size: 14.5px; }
  .shrbtn[hidden], .shrad[hidden] { display: none; }
  /* rolluikpaneel */
  .sheet.full.lamp { --k: #ffb02e; background: radial-gradient(520px 420px at 75% 8%, rgba(255,176,46,.26), transparent 70%), radial-gradient(500px 420px at 10% 95%, rgba(255,120,60,.16), transparent 70%), linear-gradient(180deg, #2a2218, #15120f); }
  .sheet.lamp .cvh span, .sheet.lamp .hh button { color: #ffc56b; }
  .lsl { height: min(300px, 36vh); background: rgba(0,0,0,.35); }
  .lsf { position: absolute; left: 0; right: 0; bottom: 0; height: 0; background: linear-gradient(180deg, #ffe08a, #ffb02e); transition: height .25s; }
  .lsl .lsi { color: #5a3a06; } .lsl.off .lsi { color: rgba(255,255,255,.6); } .lsi svg { fill: currentColor; }
  .lcols { display: flex; justify-content: center; gap: 14px; margin: 20px 0 2px; }
  .lcols button { all: unset; cursor: pointer; width: 46px; height: 46px; border-radius: 50%; background: var(--c); box-shadow: inset 0 1px 0 rgba(255,255,255,.45), inset 0 -2px 4px rgba(0,0,0,.15); border: 1px solid rgba(255,255,255,.25); box-sizing: border-box; }
  .lcols button.on { outline: 3px solid #fff; outline-offset: 3px; } .lcols .more { background: conic-gradient(#ff5e5e, #ffd34d, #5eff8a, #5ecbff, #a35eff, #ff5ec4, #ff5e5e); }
  .lpw { display: flex; justify-content: center; margin-top: 18px; }
  .lpw button { all: unset; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: rgba(255,255,255,.8); -webkit-tap-highlight-color: transparent; }
  .lpw svg { width: 72px; height: 72px; padding: 20px; box-sizing: border-box; border-radius: 50%; color: #fff; background: linear-gradient(180deg, rgba(255,255,255,.2), rgba(255,255,255,.06)); border: 1px solid rgba(255,255,255,.18); box-shadow: inset 0 1px 0 rgba(255,255,255,.4), 0 10px 24px -12px rgba(0,0,0,.6); transition: transform .12s; }
  .lpw button:active svg { transform: scale(.92); }
  .hico.lmp svg { fill: currentColor; } .hico.lmp.on { background: rgba(255,176,46,.24); color: #ffc56b; }
  .sheet.full.therm { --k: #7cc0ff; background: radial-gradient(520px 420px at 80% 5%, rgba(70,140,255,.30), transparent 70%), radial-gradient(500px 420px at 10% 95%, rgba(90,80,200,.22), transparent 70%), linear-gradient(180deg, #14284a, #0d1730); }
  .sheet.full.therm.hot { --k: #ffd2a8; background: linear-gradient(180deg, #ee7a34 0%, #e8702e 22%, #d8682e 34%, #b85a34 44%, #8a4a3c 53%, #5c3c48 62%, #36304f 71%, #1d2848 80%, #14213e 90%, #0d1730 100%); }
  .therm.hot #thArc { filter: drop-shadow(0 0 16px rgba(255,200,140,.55)); } .therm.hot .tht { color: #fff !important; } .therm.hot .thl { color: rgba(255,255,255,.85); } .therm.hot .thp { background: rgba(0,0,0,.18); }
  .sheet.therm .cvh span, .sheet.therm .hh button { color: var(--k); }
  .thd { position: relative; width: 290px; height: 244px; margin: 8px auto 0; } .thd svg { width: 100%; height: 100%; overflow: visible; touch-action: none; cursor: grab; }
  .thc { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding-top: 10px; pointer-events: none; }
  .thn { font-size: 60px; font-weight: 600; letter-spacing: -.03em; line-height: 1; font-variant-numeric: tabular-nums; } .thn small { font-size: 26px; vertical-align: top; color: rgba(255,255,255,.7); }
  .thl { font-size: 15px; color: rgba(255,255,255,.75); margin-top: 8px; }
  .tht { display: flex; align-items: center; gap: 6px; font-size: 24px; font-weight: 600; color: #3ddc97; margin-top: 2px; } .therm.hot .tht { color: #ffb067; }
  .tht .gf { width: 24px; height: 24px; overflow: visible; } .tht .okc { display: grid; } .tht .okc svg { width: 20px; height: 20px; }
  .thb { gap: 40px; margin: 0; } .thb .tpow { display: none; }
  .thsel { position: relative; display: flex; justify-content: center; margin-top: 38px; }
  .thp { all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; width: 240px; height: 54px; border-radius: 27px; background: rgba(0,0,0,.25); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); font-size: 17px; font-weight: 600; color: #fff; }
  .thp .fi { width: 20px; height: 20px; fill: currentColor; } .thp .chev { width: 16px; height: 16px; margin-left: 18px; opacity: .7; }
  .thm { display: none; position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%); width: 240px; padding: 6px; border-radius: 20px; z-index: 3; background: rgba(60,66,90,.86); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,.14); }
  .thsel.open .thm { display: block; }
  .thm button { all: unset; cursor: pointer; display: flex; align-items: center; gap: 10px; width: 100%; box-sizing: border-box; padding: 11px 12px; border-radius: 14px; font-size: 16px; color: #fff; } .thm button.on { background: rgba(255,255,255,.12); }
  .thm i { width: 16px; font-style: normal; font-size: 14px; } .thm .fi { width: 19px; height: 19px; fill: currentColor; }
  .thlg i { display: inline-block; width: 10px; height: 3px; border-radius: 2px; vertical-align: middle; margin: 0 4px 0 8px; } .thsum { font-size: 12px; color: rgba(255,255,255,.6); margin-top: 8px; }
  .hico .fi { width: 17px; height: 17px; fill: currentColor; }
  .tqseg { display: flex; background: rgba(0,0,0,.22); border-radius: 11px; padding: 3px; margin: 14px 0; }
  .tqseg button { all: unset; flex: 1; text-align: center; cursor: pointer; color: rgba(255,255,255,.6); font-size: 14px; font-weight: 600; padding: 7px 0; border-radius: 9px; }
  .tqseg button.on { background: rgba(255,255,255,.16); color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
  .tqc { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; background: rgba(255,255,255,.06); border-radius: 20px; padding: 14px 14px 12px; }
  .tqr { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; } .tqr .r { text-align: right; }
  .tqr small { display: block; font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: rgba(255,255,255,.6); font-weight: 600; white-space: nowrap; }
  .tqr b { display: flex; align-items: center; gap: 6px; font-size: 32px; font-weight: 700; letter-spacing: -.02em; line-height: 1.15; white-space: nowrap; font-variant-numeric: tabular-nums; } .tqr .r b { justify-content: flex-end; }
  .tqr b sup { font-size: 17px; align-self: flex-start; margin: 4px 0 0 -5px; } .tqr b.bl { color: #8fc6ff; } .tqr b .gf { width: 20px; height: 20px; }
  .tqr b .rg { font-size: 14px; font-weight: 500; color: rgba(255,255,255,.6); margin-left: 4px; letter-spacing: 0; }
  svg.tqch { width: 100%; height: 200px; display: block; touch-action: none; overflow: visible; cursor: crosshair; } .tqch text { fill: rgba(235,240,250,.5); font-size: 11px; }
  .tqlg { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: rgba(255,255,255,.6); margin-top: 8px; } .tqlg i { display: inline-block; width: 12px; height: 3px; border-radius: 2px; vertical-align: middle; margin-right: 5px; }
  .tqst { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; } .tqst div { background: rgba(255,255,255,.06); border-radius: 14px; padding: 9px 11px; min-width: 0; }
  .tqst small { display: block; font-size: 10.5px; color: rgba(255,255,255,.6); text-transform: uppercase; letter-spacing: .05em; font-weight: 600; white-space: nowrap; }
  .tqst b { display: block; font-size: 16.5px; white-space: nowrap; } .tqst b.up { color: #ffb27a; } .tqst b.dn { color: #9fe0a8; } .tqst em { display: block; font-style: normal; font-size: 11px; color: rgba(255,255,255,.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hsec { font-size: 20px; font-weight: 700; margin: 22px 4px 0; }
  /* bediening (rolluik, lamp, thermostaat) iets lager in het paneel */
  .sheet.full.therm .cvh, .sheet.full.lamp .cvh, .sheet.full:has(.cvsl) .cvh { margin-top: 26px; }
  .sheet.full .cvsl, .sheet.full .thd { margin-top: 7vh !important; }
  .sheet.full { top: auto; height: 90vh; --k: #5aa2ff; background: radial-gradient(520px 420px at 75% 8%, rgba(70,140,255,.30), transparent 70%), radial-gradient(500px 420px at 10% 95%, rgba(60,90,200,.22), transparent 70%), linear-gradient(180deg, #14284a, #0d1730); }
  .cvx { position: absolute; right: 16px; top: 14px; background: none; color: rgba(255,255,255,.7); font-size: 19px; }
  .cvh { text-align: center; margin-top: 14px; } .cvh b { display: block; font-size: 30px; font-weight: 700; } .cvh span { display: block; font-size: 17px; font-weight: 600; color: #7cc0ff; margin-top: 6px; }
  .cvsl { position: relative; width: 140px; height: min(340px, 40vh); margin: 24px auto 0; border-radius: 42px; overflow: hidden; background: rgba(6,14,32,.5); touch-action: none; cursor: ns-resize; }
  .cvf { position: absolute; left: 0; right: 0; top: 0; height: 0; background: linear-gradient(180deg, #8fc6ff, #5aa2ff); transition: height .25s; }
  .cvi { position: absolute; left: 50%; bottom: 24px; width: 40px; height: 40px; margin-left: -20px; color: #fff; z-index: 1; } .cvi svg { width: 40px; height: 40px; display: block; fill: currentColor; }
  .cvb { display: flex; justify-content: center; gap: 22px; margin: 22px 0 8px; }
  .cvhb { all: unset; cursor: pointer; position: absolute; left: 14px; top: 12px; width: 36px; height: 36px; display: grid; place-items: center; color: rgba(255,255,255,.75); } .cvhb svg { width: 22px; height: 22px; }
  .hh button { all: unset; cursor: pointer; display: flex; align-items: center; gap: 2px; color: #7cc0ff; font-size: 16px; font-weight: 600; } .hh button svg { width: 22px; height: 22px; }
  .hti { text-align: center; margin-top: 4px; } .hti b { display: block; font-size: 24px; font-weight: 700; } .hti span { font-size: 14px; color: var(--muted); }
  .hg { width: 100%; height: 80px; display: block; } .hax { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--muted); margin-top: 4px; }
  .hday { font-size: 12px; font-weight: 700; letter-spacing: .08em; color: var(--muted); text-transform: uppercase; margin: 18px 4px 8px; }
  .hrow { display: flex; gap: 12px; padding: 0 4px 14px; } .hline { position: relative; width: 34px; flex: none; display: flex; justify-content: center; }
  .hline::after { content: ''; position: absolute; top: 36px; bottom: -14px; width: 2px; background: rgba(255,255,255,.08); } .hrow:last-child .hline::after, .hrow:has(+ .hday) .hline::after { display: none; }
  .hico { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.08); color: #aeb6c4; box-shadow: none; filter: none; } .hico.dn { background: rgba(61,139,255,.22); color: #a6d0ff; } .hico svg { width: 18px; height: 18px; }
  .htx { flex: 1; min-width: 0; padding-top: 2px; } .htx b { display: block; font-size: 15px; font-weight: 600; } .htx span { display: block; font-size: 12.5px; color: var(--muted); margin-top: 2px; }
  .htm { font-size: 13px; color: var(--muted); padding-top: 3px; font-variant-numeric: tabular-nums; } .hnone { font-size: 13px; color: var(--muted); text-align: center; margin: 24px 0; }
  .cvb button { all: unset; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: rgba(255,255,255,.8); -webkit-tap-highlight-color: transparent; }
  .cvb button { font-size: 14px; }
  .cvb button svg { width: 80px; height: 80px; padding: 22px; box-sizing: border-box; border-radius: 50%; color: #fff; transition: transform .12s, background .2s;
    background: linear-gradient(180deg, rgba(255,255,255,.2), rgba(255,255,255,.06)); border: 1px solid rgba(255,255,255,.18); box-shadow: inset 0 1px 0 rgba(255,255,255,.4), inset 0 -1px 0 rgba(255,255,255,.06), 0 10px 24px -12px rgba(0,0,0,.6); -webkit-backdrop-filter: blur(16px) saturate(1.5); backdrop-filter: blur(16px) saturate(1.5); }
  .cvb button:active svg { transform: scale(.92); background: rgba(90,162,255,.4); }
  .shrad { position: relative; margin-top: 14px; border-radius: 16px; overflow: hidden; background: #0a0d12; }
  .shrad iframe { position: absolute; left: 0; top: 0; width: 550px; height: 512px; border: 0; transform-origin: 0 0; pointer-events: none; }
  .shrad .home { position: absolute; left: 50%; top: 50%; width: 9px; height: 9px; margin: -5px 0 0 -5px; border-radius: 50%; background: #fff; border: 2px solid #0a0d12; box-shadow: 0 0 0 5px rgba(255,255,255,.18); }
  /* volledig camerascherm: onder de klok beginnen, boven de tabbalk liggen, beeld in de eigen verhouding */
  .cfull { z-index: 50; padding: calc(env(safe-area-inset-top, 0px) + 12px) 14px calc(env(safe-area-inset-bottom, 0px) + 14px); justify-content: center; }
  .cft { gap: 8px; } .cft b { font-size: 19px; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .cfl { flex: none; }
  .cfbig { flex: none; width: 100%; aspect-ratio: var(--ar, 4 / 3); max-height: 70vh; }
  .cfrow { justify-content: flex-start; overflow-x: auto; scrollbar-width: none; } .cfrow::-webkit-scrollbar { display: none; }
  .cfrow div { width: 112px; height: 64px; flex: none; }
  .mstack > .was, #notList .nrow, .alrt .alr { position: relative; z-index: 1; touch-action: pan-y; }
  #camTag { display: none; } /* telefoon: geen knipperend rood bolletje op het camerabeeld */
  .mstack > .was { background-color: #0e1626 !important; } #notList .nrow.swiping { background: var(--tile2); }
  .swact { position: absolute; z-index: 0; display: flex; justify-content: flex-end; align-items: stretch; padding: 7px; box-sizing: border-box; background: rgba(255,69,58,.16); }
  .swact button { all: unset; cursor: pointer; width: 84px; border-radius: 14px; background: #ff453a; color: #fff; font-size: 12.5px; font-weight: 600; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; transition: width .2s; }
  .swact button svg { width: 22px; height: 22px; } .swact.full button { width: 100%; }
  .mstack > .was { margin: 0; padding: 14px 16px; border-radius: 20px; } .mstack > .was[hidden], .mstack > [hidden] { display: none; }
  .mstack > .was svg { width: 48px; height: 48px; } .mstack > .was.idle svg { width: 30px; height: 30px; }
  /* kop */
  .mhead { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; margin: 2px 2px 2px; }
  .mdate { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
  .mdate svg { width: 24px; height: 24px; overflow: visible; } .mdate b { color: var(--text); font-weight: 600; } .mdate b::after { content: '·'; margin-left: 6px; color: var(--muted); }
  .mhead h1 { font-size: 31px; font-weight: 700; letter-spacing: -.02em; margin-top: 2px; }
  #mPpl .hppl { display: flex; gap: 0; padding: 0 0 4px; } #mPpl .av { width: auto; margin-left: -8px; } #mPpl .av .ring { width: 40px; height: 40px; padding: 2px; }
  #mPpl .av .badge, #mPpl .av .nm { display: none; } #mPpl .av .face { font-size: 15px; }
  /* statuspillen */
  .mpills { display: flex; gap: 8px; overflow-x: auto; margin: 0 -12px; padding: 2px 12px 4px; scrollbar-width: none; } .mpills::-webkit-scrollbar { display: none; }
  .mp { flex: none; display: flex; align-items: center; gap: 9px; padding: 9px 16px 9px 11px; border-radius: 99px; background: rgba(255,255,255,.07); border: 0; cursor: pointer; }
  .mp i { width: 24px; height: 24px; display: grid; place-items: center; color: var(--c); } .mp i svg { width: 21px; height: 21px; fill: currentColor; }
  .mp b { display: block; font-size: 14px; font-weight: 600; line-height: 1.2; } .mp span { display: block; font-size: 12.5px; color: var(--muted); line-height: 1.2; }
  .mp.hot { background: color-mix(in srgb, var(--c) 18%, transparent); }
  /* camera: groot beeld zonder vak */
  #camTile { background: none; border: 0; box-shadow: none; padding: 0; }
  #camTile .cam { min-height: 0; flex: none; height: 220px; border-radius: 22px; }
  #camTile .thumbs { display: flex; justify-content: center; gap: 7px; margin-top: 9px; }
  #camTile .thumb { width: 7px; height: 7px; flex: none; border: 0; border-radius: 50%; background: rgba(255,255,255,.28); box-shadow: none; } #camTile .thumb.on { background: #fff; }
  #camTile .thumb img, #camTile .thumb i { display: none; }
  /* thermostaat + afval */
  .mrow { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .mrow > .tile { padding: 13px 14px; border-radius: 20px; display: flex; flex-direction: column; min-width: 0; }
  .mlab { display: flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; color: var(--muted); }
  .mth { --k: #8f99ab; } .mth.hot { --k: #ff9a4d; } .mth.ok { --k: #3ddc97; }
  .mrow .mth.hot, .mrow .mth.ok { background: radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, var(--k) 12%, transparent), transparent 60%), linear-gradient(180deg, var(--tile2), var(--tile)); }
  .mrow > .tile { border-color: rgba(110,150,240,.2); box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 0 18px -10px rgba(110,150,240,.6); }
  .mtop { display: flex; align-items: flex-start; justify-content: space-between; }
  .mic { display: inline-flex; vertical-align: -3px; margin-right: 4px; } .mic:empty { display: none; } .mic .gf { width: 17px; height: 17px; overflow: visible; display: block; }
  .mic .ok { display: grid; color: var(--k); } .mic .ok svg { width: 16px; height: 16px; }
  .mbig { font-size: 38px; font-weight: 600; letter-spacing: -.03em; line-height: 1; margin-top: 2px; font-variant-numeric: tabular-nums; cursor: pointer; } .mbig small { font-size: 17px; color: var(--muted); font-weight: 500; vertical-align: top; }
  .mst { font-size: 13px; font-weight: 600; color: var(--k); margin: auto 0; padding: 10px 0; white-space: nowrap; } .mst b { color: var(--text); }
  .mth .pick { margin: 0; position: static; pointer-events: none; } .mth { cursor: pointer; }
  .mth .pb { min-width: 0; width: 36px; height: 36px; padding: 0; gap: 0; margin: -4px -6px 0 0; justify-content: center; background: none; border: 0; box-shadow: none; -webkit-tap-highlight-color: transparent; }
  .mth .pb span, .mth .pb .chev { display: none; } .mth .pb .fi { width: 24px; height: 24px; } .mth .pb:active { transform: scale(.9); }
  .mth .menu { left: 0; right: 0; bottom: calc(100% + 6px); transform: none; width: auto; box-sizing: border-box; animation: none !important; }
  .mstp { display: grid; grid-template-columns: 1fr 1fr; margin-top: 0; border-radius: 99px; overflow: hidden; background: rgba(70,105,180,.2); box-shadow: inset 0 1px 0 rgba(255,255,255,.05); }
  .mstp button { all: unset; cursor: pointer; height: 38px; display: grid; place-items: center; font-size: 22px; color: var(--text); -webkit-tap-highlight-color: transparent; }
  .mstp button + button { border-left: 1px solid rgba(140,170,240,.22); } .mstp button:active { background: rgba(255,255,255,.12); }
  .maf { position: relative; cursor: pointer; } .maf .mlab i { font-style: normal; color: var(--bc); }
  .maf .mlab i.ric { display: grid; place-items: center; width: 16px; height: 16px; } .maf .mlab i.ric .ri2 { width: 16px; height: 16px; }
  .maf .mbin { position: absolute; right: 4px; top: 22px; width: 72px; height: 72px; overflow: visible; }
  .maf b { font-size: 23px; font-weight: 600; margin-top: 6px; } .maf em { font-style: normal; font-size: 12.5px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
  .maf em.mtag { align-self: flex-start; display: flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 600; margin: 2px 0 8px; color: #ffcf7a; }
  .maf em.mtag .dot { width: 7px; height: 7px; border-radius: 50%; background: #ffcf7a; box-shadow: 0 0 6px #ffcf7a; } .maf em.mtag.d1 { color: #a9c8ff; } .maf em.mtag.d1 .dot { background: #a9c8ff; box-shadow: 0 0 6px #a9c8ff; }
  .maf.quiet .mbin { opacity: .45; width: 50px; height: 50px; top: 14px; right: 8px; } .maf.quiet b { font-size: 20px; } .maf .mq { margin-top: 2px; }
  .maf em.mchip { align-self: flex-start; margin: 8px 0 0; padding: 3px 9px; border-radius: 99px; font-size: 11.5px; font-weight: 700; color: var(--text); background: rgba(255,255,255,.08); }
  .maf span { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* bediening en agenda: titel boven de tegels */
  #bedTile, #agTile { background: none; border: 0; box-shadow: none; padding: 0; margin-top: 8px; }
  #bedTile .th, #agTile .th { margin: 0 2px 10px; } #bedTile .label, #agTile .label { font-size: 21px; font-weight: 700; letter-spacing: -.01em; text-transform: none; color: var(--text); }
  #bedTile .bsep { display: none; } #bedTile .mcvh { display: flex; margin: 22px 2px 10px; }
  .lights, .covers { grid-template-columns: 1fr 1fr; gap: 10px; }
  .lt, .cv { display: grid; grid-template-columns: 40px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 11px; align-items: center; text-align: left; padding: 12px; border-radius: 20px; background: rgba(255,255,255,.05); border: 1px solid var(--line); box-shadow: none; }
  .lt .mi2, .cv .mi2 { display: grid; grid-row: 1 / 3; width: 40px; height: 40px; border-radius: 50%; place-items: center; background: rgba(255,255,255,.09); color: #8f99ab; transition: background .3s, color .3s; }
  .mi2 svg { width: 21px; height: 21px; fill: currentColor; }
  .lt .n, .cv b { grid-column: 2; align-self: end; font-size: 14px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lt .ms, .cv span { grid-column: 2; align-self: start; display: block; font-size: 12.5px; color: var(--muted); } .cv span::first-letter { text-transform: uppercase; }
  .lt svg.bulb, .lt .s, .cv svg.shut { display: none; }
  /* uit = zelfde kaart als de thermostaat- en afvaltegel: blauwe rand en zachte gloed */
  .kr:not(.lit), .lt:not(.on), .cv:not(.on) { background: linear-gradient(180deg, var(--tile2), var(--tile)) !important; border: 1px solid rgba(110,150,240,.2) !important; box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 0 18px -10px rgba(110,150,240,.6) !important; }
  .kr:not(.lit) .ri { background: rgba(255,255,255,.07); }
  /* glazen tegels: de tint wordt sterker met de helderheid (lampen) of hoe ver dicht (rolluiken); geen gloed buiten de tegel */
  .lt, .cv { --a: 0; border: 1px solid rgba(255,255,255,.05) !important; background: linear-gradient(135deg, rgba(28,38,60,.55), rgba(20,28,46,.55)); box-shadow: inset 0 1px 0 rgba(255,255,255,.05) !important; }
  .lt .mi2, .cv .mi2 { background: rgba(255,255,255,.07); }
  .lt.on { --tc: var(--lc); --tk: color-mix(in srgb, var(--lc) 60%, #ffe9a8); } .cv.on { --tc: #3d8bff; --tk: #a6d0ff; }
  .lt.on, .cv.on { background: linear-gradient(135deg, color-mix(in srgb, var(--tc) calc(var(--a) * 100%), rgba(28,38,60,.55)), color-mix(in srgb, var(--tc) calc(var(--a) * 55%), rgba(20,28,46,.55))); border-color: color-mix(in srgb, var(--tc) calc(var(--a) * 60%), transparent) !important; }
  .lt.on .mi2, .cv.on .mi2 { background: color-mix(in srgb, var(--tc) 26%, transparent); color: var(--tk); box-shadow: none; } .lt.on .n, .cv.on b { color: var(--text); } .lt.on .ms, .cv.on span { color: var(--tk); }

  #agTile .agin { position: static; padding: 0; -webkit-mask-image: none; mask-image: none; }
  #agTile .agl { padding: 4px 16px 6px; border-radius: 20px; background: linear-gradient(180deg, var(--tile2), var(--tile)); border: 1px solid rgba(130,170,255,.12); }
}

`;

// Miele: programmafase en programma in het Nederlands
const WPHASE = { pre_wash: 'Voorwas', soak: 'Weken', main_wash: 'Wassen', rinse: 'Spoelen', rinse_hold: 'Spoelstop', spin: 'Centrifugeren', drain: 'Pompen', anti_crease: 'Kreukbescherming', drying: 'Drogen', cooling_down: 'Afkoelen', steam_smoothing: 'Stomen', hygiene: 'Hygiëne', disinfecting: 'Desinfecteren', freshen_up_and_moisten: 'Opfrissen', starch_stop: 'Stijfselstop', finished: 'Klaar', paused: 'Gepauzeerd', cancelled: 'Geannuleerd', flex_load_active: 'Bijvullen', automatic_start: 'Wacht op start', cleaning: 'Reinigen', venting: 'Luchten' };
const WPROG = { cottons: 'Katoen', cottons_eco: 'Katoen eco', cottons_hygiene: 'Katoen hygiëne', eco_40_60: 'ECO 40-60', minimum_iron: 'Strijkvrij', easy_care: 'Kreukherstellend', delicates: 'Fijne was', woollens: 'Wol', silks: 'Zijde', express_20: 'Express 20', quick_power_wash: 'QuickPowerWash', quick_intense: 'Quick intens', shirts: 'Overhemden', dark_garments: 'Donkere was', dark_jeans: 'Donkere jeans', denim: 'Jeans', sportswear: 'Sportkleding', outerwear: 'Buitenkleding', outdoor_garments: 'Outdoor', towels: 'Handdoeken', bed_linen: 'Beddengoed', table_linen: 'Tafellinnen', down_duvets: 'Dekbedden', down_filled_items: 'Dons', pillows: 'Kussens', curtains: 'Gordijnen', rinse: 'Spoelen', drain_spin: 'Pompen/centrifugeren', separate_rinse_starch: 'Spoelen/stijven', starch: 'Stijven', automatic_plus: 'Automatic plus', smartmatic: 'SmartMatic', clean_machine: 'Machine reinigen', trainers: 'Sportschoenen', trainers_refresh: 'Sportschoenen opfrissen', steam_care: 'Steam care', freshen_up: 'Opfrissen', first_wash: 'Eerste wasbeurt', powerfresh: 'PowerFresh', pre_ironing: 'Voorstrijken', proofing: 'Impregneren', stuffed_toys: 'Knuffels', game_pieces: 'Speelgoed', rinse_out_lint: 'Pluis uitspoelen', cottonrepair: 'Katoen herstel', normal: 'Normaal' };

// weer- en huisiconen voor het startscherm
const TGLOSSY = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="clG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#b9c7dd"/></linearGradient>
  <linearGradient id="clD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9d3e3"/><stop offset="1" stop-color="#7d8ba3"/></linearGradient>
  <linearGradient id="rD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fe2ff"/><stop offset="1" stop-color="#1e88e5"/></linearGradient>
  <radialGradient id="mN" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fffbe6"/><stop offset="1" stop-color="#c9c3a8"/></radialGradient>
  <linearGradient id="snF" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#bfe6ff"/></linearGradient>
  <linearGradient id="hlB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#d8eefc"/><stop offset="1" stop-color="#9fc3dc"/></linearGradient>
  <linearGradient id="wdL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9fd8ff"/><stop offset="1" stop-color="#e9f6ff"/></linearGradient>
  <linearGradient id="drB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9d9ff"/><stop offset=".5" stop-color="#4f8ff5"/><stop offset="1" stop-color="#1f56c2"/></linearGradient>
  <linearGradient id="drG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9f7de"/><stop offset=".5" stop-color="#3ddc97"/><stop offset="1" stop-color="#11975c"/></linearGradient>
  <symbol id="gDoor" viewBox="0 0 100 100">
    <ellipse cx="50" cy="95" rx="30" ry="3.5" fill="#000" opacity=".35"/>
    <rect x="18" y="8" width="46" height="82" rx="5" fill="#2b3240" stroke="#5f6d82" stroke-width="3"/>
    <path d="M22 12l30 8v74l-30-6z" fill="url(#drB)"/>
    <circle cx="45" cy="56" r="3.5" fill="#ffe38a"/>
    <path d="M27 22v20" stroke="#fff" stroke-opacity=".8" stroke-width="3" stroke-linecap="round"/>
    <path d="M62 50h28M80 40l10 10-10 10" stroke="url(#drG)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </symbol>
  <radialGradient id="buOn" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fffbe8"/><stop offset=".55" stop-color="#ffd27a"/><stop offset="1" stop-color="#e59a2a"/></radialGradient>
  <linearGradient id="bGft" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7ee8a6"/><stop offset=".55" stop-color="#1fa85a"/><stop offset="1" stop-color="#0d6b37"/></linearGradient>
  <linearGradient id="bPap" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9cc3ff"/><stop offset=".55" stop-color="#2f6fe0"/><stop offset="1" stop-color="#173f91"/></linearGradient>
  <linearGradient id="bPmd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd08a"/><stop offset=".55" stop-color="#f28a1c"/><stop offset="1" stop-color="#a5520a"/></linearGradient>
  <linearGradient id="bRst" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c3cad6"/><stop offset=".55" stop-color="#6b7587"/><stop offset="1" stop-color="#3a414d"/></linearGradient>
  <linearGradient id="slt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f5fa"/><stop offset="1" stop-color="#aab6c8"/></linearGradient>
  <linearGradient id="gls" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfe6ff"/><stop offset=".55" stop-color="#5aa2ff"/><stop offset="1" stop-color="#1f56c2"/></linearGradient>
  <linearGradient id="bulbY" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#ffc83d"/><stop offset="1" stop-color="#d9931a"/></linearGradient>
  <linearGradient id="gthT" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c9d3e3"/></linearGradient>
  <radialGradient id="gthR" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffd0a8"/><stop offset=".55" stop-color="#ff7a3c"/><stop offset="1" stop-color="#c2410c"/></radialGradient>
</defs></svg>`;

// gekleurde gloeilamp (kleur van de lamp zelf)
// rolluik in de glanzende stijl: kast, geleiders en lamellen die zakken tot de stand (0 = dicht, 100 = open)
const shutterSvg = (pos, key) => {
  const id = 'sh' + String(key).replace(/\W/g, ''), top = 26, H = 62, h = H * (1 - Math.max(0, Math.min(100, pos)) / 100);
  let sl = '';
  for (let y = top; y < top + h - 0.1; y += 6) sl += `<rect x="16" y="${y.toFixed(1)}" width="68" height="${Math.min(4.8, top + h - y).toFixed(1)}" rx="1" fill="url(#a${id})"/>`;
  return `<svg class="shut" viewBox="0 0 100 100"><defs>
    <linearGradient id="a${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6f9"/><stop offset=".55" stop-color="#c3cad6"/><stop offset="1" stop-color="#8d97a8"/></linearGradient>
    <linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfeaff"/><stop offset=".5" stop-color="#5aaef2"/><stop offset="1" stop-color="#2160b4"/></linearGradient>
    <linearGradient id="n${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d8696"/><stop offset=".6" stop-color="#4b5363"/><stop offset="1" stop-color="#2f3540"/></linearGradient>
    <linearGradient id="k${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#b9c2cf"/></linearGradient></defs>
    <ellipse cx="50" cy="95" rx="36" ry="3.5" fill="#000" opacity=".35"/>
    <rect x="16" y="${top}" width="68" height="${H}" fill="url(#g${id})"/><path d="M22 ${top + 6}v14" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>
    ${h > 1 ? `<rect x="16" y="${top}" width="68" height="${h.toFixed(1)}" fill="#6f7888"/>${sl}<rect x="15" y="${(top + h - 4).toFixed(1)}" width="70" height="5" rx="1.5" fill="#6b7586"/>` : ''}
    <rect x="11" y="${top}" width="6" height="${H + 2}" rx="2" fill="url(#n${id})"/><rect x="83" y="${top}" width="6" height="${H + 2}" rx="2" fill="url(#n${id})"/>
    <rect x="8" y="8" width="84" height="20" rx="6" fill="url(#k${id})"/><path d="M14 13h40" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".9"/></svg>`;
};

// wasmachine die draait: 0 = stil, 1 = wassen/spoelen (rustig, met water), 2 = centrifugeren (snel, zonder water)
// apparaten: trommel draait en water klotst / sproeiarm en druppels / gloeiende ruit en warmte (stijl Rounded)
const washSvg = (mode) => `<svg viewBox="0 0 100 100">${RIC.draw('washer', 'on', mode)}</svg>`;
const dishSvg = (run) => `<svg viewBox="0 0 100 100">${RIC.draw('dish', 'on', run ? 1 : 0)}</svg>`;
const microSvg = (mode, disp) => `<svg viewBox="3 6 94 88">${RIC.draw('micro', 'on', mode, disp)}</svg>`;
const ovenSvg = (mode, temp) => `<svg viewBox="0 0 100 100">${RIC.draw('ovenX', 'on', mode, temp)}</svg>`;
const DISH_PROG = { intensiv_70: 'Intensief 70°', auto_2: 'Auto 45–65°', eco_50: 'Eco 50°', quick_45: 'Snel 45°', pre_rinse: 'Voorspoelen', night_wash: 'Stil', kurz_60: 'Kort 60°', machine_care: 'Machineonderhoud' };
const OVEN_PROG = { hot_air: 'Hetelucht', top_bottom_heating: 'Boven- en onderwarmte', top_bottom_heating_eco: 'Boven/onder eco', hot_air_grilling: 'Hetelucht grill', pizza_setting: 'Pizzastand', frozen_heatup_special: 'Diepvries', intensive_heat: 'Intensieve hitte', slow_cook: 'Langzaam garen', desiccation: 'Drogen', bottom_heating: 'Onderwarmte', keep_warm: 'Warmhouden', preheat_ovenware: 'Servies voorverwarmen', pre_heating: 'Snel voorverwarmen', microwave_90_watt: 'Magnetron 90 W', microwave_180_watt: 'Magnetron 180 W', microwave_360_watt: 'Magnetron 360 W', microwave_600_watt: 'Magnetron 600 W', microwave_max: 'Magnetron max' };
// meldingen van de vaatwasser (Home Connect: off / present / confirmed)
const NI = {
  salt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 3h8l1 4H7zM7 7h10v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M10 12h.01M14 12h.01M12 15h.01"/></svg>',
  drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/></svg>',
  tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M14.5 6.5a4 4 0 0 0 5 5l-8 8a2.1 2.1 0 0 1-3-3l8-8a4 4 0 0 1-2-2z"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 4 2.5 20h19zM12 10v4M12 17h.01"/></svg>',
};
const DISH_NOTES = [
  ['program_blocked_salt_lack', 'Programma geblokkeerd', 'zout bijvullen', '#ff7262', 'warn'],
  ['salt_lack', 'Zout op', 'bijvullen', '#ff7262', 'salt'],
  ['zout_bijna_op', 'Zout bijna op', 'bijvullen', '#ffb35c', 'salt'],
  ['rinse_aid_lack', 'Glansspoelmiddel op', 'bijvullen', '#ff7262', 'drop'],
  ['glansspoelmiddel_bijna_op', 'Glansspoelmiddel bijna op', 'bijvullen', '#ffb35c', 'drop'],
  ['programma_afgebroken', 'Programma afgebroken', 'controleer de machine', '#ff7262', 'warn'],
  ['smart_filter_cleaning_reminder', 'Filter schoonmaken', 'filter uitspoelen', '#8b95a7', 'tool'],
  ['machine_care_and_filter_cleaning_reminder', 'Onderhoud en filter', 'reinigingsprogramma en filter', '#8b95a7', 'tool'],
  ['machine_care_and_low_maintenance_filter_cleaning_reminder', 'Onderhoud en filter', 'reinigingsprogramma en filter', '#8b95a7', 'tool'],
  ['machine_care_reminder', 'Machineonderhoud', 'reinigingsprogramma draaien', '#8b95a7', 'tool'],
];

// lamp in dezelfde glanzende stijl als de andere iconen: schuin verloop, witte glansstreep, schaduw eronder
const mixHex = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t).toString(16).padStart(2, '0')).join('');
const toHex = (c) => { if (c[0] === '#') return c; const [h, sat, l] = c.match(/[\d.]+/g).map(Number), S = sat / 100, L = l / 100, k = (n) => (n + h / 30) % 12, f = (n) => L - S * Math.min(L, 1 - L) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return '#' + [0, 8, 4].map((n) => Math.round(f(n) * 255).toString(16).padStart(2, '0')).join(''); };
const bulbSvg = (c) => { const col = toHex(c), id = `bu${col.slice(1)}`; return `<svg class="bulb" viewBox="0 0 100 100"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mixHex(col, '#ffffff', .7)}"/><stop offset=".55" stop-color="${col}"/><stop offset="1" stop-color="${mixHex(col, '#000000', .18)}"/></linearGradient></defs>
  <path d="M50 6a32 32 0 0 0-19.5 57.4c3.6 2.9 5.6 6.6 5.6 10.9v1.5h27.8v-1.5c0-4.3 2-8 5.6-10.9A32 32 0 0 0 50 6z" fill="url(#${id})"/><path d="M30 36a21 21 0 0 1 13-17" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="5" stroke-linecap="round"/>
  <rect x="35" y="78" width="30" height="7.5" rx="3.7" fill="url(#g-metal)"/><rect x="38" y="87.5" width="24" height="7" rx="3.5" fill="url(#g-metal)"/></svg>`; };

const WCOND = {
  'clear-night': ['Helder', 'wNight'], cloudy: ['Bewolkt', 'wCloud'], exceptional: ['Uitzonderlijk', 'wStorm'], fog: ['Mist', 'wFog'],
  hail: ['Hagel', 'wHail'], lightning: ['Onweer', 'wStorm'], 'lightning-rainy': ['Onweer en regen', 'wStorm'], partlycloudy: ['Half bewolkt', 'wPartly'],
  pouring: ['Zware regen', 'wRain'], rainy: ['Regen', 'wRain'], snowy: ['Sneeuw', 'wSnow'], 'snowy-rainy': ['Natte sneeuw', 'wSnow'],
  sunny: ['Zonnig', 'wSunny'], windy: ['Winderig', 'wCloud'], 'windy-variant': ['Winderig', 'wCloud'],
};
// thermostaatstanden: dicht icoon en eigen kleur
const PRESETS = {
  home: ['Thuis', 'house', '#7cb6ff'],
  comfort: ['Comfort', 'flame', '#ff9a4d'],
  sleep: ['Slapen', 'moon', '#8b8cff'],
  away: ['Weg', 'door', '#c3cad6'],
  holiday: ['Vakantie', 'sun', '#ffc83d'],
};

/* rustiger (telefoon): effen vlakken, geen gekleurde gloed; kleur alleen waar hij iets betekent */
const CALM = `@media (max-width: 600px) {
  .sheet, .sheet.full, .sheet.full.lamp, .sheet.full.therm, .sheet.full.therm.hot { background: #111827 !important; }
  .cvh span { color: var(--muted) !important; font-weight: 500 !important; }
  .was.xchg, .was.xchg.evon, .mstack > .was.xchg { background: #141c2b !important; border: 1px solid rgba(255,255,255,.07) !important; box-shadow: none !important; }
  .was.run, .was.oven.run, .was.done, .mstack > .was.run, .mstack > .was.done { background: #141c2b !important; border-color: rgba(255,255,255,.07) !important; box-shadow: none !important; }
  .sheet .mstack > .was.xchg.evon { background: #172030 !important; border-color: rgba(255,255,255,.06) !important; }
  .wsr { background: #172030 !important; border-color: rgba(255,255,255,.05) !important; box-shadow: none !important; } .wsr.first { border-color: rgba(255,255,255,.08) !important; }
  .wsr em { color: #cfd5e0 !important; background: rgba(255,255,255,.08) !important; } .wsr.wdone em { color: #3ddc97 !important; }
}`;
const BINS = { gft: ['binGft', '#1fa85a', 'groene bak'], pmd: ['binPmd', '#f28a1c', 'oranje bak'], papier: ['binPap', '#2f6fe0', 'blauwe bak'], rest: ['binRst', '#6b7587', 'grijze bak'] };
const DIRS = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];

// platte iconen voor de tegels op de telefoon
const MTHERM = '<svg viewBox="0 0 24 24"><path d="M12 1.8a3.6 3.6 0 0 0-3.6 3.6v8.4a5.6 5.6 0 1 0 7.2 0V5.4A3.6 3.6 0 0 0 12 1.8z"/></svg>';
const MBULB = '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-4.2 12.6c.7.5 1.2 1.3 1.2 2.2V18h6v-1.2c0-.9.5-1.7 1.2-2.2A7 7 0 0 0 12 2zM9 19.3h6v.7a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"/></svg>';
// rolluik als raampje met kozijn; het rolluik zakt ervoor (p = % open)
const mBlind = (p) => { const h = 14.5 * (1 - p / 100); return `<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="15" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="5" y="8" width="6.2" height="11" rx=".6" fill="currentColor" opacity=".35"/><rect x="12.8" y="8" width="6.2" height="11" rx=".6" fill="currentColor" opacity=".35"/><rect x="2" y="2.5" width="20" height="3.6" rx="1.2" fill="currentColor"/>${h > 0.5 ? `<rect x="3.8" y="6" width="16.4" height="${h.toFixed(1)}" fill="currentColor"/>${Array.from({ length: Math.floor(h / 2.4) }, (_, i) => `<path d="M3.8 ${(8.2 + i * 2.4).toFixed(1)}h16.4" stroke="#0005" stroke-width=".6"/>`).join('')}` : ''}</svg>`; };
// kamericonen (tabblad Kamers)
// glanzende pil-iconen: lamp aan/uit en een raam met rolluik (p = % open)
const gBulb = (on) => `<svg viewBox="0 0 100 100"><use href="#${on ? 'gBulbOn' : 'gBulbOff'}"/></svg>`;
const gBlind = (p) => RIC.svg('blind', p < 99 ? 'on' : 'off');
// standaardscènes van Hue: in het kamerpaneel alleen de eigen scènes tonen
const HUE_SCENES = ['ontspannen', 'concentreren', 'energie', 'lezen', 'helder', 'gedimd', 'nachtlampje', 'arctische dageraad', 'lentebloesem', 'savanne zonsondergang', 'tropische schemering'];
const KSTYLE = `
.kmode .tcols, .kmode .mcol, .kmode .thead .clock, .kmode .thead .hppl { display: none !important; }
#kview { display: none; } .kmode #kview { display: block; max-width: 640px; margin: 0 auto; }
.ksub { font-size: 13px; font-weight: 600; letter-spacing: .06em; color: var(--muted); text-transform: uppercase; margin: 6px 4px 2px; }
.khead { margin: 2px 4px 18px; } .khead h1 { font-weight: 600; }
#kview .kpills { display: flex; gap: 8px; overflow-x: auto; margin: 0 -12px; padding: 2px 12px 4px; scrollbar-width: none; } #kview .kpills::-webkit-scrollbar { display: none; }
#kview .mp { flex: none; display: flex; align-items: center; gap: 9px; padding: 9px 16px 9px 9px; border-radius: 99px; background: rgba(255,255,255,.07); cursor: pointer; } #kview .mp.hot { background: color-mix(in srgb, var(--c) 18%, transparent); } #kview .mp b { display: block; font-size: 14px; font-weight: 600; line-height: 1.2; } #kview .mp span { display: block; font-size: 12.5px; color: var(--muted); line-height: 1.2; }
.kfh { display: flex; align-items: baseline; justify-content: space-between; margin: 34px 4px 12px; } .kfh:first-child { margin-top: 24px; } .kfh b { font-size: 19px; font-weight: 700; letter-spacing: -.01em; } .kfh span { font-size: 12.5px; color: var(--muted); font-weight: 600; }
.krs { display: flex; flex-direction: column; gap: 8px; }
.kr { position: relative; display: flex; align-items: center; gap: 12px; height: 76px; padding: 0 15px; box-sizing: border-box; border-radius: 22px; border: 1px solid rgba(255,255,255,.06); background: linear-gradient(135deg, rgba(28,38,60,.6), rgba(20,28,46,.6)); box-shadow: inset 0 1px 0 rgba(255,255,255,.05); cursor: pointer; -webkit-tap-highlight-color: transparent; transition: transform .15s, background .3s; user-select: none; -webkit-user-select: none; }
.kr:active { transform: scale(.985); }
.kr.lit { background: linear-gradient(135deg, rgba(255,178,62,.34), rgba(255,178,62,.12)); border-color: rgba(255,190,90,.24); }
.kr .ri svg.ri2 { width: 30px; height: 30px; } .mi2 svg[viewBox="0 0 100 100"] { width: 27px; height: 27px; }
.kr .ri { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.08); color: #aeb6c4; flex: none; } .kr .ri svg { width: 24px; height: 24px; fill: currentColor; }
.kr.lit .ri { background: rgba(255,178,62,.24); color: #ffcf7a; }
.kr .mid { flex: 1; min-width: 0; } .kr .nm { font-size: 17.5px; font-weight: 700; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kr .ln { display: flex; gap: 9px; margin-top: 5px; font-size: 13px; font-weight: 600; color: var(--muted); white-space: nowrap; overflow: hidden; }
.kr .ln span { display: inline-flex; align-items: center; gap: 3px; } .kr .ln svg { width: 15px; height: 15px; fill: currentColor; flex: none; }
.kr .ln .y { color: #ffcf7a; } .kr .ln .b { color: #8fbcff; } .kr .ln .ap { color: #8fd3ff; } .kr .ln .ap svg.ri2 { width: 17px; height: 17px; }
.kr .tp { font-size: 24px; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; } .kr .tp small { font-size: 13px; color: var(--muted); font-weight: 500; vertical-align: top; }
.ksw { all: unset; flex: none; width: 51px; height: 31px; border-radius: 99px; background: rgba(120,130,150,.32); position: relative; cursor: pointer; transition: background .25s; -webkit-tap-highlight-color: transparent; }
.ksw::after { content: ''; position: absolute; top: 2px; left: 2px; width: 27px; height: 27px; border-radius: 50%; background: #fff; box-shadow: 0 3px 8px rgba(0,0,0,.25), 0 1px 1px rgba(0,0,0,.15); transition: left .25s; }
.ksw.on { background: #ffb23e; } .ksw.on::after { left: 22px; } .kpad { width: 51px; flex: none; }
/* kamerpaneel */
.pmap { touch-action: none; overscroll-behavior: contain; margin-top: 16px; border-radius: 22px; overflow: hidden; border: 1px solid rgba(255,255,255,.08); background: #101a2c; min-height: 200px; }
.pmap ha-card { border-radius: 0 !important; border: 0 !important; box-shadow: none !important; }
.pwho { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
.pc { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 18px; background: linear-gradient(135deg, rgba(28,38,60,.55), rgba(20,28,46,.55)); border: 1px solid rgba(255,255,255,.06); cursor: pointer; min-width: 0; }
.pc b { display: block; font-size: 14.5px; } .pc span { display: block; font-size: 12px; font-weight: 600; color: var(--c); } .pc em { display: block; font-style: normal; font-size: 11.5px; color: rgba(255,255,255,.55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pav { width: 38px; height: 38px; border-radius: 50%; flex: none; background: #2a3550 center / cover; border: 2.5px solid var(--c); display: grid; place-items: center; font-weight: 700; }
.pev { display: flex; gap: 12px; align-items: flex-start; padding: 8px 4px; position: relative; } .pev .pav { width: 34px; height: 34px; position: relative; z-index: 1; }
.pev:not(:last-child)::after { content: ''; position: absolute; left: 20px; top: 44px; bottom: -8px; width: 2px; background: rgba(255,255,255,.08); }
.pt { flex: 1; min-width: 0; } .pt b { font-size: 14.5px; font-weight: 600; } .pt span { display: block; font-size: 12.5px; color: rgba(255,255,255,.55); margin-top: 2px; }
.ptag { font-size: 11.5px; font-weight: 700; padding: 3px 9px; border-radius: 99px; background: color-mix(in srgb, var(--c) 18%, transparent); color: var(--c); white-space: nowrap; }
.kpre .fi { width: 24px; height: 24px; fill: currentColor; display: block; }
.kspills { display: flex; gap: 8px; overflow-x: auto; margin: 14px -16px 0; padding: 2px 16px 4px; scrollbar-width: none; } .kspills::-webkit-scrollbar { display: none; }
.kspills .mp { flex: none; display: flex; align-items: center; gap: 9px; padding: 8px 16px 8px 9px; border-radius: 99px; background: rgba(255,255,255,.07); cursor: pointer; }
.kspills .mp i.g { width: 30px; height: 30px; display: grid; place-items: center; } .kspills .mp i.g .ri2 { width: 26px; height: 26px; }
.kspills .mp b { display: block; font-size: 14px; font-weight: 600; line-height: 1.2; } .kspills .mp span { display: block; font-size: 12.5px; color: var(--muted); line-height: 1.2; white-space: nowrap; }
.kspills .mp.hot { background: rgba(255,200,61,.14); } .kspills .mp.hot span { color: #ffcf7a; }
.kspills .mp.warn { background: rgba(255,159,10,.16); } .kspills .mp.warn span { color: #ffb340; }
.kspills .mp.alarm { background: linear-gradient(135deg, rgba(255,69,58,.4), rgba(150,28,40,.4)); box-shadow: inset 0 0 0 1.5px rgba(255,90,80,.6); } .kspills .mp.alarm span { color: #ffd2cc; font-weight: 700; }
.kspills .mp.alarm i.g { animation: lkp 1.6s ease-in-out infinite; border-radius: 50%; }
.klk.koff .lk b { font-size: 15.5px; }
.wsr { display: flex; align-items: center; gap: 16px; padding: 12px 16px; border-radius: 22px; margin-top: 10px; cursor: pointer; background: linear-gradient(135deg, rgba(28,38,60,.55), rgba(20,28,46,.55)); border: 1px solid rgba(255,255,255,.05); }
.wsr svg { width: 56px; height: 56px; flex: none; overflow: visible; } .wsr b { display: block; font-size: 18px; font-weight: 700; } .wsr span { display: block; font-size: 14px; color: var(--muted); margin-top: 2px; }
.wsr em { margin-left: auto; font-style: normal; font-size: 13px; font-weight: 700; white-space: nowrap; color: color-mix(in srgb, var(--c) 70%, #fff); padding: 4px 10px; border-radius: 99px; background: color-mix(in srgb, var(--c) 22%, transparent); }
.wsr.wdone { opacity: .6; } .wsr.wdone em { color: #3ddc97; background: rgba(61,220,151,.16); }
.wsr.first { padding: 18px 16px; margin-top: 18px; border-color: color-mix(in srgb, var(--c) 50%, transparent); box-shadow: 0 10px 30px -18px var(--c); } .wsr.first svg { width: 84px; height: 84px; } .wsr.first b { font-size: 24px; }
.hico.app { background: rgba(255,255,255,.06) !important; } .hico.app svg { width: 26px !important; height: 26px !important; } .hwho.hrun { color: #8fd3ff; } .hwho.hbad { color: #ff8a80; }
.evsec .was.xchg { margin: 0; } .evsec .evoff { background: linear-gradient(135deg, rgba(28,38,60,.55), rgba(20,28,46,.55)) !important; border: 1px solid rgba(255,255,255,.05) !important; box-shadow: none !important; }
.evsec .evoff svg.xo { width: 46px; height: 72px; margin-right: 8px; } .evsec .evoff .xh b { font-size: 17px; } .evsec .evoff .xh span { font-size: 14px; margin-top: 2px; }
.evone .evseg { display: grid; grid-template-columns: 1fr 1fr 1fr; margin-top: 14px; border-radius: 99px; overflow: hidden; background: rgba(70,105,180,.2); box-shadow: inset 0 1px 0 rgba(255,255,255,.05); }
.evone .evseg button { all: unset; cursor: pointer; height: 38px; display: flex; align-items: center; justify-content: center; gap: 7px; font-size: 14.5px; font-weight: 600; color: var(--text); -webkit-tap-highlight-color: transparent; }
.evone .evseg button + button { border-left: 1px solid rgba(140,170,240,.22); } .evone .evseg button:active { background: rgba(255,255,255,.12); }
.evone .evseg button svg { width: 14px !important; height: 14px !important; padding: 0 !important; margin: 0 !important; background: none !important; border: 0 !important; box-shadow: none !important; flex: none; }
.evone .evseg button.on { background: none; } .evone .evseg button[disabled] { opacity: .4; pointer-events: none; } .evone .evseg.busy button { opacity: .6; pointer-events: none; }
.evsec .everr { margin-top: 10px; font-size: 12.5px; color: #ff8a80; }
.evsec .evh { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 8px; font-size: 13px; color: var(--muted); } .evsec .evh b { color: var(--text); font-weight: 600; }
.evsec .evh span { display: inline-flex; align-items: center; gap: 6px; } .evsec .evh i { width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 6px currentColor; }
.evb { margin-top: 20px !important; } .evb button svg { width: 72px !important; height: 72px !important; padding: 23px !important; }
.evb button.on svg { background: linear-gradient(180deg, rgba(94,225,208,.45), rgba(31,168,147,.35)) !important; border-color: rgba(94,225,208,.6) !important; }
.evb button[disabled] { opacity: .35; pointer-events: none; } .evb.busy button { opacity: .6; pointer-events: none; }
.klk { display: flex; flex-direction: column; padding: 0; border-radius: 20px; overflow: hidden; }
.klk .lk { display: flex; align-items: center; gap: 14px; padding: 11px 16px; cursor: pointer; position: relative; }
.klk .lk + .lk::before { content: ''; position: absolute; top: 0; left: 70px; right: 0; height: 1px; background: rgba(255,255,255,.07); }
.klk .lk i { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.07); flex: none; }
.klk .lk i .ri2 { width: 28px; height: 28px; }
.klk .lk { padding: 13px 16px; } .klk .lk:first-child { border-radius: 20px 20px 0 0; } .klk .lk:last-child { border-radius: 0 0 20px 20px; } .klk .lk:only-child { border-radius: 20px; }
.klk .lk.wet + .lk::before, .klk .lk + .lk.wet::before { display: none; }
.sheet .klk:has(> .lk.wet:only-child) { border-color: transparent !important; }
.klk .lk.on i { background: rgba(255,200,61,.16); } .klk .lk.k-door.on i, .klk .lk.k-window.on i { background: rgba(255,159,10,.16); }
.klk .lk b { display: block; font-size: 16px; font-weight: 600; } .klk .lk span { display: block; font-size: 13px; color: var(--muted); margin-top: 2px; }
.klk .lk.on span { color: #e8c46a; } .klk .lk.k-door.on span, .klk .lk.k-window.on span { color: #ffb340; }
.klk .lk em { margin-left: auto; font-style: normal; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; } .klk .lk small { font-size: 12.5px; font-weight: 600; color: var(--muted); display: flex; align-items: center; gap: 4px; }
.klk .lk small .ri2 { width: 20px; height: 20px; } .klk .lk small.low { color: #ffb340; }
.klk .lk.wet { background: linear-gradient(135deg, rgba(255,69,58,.30), rgba(150,28,40,.30)); box-shadow: inset 0 0 0 1.5px rgba(255,90,80,.55); }
.klk .lk.wet i { background: rgba(255,69,58,.32); animation: lkp 1.6s ease-in-out infinite; } .klk .lk.wet b { color: #ff8a80; } .klk .lk.wet span { color: #ffb0a8; }
.klk .lk.warn i { background: rgba(255,159,10,.18); } .klk .lk.warn span { color: #ffb340; }
.klk .lk.off i { background: rgba(255,255,255,.06); color: var(--muted); } .klk .lk.off b { color: var(--muted); }
@keyframes lkp { 50% { box-shadow: 0 0 0 7px rgba(255,69,58,0); } 0%, 100% { box-shadow: 0 0 0 0 rgba(255,69,58,.5); } }
.kth { margin: 24px 2px 10px; font-size: 21px; font-weight: 700; letter-spacing: -.01em; }
.sheet .mstack > .was.xchg.evon { background: radial-gradient(120% 160% at 0% 0%, rgba(94,225,208,.18), transparent 55%), linear-gradient(135deg, #10283a, #0e1a2c) !important; border: 1px solid rgba(94,225,208,.3) !important; }
.sheet .kglass, .sheet .mstack > .was { background: linear-gradient(135deg, rgba(28,38,60,.55), rgba(20,28,46,.55)) !important; border: 1px solid rgba(255,255,255,.05) !important; box-shadow: inset 0 1px 0 rgba(255,255,255,.05) !important; }
.sheet .mstack { display: flex; flex-direction: column; gap: 10px; }
.ksc { display: flex; flex-wrap: wrap; gap: 8px; } .ksc .mp { padding: 10px 16px; } .ksc .mp b { font-size: 14px; }
.ksc .kall { all: unset; cursor: pointer; padding: 10px 14px; font-size: 13.5px; font-weight: 600; color: var(--muted); }
.hwho { display: inline-flex !important; align-items: center; gap: 6px; } .hwho i { width: 16px; height: 16px; border-radius: 50%; flex: none; display: grid; place-items: center; background: rgba(255,255,255,.12); background-size: cover; background-position: center; font-style: normal; } .hwho i svg { width: 10px; height: 10px; fill: currentColor; }
.hrow .hnm { font-style: normal; font-weight: 500; color: var(--muted); }
.mp i.g { width: 30px; height: 30px; } .mp i.g svg { width: 30px; height: 30px; overflow: visible; } .mp:has(i.g) { padding-left: 9px; }
`;

class ThuisCard extends HTMLElement {
  setConfig(config) {
    this._config = { ...TDEFAULTS, ...config }; applyTheme(this, config);
    this._build();
    if (this._hass) this._update();
  }
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this._update();
    if (first) { this._subForecast(); this._fetchAgenda(); }
    if (this._camEl) this._camEl.hass = hass;
    // camerascherm: alleen bijwerken als de camera zelf verandert (elke update laat beeld en geluid haperen)
    if (this._cfEl) { const so = hass.states[this._cfEl._entity]; if (so && so !== this._cfEl.stateObj) { this._cfEl.stateObj = so; this._cfEl.hass = hass; } }
  }
  getCardSize() { return 12; }
  getGridOptions() { return { columns: 'full' }; }
  static getStubConfig() { return {}; }
  connectedCallback() {
    this._tick = setInterval(() => { this._clock(); this._thumbs(); this._updAppliances(); this._updPicnic(); this._carRefresh(); }, 10000);
    if (!this._carVis) { this._carVis = () => { if (document.visibilityState === 'visible') setTimeout(() => this._carRefresh(true), 800); }; document.addEventListener('visibilitychange', this._carVis); }
    setTimeout(() => this._carRefresh(true), 1500);
    this._htimer = setInterval(() => this._fetchAgenda(), 5 * 60000);
    if (this._hass && !this._unsubs) this._subForecast();
  }
  disconnectedCallback() {
    clearInterval(this._tick); clearInterval(this._htimer); if (this._carVis) { document.removeEventListener('visibilitychange', this._carVis); this._carVis = null; }
    (this._unsubs || []).forEach((p) => p.then((u) => u && u()).catch(() => {}));
    this._unsubs = null;
  }

  $(id) { return this.shadowRoot.getElementById(id); }
  _state(id) { return this._hass?.states[id]; }
  // naam van een entiteit (state of id): eerst zoals HA hem uit het register samenstelt (formatEntityName, HA 2025.10+),
  // dan friendly_name, dan zelf uit het register (entiteit + apparaat); '' als er niets is
  _nm(x) {
    const h = this._hass, s = typeof x === 'string' ? h?.states[x] : x, id = typeof x === 'string' ? x : x?.entity_id;
    if (!s && !id) return '';
    if (s && h?.states[id] === s && typeof h.formatEntityName === 'function') { try { const n = h.formatEntityName(s); if (n) return n; } catch (e) { /* oudere HA */ } }
    const fn = s?.attributes?.friendly_name; if (fn) return fn;
    const e = h?.entities?.[id]; if (!e) return '';
    const d = h.devices?.[e.device_id], dn = d ? (d.name_by_user || d.name || '') : '';
    return (e.has_entity_name || !e.name ? [dn, e.name] : [e.name]).filter(Boolean).join(' ');
  }
  _moreInfo(entityId) { if (entityId) this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true })); }
  _climateId() { return this._config.climate || Object.keys(this._hass?.states || {}).find((k) => k.startsWith('climate.')); }
  _lightIds() {
    const all0 = Object.values(this._hass?.states || {}).filter((s) => s.entity_id.startsWith('light.'));
    if (this._config.lights.length) {
      // naam → entiteit: eerst exact (zonder "Hue "), dan begint-met, dan bevat;
      // kleine schrijfverschillen (eetafel/eettafel) negeren door dubbele letters samen te voegen
      const norm = (x) => String(x || '').toLowerCase().replace(/^hue\s+/, '').replace(/[^a-z0-9]+/g, ' ').replace(/([a-z])\1+/g, '$1').trim();
      return this._config.lights.map((want) => {
        if (String(want).startsWith('light.')) return want;
        const w = norm(want), named = all0.map((s) => [s, norm(this._nm(s))]);
        const hit = named.find(([, n]) => n === w) || named.find(([, n]) => n.startsWith(w)) || named.find(([, n]) => n.includes(w));
        return hit ? hit[0].entity_id : `missing:${want}`;
      });
    }
    const all = Object.values(this._hass?.states || {}).filter((s) => s.entity_id.startsWith('light.') && s.state !== 'unavailable');
    const groups = all.filter((s) => s.attributes.is_hue_group);
    return (groups.length ? groups : all).sort((a, b) => this._nm(a).localeCompare(this._nm(b))).slice(0, 8).map((s) => s.entity_id);
  }
  _cameraIds() {
    if (this._config.cameras.length) return this._config.cameras;
    // volgorde: oprit, deurbel, tuin, dan de rest (op naam of entiteit)
    const rank = (k) => { const n = `${k} ${this._nm(k)}`.toLowerCase(); return /oprit/.test(n) ? 0 : /deurbel|doorbell|voordeur/.test(n) ? 1 : /tuin|garden|achter/.test(n) ? 2 : 3; };
    return Object.keys(this._hass?.states || {}).filter((k) => k.startsWith('camera.') && !k.startsWith('camera.buienradar')).sort((x, y) => rank(x) - rank(y) || x.localeCompare(y)).slice(0, 4);
  }

  _build() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const c = this._config;
    this.shadowRoot.innerHTML = `
      <style>${STYLE}${TSTYLE}${KSTYLE}${CALM}${LIGHT}</style>
      ${GLOSSY}${TGLOSSY}${GCAR}
      <div class="wrap twrap${this._kmode ? ' kmode' : ''}"><div class="inner">
        <div class="thead">
          <div class="clock"><b id="time">—</b><div><span id="greet"></span><span id="tdate" style="font-size:14px;color:var(--muted);font-weight:400"></span></div></div>
          ${tabsHtml(this._kmode ? 'kamers' : 'thuis')}
          <div class="hppl" id="ppl"></div>
        </div>
        <div class="tcols">
          <div class="tcol">
            <div class="tile heat" id="tTile">
              <div class="th"><span class="label">Thermostaat</span><span class="aside" id="tNote"></span></div>
              <div class="tdial" id="tWrap"><svg id="tDial" viewBox="0 0 320 300"></svg>
                <div class="tdc"><div class="t" id="tT">—</div><div class="s" id="tS"></div><div class="tsteps"><div id="tMin">−</div><div id="tPlus">+</div></div></div>
              </div>
              <div class="pick" id="tPre"></div>
            </div>
            <div class="tile grow" id="bedTile">
              <div class="th"><span class="label">Bediening</span></div>
              <div class="lights" id="lights"></div>
              <div class="bsep"></div>
              <div class="th mcvh"><span class="label">Rolluiken</span></div>
              <div class="covers" id="covers"></div>
            </div>
          </div>

          <div class="tcol">
            <div class="tile">
              <div class="th"><span class="label">Weer</span><span class="wseg" id="wSeg"><button data-v="w" class="on">Weer</button><button data-v="r">Radar</button></span></div>
              <div class="wview" id="wView"><div class="sky" id="wNow">
                <svg class="skyic" viewBox="0 0 100 100"><use id="wIc" href="#wPartly"/></svg>
                <div class="skyt" id="wT">—</div><div class="skyc" id="wD"></div>
                <div class="skyn"><div id="wHint"></div><span class="mm"><i>↓</i><b class="lo" id="wLo">—</b><i>↑</i><b class="hi" id="wHi">—</b></span></div>
                <div class="skyd" id="wDays"></div></div></div>
              <div class="radar" id="radar"><iframe id="rFrame" title="Buienradar"></iframe><i class="home"></i>
              </div>
            </div>
            <div class="tile grow" id="camTile" style="display:flex;flex-direction:column">
              <div class="cam" id="cam"><div class="live" id="camLive"></div><div class="hit" id="camHit"></div><div class="tag" id="camTag"><i class="dotl"></i></div></div>
              <div class="thumbs" id="thumbs"></div>
              <div class="cfull" id="cFull" hidden><div class="cft"><b id="cfName"></b><span class="cfl"><i></i>live</span><button class="cfs" id="cfS" aria-label="Geluid"></button><button id="cfX" aria-label="Sluiten">✕</button></div>
                <div class="cfbig" id="cfLive"></div><div class="cfrow" id="cfRow"></div></div>
            </div>
          </div>

          <div class="tcol">
            <div class="alrt" id="alrt" hidden></div>
            <div class="was pic" id="pic" hidden></div>
            <div class="was xchg" id="evc" hidden></div>
            <div class="was" id="was" hidden></div>
            <div class="was" id="dish" hidden></div>
            <div class="was" id="oven" hidden></div>
            <div class="tile" id="notTile" hidden><div class="th"><span class="label">Meldingen</span><span class="aside" id="notN"></span></div><div id="notList"></div></div>
            <div class="tile entile" id="enTile" data-nav="${NAV.nu}">
              <div class="th"><span class="label">Energie nu</span></div>
              <div class="en">
                <div class="n" style="--k:var(--sun)"><div class="c"><svg viewBox="0 0 100 100"><use href="#gSun"/></svg></div><b id="enSun">—</b><span class="l">Zon</span></div>
                <div class="ln" id="enL1" style="--k:var(--sun)"></div>
                <div class="n" style="--k:var(--home)"><div class="c"><svg viewBox="0 0 100 100"><use href="#gHouse"/></svg></div><b id="enHome">—</b><span class="l">Huis</span></div>
                <div class="ln" id="enL2"></div>
                <div class="n" id="enGridN"><div class="c"><svg viewBox="0 0 100 100"><use id="enGridIc" href="#gPylon"/></svg></div><b id="enGrid">—</b><span class="l" id="enGridL">Net</span></div>
              </div>
            </div>
            <div class="tile agt" id="agTile" hidden><div class="agin" id="agenda"></div></div>
            <div class="tile" id="afTile">
              <div class="wsub"><span>Afval</span></div>
              <div id="bins"></div>
            </div>
          </div>
        </div>
        <div class="mcol" id="mcol">
          <div class="mhead"><div><div class="mdate"><svg viewBox="0 0 100 100"><use id="mWIc" href="#wPartly"/></svg><b id="mWT"></b><span id="mDt"></span></div><h1 id="mGreet"></h1></div><div id="mPpl"></div></div>
          <div class="mpills" id="mPills"></div>
          <div class="mstack" id="mA"></div>
          <div class="mrow">
            <div class="tile mth" id="mTh"><div class="mtop"><div class="mbig" id="mCur">—</div><div id="mPre"></div></div>
              <div class="mst"><span class="mic" id="mIc"></span><span id="mSt"></span></div>
              <div class="mstp"><button id="mMin" aria-label="Lager">−</button><button id="mPlus" aria-label="Hoger">+</button></div></div>
            <div class="tile maf" id="mAf"></div>
          </div>
          <div class="mstack" id="mB"></div>
        </div>
        <div id="kview"><div class="khead"><h1><svg class="hi" viewBox="0 0 100 100"><use href="#gRooms"/></svg>Kamers</h1><div class="sub" id="kDate"></div></div><div class="kpills" id="kPills"></div><div id="kList"></div></div>
        <div class="shv" id="shV" hidden></div>
        <div class="sheet" id="sheet" hidden><div class="grab"></div><div id="shBody"></div></div>
      </div></div>`;
    bindNav(this.shadowRoot);
    // telefoon: eigen indeling (kop, statuspillen, camera, apparaten, thermostaat + afval, bediening, agenda);
    // de bestaande vakken worden verplaatst en op de computer weer teruggezet
    this._mq = this._mq || window.matchMedia('(max-width: 600px)');
    const MOVE = [['camTile', 'mA'], ['alrt', 'mA'], ['pic', 'mA'], ['evc', 'mA'], ['was', 'mA'], ['dish', 'mA'], ['oven', 'mA'], ['notTile', 'mA'], ['bedTile', 'mB'], ['agTile', 'mB'], ['ppl', 'mPpl'], ['tPre', 'mPre']];
    const marks = MOVE.map(([id]) => { const el = this.$(id), m = document.createComment(id); el.before(m); return m; });
    const placeBins = () => {
      const m = this._mq.matches;
      MOVE.forEach(([id, to], i) => { const el = this.$(id); if (m) this.$(to).append(el); else marks[i].after(el); });
      if (this._events) { this._agKey = null; this._drawAgenda(); }
    };
    this._mq.onchange = placeBins;
    placeBins();
    this.$('tMin').addEventListener('click', () => this._tStep(-1));
    // telefoon: meldingen en apparaten naar links wegvegen (zoals Apple Mail)
    ['pic', 'evc', 'was', 'dish', 'oven'].forEach((id) => this._swipe(this.$(id), () => this._hide(id)));
    this.$('evc').addEventListener('click', () => {
      // naar het paneel van de kamer met de laadpaal (bediening); anders het tabblad Auto
      const ri = this._rooms().findIndex((r) => (r.r.apps || []).includes('evc'));
      if (ri >= 0) { this._openSheet('room', ri); setTimeout(() => this.$('rmB')?.querySelector('.evsec')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350); } else go({ dataset: { nav: NAV.auto } });
    });
    this.$('mMin').addEventListener('click', (e) => { e.stopPropagation(); this._tStep(-1); });
    this.$('mPlus').addEventListener('click', (e) => { e.stopPropagation(); this._tStep(1); });
    // telefoon: tik = eigen paneel (thermostaat of weer), lang drukken op de temperatuur = venster van Home Assistant
    let lp = null;
    this.$('mCur').addEventListener('pointerdown', () => { lp = setTimeout(() => { lp = 'x'; this._moreInfo(this._climateId()); }, 550); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => this.$('mCur').addEventListener(t, () => { if (lp !== 'x') clearTimeout(lp); }));
    this.$('mCur').addEventListener('click', (e) => { e.stopPropagation(); if (lp === 'x') { lp = null; return; } this._openSheet('th'); });
    this.shadowRoot.querySelector('.mdate').addEventListener('click', () => this._openSheet('wx'));
    // telefoon: tik ergens op de thermostaattegel = thermostaatscherm (behalve de − en + knoppen)
    this.$('mTh').addEventListener('click', (e) => { if (!e.target.closest('.mstp')) this._openSheet('th'); });
    this.$('shV').addEventListener('click', () => this._closeSheet());
    // omlaag vegen vanaf de bovenkant sluit het paneel
    let sy = null;
    // niet bij de schuifregelaar: daar is vegen voor de stand, niet om het paneel te sluiten
    this.$('sheet').addEventListener('touchstart', (e) => { sy = this.$('sheet').scrollTop <= 0 && !e.target.closest?.('.cvsl, #thArc, .tqch, .pmap') ? e.touches[0].clientY : null; }, { passive: true });
    this.$('sheet').addEventListener('touchmove', (e) => { if (sy == null) return; const d = e.touches[0].clientY - sy; this.$('sheet').style.transform = d > 0 ? `translateY(${d}px)` : ''; }, { passive: true });
    this.$('sheet').addEventListener('touchend', (e) => { if (sy == null) return; const d = e.changedTouches[0].clientY - sy; sy = null; if (d > 90) this._closeSheet(); else this.$('sheet').style.transform = ''; });
    this.$('tPlus').addEventListener('click', () => this._tStep(1));
    this.$('tT').addEventListener('click', () => this._moreInfo(this._climateId()));
    const dial = this.$('tDial');
    dial.addEventListener('pointerdown', (ev) => this._tDrag(ev, 'start'));
    dial.addEventListener('pointermove', (ev) => this._tDrag(ev, 'move'));
    dial.addEventListener('pointerup', (ev) => this._tDrag(ev, 'end'));
    dial.addEventListener('pointercancel', (ev) => this._tDrag(ev, 'end'));
    this.$('wNow').addEventListener('click', () => this._moreInfo(this._wxId()));
    this.shadowRoot.querySelectorAll('#wSeg button').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation(); const r = b.dataset.v === 'r';
      if (r) this.$('radar').style.height = this.$('wView').offsetHeight + 'px';
      this.$('wSeg').closest('.tile').classList.toggle('rmode', r);
      if (r) this._radar();
      this.$('wSeg').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    }));
    this.$('camHit').addEventListener('click', (e) => { e.stopPropagation(); if (this._swiped) { this._swiped = false; return; } this._openCam(this._camId); });
    // vegen over het camerabeeld = volgende of vorige camera
    let sx = null;
    this.$('camHit').addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    this.$('camHit').addEventListener('touchend', (e) => {
      const dx = sx == null ? 0 : e.changedTouches[0].clientX - sx; sx = null;
      const ids = this._cameraIds(), i = ids.indexOf(this._camId);
      if (Math.abs(dx) < 40 || ids.length < 2) return;
      this._swiped = true; setTimeout(() => { this._swiped = false; }, 400);
      this._camId = ids[(i + (dx < 0 ? 1 : -1) + ids.length) % ids.length]; this._updCams();
    });
    this.$('cfX').addEventListener('click', () => this._closeCam());
    // geluid aan/uit: de speler opnieuw starten met de nieuwe stand (net als bij wisselen van camera);
    // het geluid van een lopende speler omzetten laat het op de iPhone haperen
    this.$('cfS').addEventListener('click', (e) => {
      e.stopPropagation(); this._cfSound = !this._cfSound; this._applySound();
      const id = this._cfEl?._entity; if (id && customElements.get('ha-camera-stream')) { this._cfEl = null; this._openCam(id, true); }
    });
    this.$('was').addEventListener('click', () => this._appOpen('was'));
    this.$('dish').addEventListener('click', () => this._appOpen('dish'));
    this.$('oven').addEventListener('click', () => this._appOpen('oven'));
    this.$('cFull').addEventListener('click', (e) => { if (e.target === this.$('cFull')) this._closeCam(); });
    this.shadowRoot.addEventListener('click', () => this.$('tPre')?.classList.remove('open'));
    this._camEl = null; this._camId = null; this._lightKey = null; this._pplKey = null; this._binKey = null; this._thumbKey = null;
    this._clock();
  }

  _clock() {
    if (!this.shadowRoot) return;
    const d = new Date(), h = d.getHours();
    this.$('time').textContent = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    this.$('greet').textContent = h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
    this.$('tdate').textContent = d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
    this.$('mGreet').textContent = this.$('greet').textContent;
    this.$('mDt').textContent = d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
    const kd = d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); this.$('kDate').textContent = kd.charAt(0).toUpperCase() + kd.slice(1);
  }

  _update() {
    if (!this._hass || !this.shadowRoot) return;
    this._updPeople();
    this._updThermo();
    this._updWeather();
    if (!this._kmode) this._updCams();
    this._updLights();
    this._updEnergy();
    this._updCovers();
    this._updWasher();
    this._updAppliances();
    this._updWaste();
    this._updPills();
    this._updPicnic();
    if (this._kmode) this._updRooms();
    this._updSheet();
  }

  /* ---------- aanwezig ---------- */
  _updPeople() {
    const ps = this._config.persons.map((p) => {
      const st = p.entity ? this._state(p.entity) : null;
      const state = st ? st.state : p.placeholder ? 'home' : 'unknown';
      const pic = p.picture || st?.attributes.entity_picture || '';
      const zone = state === 'home' ? 'Thuis' : state === 'not_home' ? 'Weg' : state === 'unknown' ? '?' : (this._nm(`zone.${state}`) || state);
      const pc = state === 'home' ? 'var(--exp)' : state === 'not_home' || state === 'unknown' ? '#6b7385' : '#4f73f0';
      return { ...p, state, pic, zone, pc };
    });
    const key = JSON.stringify(ps.map((p) => [p.state, p.pic]));
    if (key === this._pplKey) return;
    this._pplKey = key;
    this.$('ppl').innerHTML = ps.map((p, i) => `<div class="av${p.state === 'home' ? '' : ' away'}" data-i="${i}" style="--pc:${p.pc}">
      <div class="ring"><div class="face" style="${p.pic ? `background-image:url('${p.pic}')` : ''}">${p.pic ? '' : (p.name || '?')[0]}</div></div>
      <span class="badge">${p.zone}</span><div class="nm">${p.name}</div></div>`).join('');
    // telefoon: tik = paneel Aanwezigheid (kaart en tijdlijn); computer: venster van Home Assistant
    this.$('ppl').querySelectorAll('.av').forEach((el) => el.addEventListener('click', () => { if (this._mq?.matches) this._openSheet('ppl'); else this._moreInfo(this._config.persons[+el.dataset.i].entity); }));
  }

  /* ---------- thermostaat ---------- */
  _tGeo() {
    const cl = this._state(this._climateId()), a = cl?.attributes || {};
    return { cl, a, min: a.min_temp ?? 6, max: a.max_temp ?? 30, step: a.target_temp_step || 0.5 };
  }
  _tStep(dir) {
    const { cl, a, min, max, step } = this._tGeo();
    if (!cl) return;
    this._tTarget = clamp(Math.round(((this._tTarget ?? a.temperature ?? 20) + dir * step) / step) * step, min, max);
    clearTimeout(this._tTimer);
    this._tTimer = setTimeout(() => { this._tTimer = null; this._tSend(); }, 1200);
    this._updThermo();
  }
  _tSend() {
    const id = this._climateId(), t = this._tTarget;
    if (t == null || !id) return;
    this._tBusy = { t: Date.now(), v: t };
    this._hass.callService('climate', 'set_temperature', { entity_id: id, temperature: t });
    this._updThermo();
  }
  _tDrag(ev, phase) {
    const { cl, min, max, step } = this._tGeo();
    if (!cl) return;
    const r = this.$('tDial').getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width * 320 - KD.cx, y = (ev.clientY - r.top) / r.height * 300 - KD.cy;
    let deg = Math.atan2(y, x) * 180 / Math.PI;
    if (deg < 90) deg += 360;
    const v = deg < KD.a0 || deg > KD.a1 ? null : clamp(Math.round((min + (deg - KD.a0) / (KD.a1 - KD.a0) * (max - min)) / step) * step, min, max);
    if (phase === 'start') {
      const dist = Math.hypot(x, y);
      if (v == null || dist < KD.r - 34 || dist > KD.r + 34) return;
      ev.preventDefault();
      this.$('tDial').setPointerCapture(ev.pointerId);
      clearTimeout(this._tTimer); this._tTimer = null;
      this._tDragging = true; this._tTarget = v; this._updThermo();
    } else if (phase === 'move' && this._tDragging) {
      if (v != null && v !== this._tTarget) { this._tTarget = v; this._updThermo(); }
    } else if (phase === 'end' && this._tDragging) {
      this._tDragging = false; this._tSend();
    }
  }
  _updThermo() {
    const { cl, a, min, max } = this._tGeo();
    const set = (id, html) => { const el = this.$(id); if (el.innerHTML !== html) el.innerHTML = html; };
    if (!cl) { set('tT', '—'); set('tS', 'geen thermostaat gevonden'); return; }
    if (this._tBusy && (a.temperature === this._tBusy.v || Date.now() - this._tBusy.t > 60000)) this._tBusy = null;
    if (!this._tDragging && !this._tBusy && !this._tTimer) this._tTarget = null;
    const target = this._tTarget ?? a.temperature ?? 20, cur = a.current_temperature;
    const heating = isHeating(a) || (a.hvac_action == null && a.burner_info == null && cur != null && target > cur + 0.2 && cl.state !== 'off');
    const col = heating ? 'var(--heat)' : cl.state === 'off' ? 'var(--muted)' : 'var(--home)';
    const tile = this.$('tTile');
    tile.style.setProperty('--c', col);
    tile.classList.toggle('heat', heating);
    this.$('tWrap').classList.toggle('drag', !!this._tDragging);
    set('tNote', heating ? `${gl('gFlame', 'xs')}<b>verwarmt</b>` : cl.state === 'off' ? 'uit' : '<i class="cd" style="--c:var(--home)"></i>op temperatuur');
    set('tT', `${fmt(target, target % 1 ? 1 : 0)}<small>°C</small>`);
    set('tS', this._tDragging ? 'loslaten om in te stellen' : this._tBusy ? 'naar de thermostaat…' : cur != null ? `nu <b>${fmt(cur, 1)}°</b>` : '');
    set('mCur', cur != null ? `${fmt(cur, 1)}<small>°</small>` : '—');
    const tt = `${fmt(target, target % 1 ? 1 : 0)}°`;
    set('mSt', cl.state === 'off' ? 'Thermostaat uit' : heating ? `Verwarmt tot <b>${tt}</b>` : `Op temperatuur · <b>${tt}</b>`);
    set('mIc', heating ? '<svg class="gf" viewBox="0 0 100 100"><use href="#gFlame"/></svg>' : cl.state === 'off' ? '' : '<i class="ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg></i>');
    this.$('mTh').classList.toggle('hot', heating);
    this.$('mTh').classList.toggle('ok', !heating && cl.state !== 'off');
    // ring
    const { cx, cy, r, a0, a1 } = KD;
    const ang = (v) => a0 + (clamp(v, min, max) - min) / (max - min || 1) * (a1 - a0);
    const pt = (deg, rr = r) => [cx + rr * Math.cos(deg * Math.PI / 180), cy + rr * Math.sin(deg * Math.PI / 180)];
    const arc = (f, t) => { if (t < f) [f, t] = [t, f]; const [x0, y0] = pt(f), [x1, y1] = pt(t); return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${t - f > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
    const kc = heating ? '#ff9a4d' : '#7aa7ff';
    let s = `<defs><linearGradient id="thg" x1="0" x2="1"><stop offset="0" stop-color="${heating ? '#ffc56b' : '#b5ccff'}"/><stop offset="1" stop-color="${kc}"/></linearGradient></defs>`;
    s += `<path d="${arc(a0, a1)}" stroke="rgba(255,255,255,.07)" stroke-width="18" fill="none" stroke-linecap="round"/>`;
    if (cur != null) {
      s += `<path d="${arc(a0, ang(Math.min(cur, target)))}" stroke="url(#thg)" stroke-width="18" fill="none" stroke-linecap="round" style="filter:drop-shadow(0 0 8px ${kc})"/>`;
      if (Math.abs(ang(target) - ang(cur)) > 2) s += `<path d="${arc(ang(cur), ang(target))}" stroke="${kc}" stroke-opacity=".28" stroke-width="18" fill="none" stroke-linecap="round"/>`;
      const [ix, iy] = pt(ang(cur)); s += `<circle cx="${ix.toFixed(1)}" cy="${iy.toFixed(1)}" r="4" fill="#fff"/>`;
    }
    const [tx, ty] = pt(ang(target)), kr = this._tDragging ? 17 : 13;
    if (this._tDragging) s += `<circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="30" fill="${kc}" opacity=".16"/>`;
    s += `<g class="knob"><circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="${kr + 12}" fill="transparent"/><circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="${kr}" fill="#12161d" stroke="${kc}" stroke-width="4"/><circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="${kr - 7}" fill="${kc}"/></g>`;
    if (this._tDialHtml !== s) { this.$('tDial').innerHTML = s; this._tDialHtml = s; }
    // standen
    const modes = Object.keys(PRESETS).filter((m) => (a.preset_modes || []).includes(m));
    const pk = JSON.stringify([modes, a.preset_mode, this._preWait]);
    if (pk !== this._preKey) {
      this._preKey = pk;
      const pre = this.$('tPre');
      const cur = PRESETS[this._preWait || a.preset_mode] || ['—', 'house', '#aeb6c4'];
      this.$('mTh').style.setProperty('--pc', cur[2]);
      const ic = (k, c) => `<svg class="fi" viewBox="0 0 24 24" style="color:${c}">${FI[k]}</svg>`;
      pre.innerHTML = `<button class="pb${this._preWait ? ' wait' : ''}">${ic(cur[1], cur[2])}<span>${cur[0]}</span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9.5 12 5.5l4 4M8 14.5l4 4 4-4"/></svg></button>
        <div class="menu">${modes.map((m) => `<div class="mi${m === a.preset_mode ? ' on' : ''}" data-m="${m}"><i>${m === a.preset_mode ? '<svg class="ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg>' : ''}</i>${ic(PRESETS[m][1], PRESETS[m][2])}<span>${PRESETS[m][0]}</span></div>`).join('')}</div>`;
      pre.querySelector('.pb').addEventListener('click', (e) => { e.stopPropagation(); pre.classList.toggle('open'); });
      pre.querySelectorAll('[data-m]').forEach((el) => el.addEventListener('click', (e) => {
        e.stopPropagation(); pre.classList.remove('open');
        this._preWait = el.dataset.m;
        this._hass.callService('climate', 'set_preset_mode', { entity_id: this._climateId(), preset_mode: el.dataset.m });
        setTimeout(() => { this._preWait = null; this._updThermo(); }, 8000);
        this._updThermo();
      }));
    }
    if (this._preWait && a.preset_mode === this._preWait) this._preWait = null;
    if (this._sheet === 'th') this._updSheet();
  }

  /* ---------- weer ---------- */
  _subForecast() {
    const conn = this._hass?.connection, id = this._wxId();
    if (!conn?.subscribeMessage || !this._state(id) || this._unsubs) return;
    // Buienradar heeft soms geen verwachting per uur: dan die van een andere weer-entiteit gebruiken
    const other = Object.keys(this._hass.states).find((k) => k.startsWith('weather.') && k !== id);
    this._fcSrc = {};
    const sub = (ent, type) => conn.subscribeMessage((msg) => {
      (this._fcSrc[type] ||= {})[ent] = msg.forecast || [];
      const own = this._fcSrc[type][id] || [], alt = other ? this._fcSrc[type][other] || [] : [];
      const useOwn = (this._fcSrc.daily?.[id] || []).length || (this._fcSrc.hourly?.[id] || []).length;
      ['hourly', 'daily'].forEach((t) => { this['_fc_' + t] = (useOwn ? this._fcSrc[t]?.[id] : this._fcSrc[t]?.[other]) || []; (this._fcFrom ||= {})[t] = useOwn ? id : other; });
      this._updWeather(true);
    }, { type: 'weather/subscribe_forecast', forecast_type: type, entity_id: ent }).catch(() => null);
    this._unsubs = ['hourly', 'daily'].flatMap((type) => [sub(id, type), ...(other ? [sub(other, type)] : [])]);
  }

  // Buienradar per 5 minuten: "HH:MM;v,v,v,..." met v = 0..255; mm/u = 10^((v-109)/32)
  _rainSoon() {
    const st = this._state(this._config.rain_now)?.state || '', m = st.match(/^(\d{1,2}):(\d{2});([\d,]+)$/);
    if (!m) return null;
    const mm = m[3].split(',').map((v) => (+v ? 10 ** ((+v - 109) / 32) : 0));
    let t0 = new Date().setHours(+m[1], +m[2], 0, 0);
    if (t0 - Date.now() > 12 * HOUR) t0 -= 24 * HOUR; else if (Date.now() - t0 > 12 * HOUR) t0 += 24 * HOUR;
    const at = (i) => t0 + i * 300000, now = Date.now();
    const list = mm.map((v, i) => ({ v, t: at(i) })).filter((x) => x.t + 300000 > now);
    if (!list.length) return null;
    const drop = '<svg viewBox="0 0 24 28" style="display:inline;width:10px;height:12px;vertical-align:-1px;margin-right:5px"><path d="M12 1C12 1 2 13 2 19a10 10 0 0 0 20 0C22 13 12 1 12 1z" fill="#38bdf8"/></svg>';
    const kind = (v) => (v < 1 ? 'licht' : v < 4 ? 'matig' : 'zwaar');
    const wetI = list.findIndex((x) => x.v >= 0.1);
    if (wetI < 0) return 'Droog de komende 2 uur';
    const dryI = list.findIndex((x, i) => i > wetI && x.v < 0.1), shower = list.slice(wetI, dryI < 0 ? undefined : dryI);
    const peak = kind(Math.max(...shower.map((x) => x.v)));
    if (wetI === 0) {
      const left = dryI < 0 ? null : Math.round((list[dryI].t - now) / 60000 / 5) * 5;
      return `${drop}<b style="color:#38bdf8;font-weight:600">Het regent nu</b> · ${left == null ? 'nog zeker 2 uur' : `nog ±${Math.max(5, left)} min`}`;
    }
    return `${drop}<b style="color:#38bdf8;font-weight:600">Regen over ${Math.max(5, Math.round((list[wetI].t - now) / 60000 / 5) * 5)} min</b> · ${peak}`;
  }
  _updWeather(force) {
    const w = this._wxState();
    if (!w) return;
    const a = w.attributes, set = (id, html) => { const el = this.$(id); if (el.innerHTML !== html) el.innerHTML = html; };
    let [label, ic] = WCOND[w.state] || [/^(unavailable|unknown)$/.test(w.state) ? 'Geen actueel weer' : w.state, 'wCloud'];
    // wind: harde wind vanaf 6 Bft (39 km/u), storm vanaf 8 Bft (62 km/u) of windstoten vanaf 75 km/u
    const ws = +a.wind_speed || 0, gust = +a.wind_gust_speed || 0;
    const storm = ws >= 62 || gust >= 75, hard = !storm && (ws >= 39 || w.state.startsWith('windy'));
    if (storm) [label, ic] = ['Storm', 'wStormW']; else if (hard && !/rain|pour|snow|hail|lightning/.test(w.state)) [label, ic] = ['Harde wind', 'wWind'];
    this.$('wIc').setAttribute('href', '#' + ic);
    set('wT', `${fmt(a.temperature)}°`);
    set('wD', label);
    this.$('mWIc').setAttribute('href', '#' + ic);
    set('mWT', `${fmt(a.temperature)}°`);
    const dir = a.wind_bearing != null ? DIRS[Math.round(a.wind_bearing / 45) % 8] : '';
    const hrs = (this._fc_hourly || []).filter((f) => Date.parse(f.datetime) >= Date.now() - 3600000).slice(0, 12);
    const key = JSON.stringify([hrs.map((h) => [h.temperature, h.precipitation]), (this._fc_daily || []).length, a.temperature, this._state(this._config.rain_now)?.state, w.state, ws, gust]);
    if (!force && key === this._wKey) return;
    this._wKey = key;
    // tekst: wanneer regen
    const wet = hrs.find((h) => (h.precipitation || 0) >= 0.1);
    let hint = this._rainSoon() ?? (!hrs.length ? '' : wet ? (Date.parse(wet.datetime) <= Date.now() ? 'Het regent nu' : `Regen vanaf ${fmtTime(Date.parse(wet.datetime))}`) : 'Droog de komende 12 uur');
    // bij storm een waarschuwing, bij harde wind (als het droog blijft) de windsnelheid
    if (storm) hint = `⚠ ${gust ? `windstoten tot ${fmt(gust)}` : `wind ${fmt(ws)}`} km/u`;
    else if (hard && /^Droog/.test(hint)) hint = `Wind ${fmt(ws)} km/u ${dir}${gust ? ` · windstoten ${fmt(gust)}` : ''}`;
    set('wHint', hint);
    this.$('wHint').classList.toggle('warn', storm);
    // vandaag: laagste en hoogste temperatuur, met een stip voor nu
    const today = startOfDay(Date.now()), td = (this._fc_daily || []).find((f) => startOfDay(Date.parse(f.datetime)) === today);
    // zonder dagverwachting voor vandaag (zoals 's avonds): de komende 24 uur
    const T = (this._fc_hourly || []).filter((h) => { const t = Date.parse(h.datetime); return td ? startOfDay(t) === today : t < Date.now() + DAY; }).map((h) => h.temperature).filter((v) => v != null);
    if (a.temperature != null) T.push(a.temperature);
    let lo = td?.templow ?? Math.min(...T), hi = td?.temperature ?? Math.max(...T);
    if (a.temperature != null) { lo = Math.min(lo, a.temperature); hi = Math.max(hi, a.temperature); }
    if (isFinite(lo) && isFinite(hi)) {
      set('wLo', `${fmt(Math.floor(lo))}°`); set('wHi', `${fmt(Math.ceil(hi))}°`);
    }
    // dagen
    const days = (this._fc_daily || []).filter((f) => startOfDay(Date.parse(f.datetime)) > startOfDay(Date.now())).slice(0, 4);
    set('wDays', days.map((f) => {
      const [, di] = WCOND[f.condition] || ['', 'wCloud'];
      return `<span>${new Date(f.datetime).toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', '')}<svg viewBox="0 0 100 100"><use href="#${di === 'wNight' ? 'wSunny' : di}"/></svg>${fmt(f.temperature)}°</span>`;
    }).join(''));
  }

  /* ---------- energie nu ---------- */
  _updEnergy() {
    const c = this._config, num = (id) => { const v = parseFloat(this._state(id)?.state); return isNaN(v) ? null : v; };
    const watt = (id) => { const v = num(id); return v == null ? null : /kw/i.test(this._state(id).attributes.unit_of_measurement || '') ? v * 1000 : v; };
    const pv = watt(c.solar_power), grid = watt(c.grid_power), home = pv != null && grid != null ? Math.max(0, pv + grid) : null;
    const set = (id, html) => { const el = this.$(id); if (el.innerHTML !== html) el.innerHTML = html; };
    const pw = (w) => { if (w == null) return '—'; const f = fmtPower(Math.abs(w)); return `${f.v}<small>${f.u}</small>`; };
    const exp = grid != null && grid < -5, imp = grid != null && grid > 5, gcol = exp ? 'var(--exp)' : 'var(--grid-in)';
    set('enSun', pw(pv)); set('enHome', pw(home)); set('enGrid', pw(grid));
    set('enGridL', exp ? 'Terug' : imp ? 'Afname' : 'Net');
    this.$('enGridN').style.setProperty('--k', gcol);
    this.$('enGridIc').setAttribute('href', exp ? '#gPylonX' : '#gPylon');
    const l1 = this.$('enL1'), l2 = this.$('enL2');
    l1.classList.toggle('off', !(pv > 5));
    l2.style.setProperty('--k', gcol); l2.classList.toggle('off', !(exp || imp)); l2.classList.toggle('rev', imp);
  }

  /* ---------- rolluiken ---------- */
  _coverIds() { return (this._config.covers || []).filter((id) => this._state(id)); }
  _updCovers() {
    const ids = this._coverIds(), box = this.$('covers');
    const list = ids.map((id) => {
      const st = this._state(id), a = st.attributes;
      const pos = a.current_position != null ? a.current_position : st.state === 'closed' ? 0 : 100;
      return { id, pos, moving: ['opening', 'closing'].includes(st.state), name: (this._nm(st) || id).replace(/^Rolluik /, '') };
    });
    const key = JSON.stringify(list);
    if (key === this._cvKey) return;
    this._cvKey = key;
    const txt = (x) => (x.moving ? (this._state(x.id).state === 'opening' ? 'gaat open' : 'gaat dicht') : x.pos >= 99 ? 'open' : x.pos <= 1 ? 'dicht' : `${100 - x.pos}% dicht`);
    box.innerHTML = list.length ? list.map((x) => `<div class="cv${x.pos < 99 ? ' on' : ''}" data-id="${x.id}" style="--a:${(0.24 + 0.36 * (100 - x.pos) / 100).toFixed(3)}">${shutterSvg(x.pos, x.id)}<i class="mi2">${gBlind(x.pos)}</i><b>${x.name}</b><span>${txt(x)}</span></div>`).join('')
      : '<div class="wempty">Geen rolluiken gevonden. Zet ze in de kaartinstellingen bij <b>covers</b>.</div>';
    // tikken = open/dicht (of stoppen als hij beweegt), lang indrukken = venster met de exacte stand
    box.querySelectorAll('.cv').forEach((el) => {
      const x = list.find((y) => y.id === el.dataset.id);
      let timer = null, long = false;
      const cancel = () => { clearTimeout(timer); el.classList.remove('press'); };
      el.addEventListener('pointerdown', () => { long = false; el.classList.add('press'); timer = setTimeout(() => { long = true; cancel(); this._moreInfo(x.id); }, 500); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => el.addEventListener(t, cancel));
      el.addEventListener('click', (e) => {
        if (long) { long = false; return; }
        // telefoon: tik op de tegel = rolluikpaneel, tik op het rondje = omhoog/omlaag
        if (this._mq?.matches && !e.target.closest('.mi2')) { this._openSheet('cv', x.id); return; }
        this._coverToggle(x.id);
      });
      el.addEventListener('contextmenu', (ev) => { ev.preventDefault(); if (!long) this._moreInfo(x.id); long = true; });
    });
  }

  /* ---------- camera's ---------- */
  _updCams() {
    const ids = this._cameraIds();
    if (!ids.length) { this.$('camLive').innerHTML = '<div class="wempty" style="padding:20px">Geen camera gevonden</div>'; return; }
    if (!this._camId || !ids.includes(this._camId)) this._camId = ids[0];
    this.$('camTag').title = this._nm(this._camId) || this._camId;
    this._liveCam();
    this._thumbs();
  }
  async _liveCam() {
    if (this._camEl?._entity === this._camId || this._camLoading || !window.loadCardHelpers) return;
    this._camLoading = true;
    try {
      const helpers = await window.loadCardHelpers();
      const el = helpers.createCardElement({ type: 'picture-entity', entity: this._camId, camera_view: 'live', fit_mode: 'cover', show_name: false, show_state: false, tap_action: { action: 'none' } });
      el._entity = this._camId;
      el.hass = this._hass;
      const box = this.$('camLive');
      box.innerHTML = '';
      box.appendChild(el);
      this._camEl = el;
      this._camFill();
    } catch (e) {
      console.warn('thuis-card: camera laden mislukt', e);
    } finally {
      this._camLoading = false;
    }
  }
  // schermvullende camera: live beeld, wisselen via de rij onderaan, sluit vanzelf na 3 minuten
  async _openCam(id, keep) {
    const ids = this._cameraIds();
    if (!id || !window.loadCardHelpers) return;
    this.$('cFull').hidden = false;
    // UniFi noemt de stream "Deurbel High resolution channel": alleen de cameranaam tonen
    const nm = (c) => (this._nm(c) || c).replace(/\s*[-–]?\s*(high|medium|low)\s+resolution\s+channel\s*$/i, '').replace(/\s*(hoge|gemiddelde|lage)\s+resolutie.*$/i, '').trim();
    this.$('cfName').textContent = nm(id);
    this._applySound();
    const row = this.$('cfRow');
    row.innerHTML = ids.map((c) => {
      const pic = this._state(c)?.attributes.entity_picture;
      return `<div class="${c === id ? 'on' : ''}" data-id="${c}">${pic ? `<img alt="" src="${pic}${pic.includes('?') ? '&' : '?'}t=${Date.now()}">` : ''}<span>${nm(c)}</span></div>`;
    }).join('');
    row.querySelectorAll('div').forEach((d) => d.addEventListener('click', () => this._openCam(d.dataset.id)));
    clearTimeout(this._cfTimer);
    this._cfTimer = setTimeout(() => this._closeCam(), 3 * 60000);
    if (this._cfEl?._entity === id) return;
    // het kleine live-beeld pauzeren zolang het grote scherm open is (anders speelt dezelfde camera twee keer)
    if (this._camEl) { this.$('camLive').innerHTML = ''; this._camEl = null; }
    // dezelfde speler als het camera-venster van Home Assistant zelf; anders via een kaart
    let el;
    if (customElements.get('ha-camera-stream')) {
      el = document.createElement('ha-camera-stream');
      el.hass = this._hass; el.stateObj = this._state(id); el.muted = !this._cfSound; el.controls = false; el.allowExoPlayer = true; el.fitMode = 'contain';
      el.style.cssText = 'display:block;width:100%;height:100%';
    } else {
      const helpers = await window.loadCardHelpers();
      el = helpers.createCardElement({ type: 'picture-entity', entity: id, camera_view: 'live', fit_mode: 'contain', show_name: false, show_state: false, tap_action: { action: 'none' } });
      el.hass = this._hass;
    }
    el._entity = id;
    const box = this.$('cfLive'), old = keep ? [...box.children] : [];
    if (keep && old.length) {
      // geluid omzetten: de oude speler blijft zichtbaar tot de nieuwe beeld heeft (geen zwart scherm)
      box.style.position = 'relative';
      Object.assign(el.style, { position: 'absolute', inset: '0', opacity: '0' });
      box.appendChild(el);
      if (!this._cfSound) old.forEach((o) => { if ('muted' in o) o.muted = true; }); // uitzetten: oude speler meteen stil
      const t0 = Date.now(), swap = () => { clearInterval(w); el.style.opacity = ''; el.style.position = ''; el.style.inset = ''; old.forEach((o) => o.remove()); };
      const w = setInterval(() => {
        if (this._cfEl !== el) { clearInterval(w); el.remove(); return; }
        const v = this._videos()[0]; // this._cfEl is al de nieuwe speler
        if ((v && v.readyState >= 3 && !v.paused && v.currentTime > 0.2) || Date.now() - t0 > 8000) swap();
      }, 150);
    } else {
      box.innerHTML = '';
      box.appendChild(el);
    }
    this._cfEl = el;
    this._camFill(0, el, 'contain');
    // geluid en beeldverhouding toepassen zodra de speler er is (HA bouwt die later op)
    clearInterval(this._cfPoll);
    this._cfPoll = setInterval(() => {
      if (!this._cfEl) { clearInterval(this._cfPoll); return; }
      const v = this._videos()[0];
      if (v?.videoWidth) this.$('cfLive').style.setProperty('--ar', `${v.videoWidth} / ${v.videoHeight}`);
      if (v?.videoWidth) clearInterval(this._cfPoll);
    }, 1000);
  }
  // alle video's (en HA-spelers) in het volledige camerascherm, ook binnen shadow roots
  _videos(players) {
    const out = [], walk = (n) => {
      if (!n) return;
      if (players ? /^(HA-CAMERA-STREAM|HA-HLS-PLAYER|HA-WEB-RTC-PLAYER)$/.test(n.tagName) : n.tagName === 'VIDEO') out.push(n);
      if (n.shadowRoot) walk(n.shadowRoot);
      for (const c of n.children || []) walk(c);
    };
    walk(this._cfEl);
    return out;
  }
  _applySound(quiet) {
    const on = !!this._cfSound, b = this.$('cfS');
    b.classList.toggle('on', on);
    const html = on ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Geluid aan'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9.5 21 14M21 9.5 16.5 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Geluid';
    if (b.innerHTML !== html) b.innerHTML = html;
    // zonder HA-speler (terugval via een kaart): het geluid direct omzetten
    if (!customElements.get('ha-camera-stream') && !quiet) this._videos().forEach((v) => { v.muted = !on; if (on && v.paused) v.play?.().catch(() => {}); });
  }
  _closeCam() {
    clearTimeout(this._cfTimer); clearInterval(this._cfPoll); this._cfSound = false;
    setTimeout(() => this._liveCam(), 50); // klein live-beeld weer starten
    this.$('cFull').hidden = true;
    this.$('cfLive').innerHTML = '';
    this._cfEl = null;
  }
  // het live-beeld van HA vult het hele vlak (bijsnijden in plaats van zwarte randen)
  _camFill(tries = 0, el = this._camEl, fit = 'cover') {
    if (!el) return;
    const css = 'ha-card,hui-image,ha-camera-stream,ha-hls-player,ha-web-rtc-player,.image-container,#image,div[style*="padding-bottom"]{display:block;width:100%!important;height:100%!important;padding-bottom:0!important}'
      + `video,img{width:100%!important;height:100%!important;left:0!important;top:0!important;object-fit:${fit}!important}`;
    const roots = [], walk = (n) => { if (!n) return; if (n.shadowRoot) { roots.push(n.shadowRoot); walk(n.shadowRoot); } for (const ch of n.children || []) walk(ch); };
    walk(el);
    for (const r of roots) if (!r.getElementById('th-fill')) { const st = document.createElement('style'); st.id = 'th-fill'; st.textContent = css; r.appendChild(st); }
    // de speler bouwt zijn onderdelen later op: nog even blijven nalopen
    if (tries < 40 && (el === this._camEl || el === this._cfEl)) setTimeout(() => this._camFill(tries + 1, el, fit), 500);
  }

  /* ---------- buienradar ---------- */
  // ingezoomde Buienradar-kaart rond de thuislocatie; het kaartje is 550 x 512 en wordt passend geschaald
  _radar() {
    const box = this.$('radar'), f = this.$('rFrame'), k = box.offsetWidth / 550;
    f.style.transform = `translateY(${(box.offsetHeight - 512 * k) / 2}px) scale(${k})`;
    if (Date.now() - (this._rAt || 0) < 15 * 60000) return;
    const z = this._state('zone.home')?.attributes || {};
    const lat = (z.latitude ?? 52.1).toFixed(4), lng = (z.longitude ?? 5.18).toFixed(4);
    this._rAt = Date.now();
    f.src = `https://gadgets.buienradar.nl/gadget/zoommap/?lat=${lat}&lng=${lng}&overname=2&zoom=${this._config.radar_zoom}&naam=Thuis&size=3&voor=1`;
  }

  _thumbs() {
    const ids = this._cameraIds();
    if (!this.shadowRoot || !ids.length) return;
    const box = this.$('thumbs');
    box.style.setProperty('--n', ids.length);
    const key = JSON.stringify([ids, this._camId]);
    if (key !== this._thumbKey) {
      this._thumbKey = key;
      box.innerHTML = ids.map((id) => `<div class="thumb${id === this._camId ? ' on' : ''}" data-id="${id}" title="${this._nm(id) || id}"><img alt=""><i></i></div>`).join('');
      box.querySelectorAll('.thumb').forEach((el) => el.addEventListener('click', () => { this._camId = el.dataset.id; this._updCams(); }));
    }
    // stilstaand beeld elke 10 seconden vernieuwen
    box.querySelectorAll('.thumb').forEach((el) => {
      const st = this._state(el.dataset.id), ok = st && !['unavailable', 'unknown'].includes(st.state);
      el.style.setProperty('--c', ok ? 'var(--exp)' : 'var(--sun)');
      const pic = st?.attributes.entity_picture;
      if (pic) el.querySelector('img').src = `${pic}${pic.includes('?') ? '&' : '?'}t=${Math.floor(Date.now() / 10000)}`;
    });
  }

  /* ---------- verlichting ---------- */
  _lightColor(a) {
    // Hue-kleuren voller maken, zodat ze niet vaal ogen (zelfde tint, meer verzadiging)
    if (a.rgb_color) {
      const [r, g, b] = a.rgb_color.map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx - mn < .08) return '#ffc83d';
      const d = mx - mn, h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return `hsl(${Math.round((h * 60 + 360) % 360)} 95% 60%)`;
    }
    const k = a.color_temp_kelvin;
    if (k) return k < 2700 ? '#ff9a2e' : k < 3500 ? '#ffb02e' : k < 4500 ? '#ffc83d' : '#ffe27a';
    return '#ffc83d';
  }
  _updLights() {
    const ids = this._lightIds();
    const ls = ids.map((id) => this._state(id) || (id.startsWith('missing:') ? { entity_id: id, state: 'unavailable', attributes: { friendly_name: id.slice(8) } } : null)).filter(Boolean);
    const key = JSON.stringify(ls.map((s) => [s.entity_id, s.state, s.attributes.brightness, s.attributes.rgb_color, s.attributes.color_temp_kelvin]));
    if (key === this._lightKey) return;
    this._lightKey = key;
    const box = this.$('lights');
    box.innerHTML = ls.map((s) => {
      const a = s.attributes, isOn = s.state === 'on', col = this._lightColor(a);
      const name = (this._nm(s) || s.entity_id).replace(/^Hue /, '');
      return `<div class="lt${isOn ? ' on' : ''}${s.state === 'unavailable' ? ' off2' : ''}" data-id="${s.entity_id}" style="--lc:${col};--a:${isOn ? (0.12 + 0.28 * (a.brightness ?? 255) / 255).toFixed(3) : 0}">
        ${isOn ? bulbSvg(col) : '<svg class="bulb" viewBox="0 0 100 100"><use href="#gBulbOff"/></svg>'}
        <i class="mi2">${gBulb(isOn)}</i><div class="n">${name}</div><div class="ms">${isOn ? `Aan${a.brightness != null ? ` · ${Math.round(a.brightness / 2.55)}%` : ''}` : s.state === 'unavailable' ? 'Niet bereikbaar' : 'Uit'}</div>${isOn ? '' : s.entity_id.startsWith('missing:') ? '<div class="s">niet gevonden</div>' : s.state === 'unavailable' ? '<div class="s">niet bereikbaar</div>' : ''}</div>`;
    }).join('');
    // tikken = aan/uit, lang indrukken (of rechtermuisknop) = venster met helderheid en kleur
    box.querySelectorAll('.lt').forEach((el) => {
      const id = el.dataset.id;
      if (id.startsWith('missing:')) return;
      let timer = null, long = false;
      const cancel = () => { clearTimeout(timer); timer = null; el.classList.remove('press'); };
      el.addEventListener('pointerdown', () => {
        long = false; el.classList.add('press');
        timer = setTimeout(() => { long = true; cancel(); this._moreInfo(id); }, 500);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => el.addEventListener(t, cancel));
      el.addEventListener('click', (e) => {
        if (long) { long = false; return; }
        // telefoon: tik op de tegel = lamppaneel, tik op het rondje = aan/uit
        if (this._mq?.matches && !e.target.closest('.mi2')) { this._openSheet('lt', id); return; }
        this._hass.callService('light', 'toggle', { entity_id: id });
      });
      el.addEventListener('contextmenu', (ev) => { ev.preventDefault(); if (!long) this._moreInfo(id); long = true; });
    });
  }

  /* ---------- agenda ---------- */
  _calendars() {
    const pal = ['#ff453a', '#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ffd60a', '#64d2ff', '#ff375f'];
    const list = this._config.calendars.length ? this._config.calendars.map((c) => (typeof c === 'string' ? { entity: c } : c))
      : Object.keys(this._hass?.states || {}).filter((k) => k.startsWith('calendar.')).sort().map((entity) => ({ entity }));
    return list.map((c, i) => ({ ...c, color: c.color || pal[i % pal.length] }));
  }
  // afspraken van vandaag t/m 6 dagen vooruit, elke 5 minuten opnieuw
  async _fetchAgenda() {
    if (this._kmode) return;
    const cals = this._calendars();
    if (!this._hass?.callApi || !cals.length) { this._events = null; this._drawAgenda(); return; }
    const from = new Date(startOfDay(Date.now())), to = new Date(from.getTime() + 7 * DAY);
    const q = `?start=${encodeURIComponent(from.toISOString())}&end=${encodeURIComponent(to.toISOString())}`;
    const res = await Promise.all(cals.map((c) => this._hass.callApi('GET', `calendars/${c.entity}${q}`)
      .then((evs) => evs.map((e) => ({ ...e, cal: c })))
      .catch(() => [])));
    this._events = res.flat();
    this._drawAgenda();
  }
  _drawAgenda() {
    const tile = this.$('agTile'), box = this.$('agenda');
    if (!this._events) { tile.hidden = true; return; }
    tile.hidden = false;
    const day0 = startOfDay(Date.now()), now = Date.now();
    const pd = (d) => (d.dateTime ? Date.parse(d.dateTime) : new Date(...d.date.split('-').map((x, i) => (i === 1 ? x - 1 : +x))).getTime());
    const days = [];
    for (let i = 0; i < (this._mq?.matches ? 3 : 7); i++) { // telefoon: vandaag t/m overmorgen
      const a = day0 + i * DAY, b = a + DAY;
      const evs = this._events.map((e) => ({ e, s: pd(e.start), t: pd(e.end), all: !e.start.dateTime }))
        // meerdaagse afspraken alleen op de eerste dag die we tonen
        .filter((x) => x.s < b && x.t > a && (x.s >= a || i === 0))
        .filter((x) => x.t > now) // afgelopen afspraken weglaten, zoals de Apple-widget
        .sort((x, y) => (y.all - x.all) || (x.s - y.s));
      if (evs.length) days.push({ i, a, evs });
    }
    const name = (i, a) => (i === 0 ? 'VANDAAG' : i === 1 ? 'MORGEN' : new Date(a).toLocaleDateString('nl-NL', { weekday: 'long' }).toUpperCase());
    const icons = this._config.agenda_icons || [], evIcon = (t) => { const tl = String(t || '').toLowerCase(), m = icons.find((x) => [].concat(x.match).some((w) => tl.includes(String(w).toLowerCase()))); return m ? `<img class="eimg" src="${m.image}" alt="">` : ''; };
    const esc = (t) => String(t || '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const html = '<div class="th"><span class="label">Agenda</span></div><div class="agl">' + (days.length ? days.map(({ i, a, evs }) => `<div class="sec">${name(i, a)}</div>` + evs.map(({ e, s, t, all }) =>
      `<div class="ev" data-e="${e.cal.entity}" style="--c:${e.cal.color}"><i></i><div><b>${esc(e.summary)}</b>${all ? (t - s > DAY ? `<span>t/m ${new Date(t - 1).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')}</span>` : '') : `<span>${fmtTime(s)} – ${fmtTime(t)}${e.location ? ` · ${esc(e.location.split(',')[0])}` : ''}</span>`}</div>${evIcon(e.summary)}</div>`).join('')).join('')
      : '<div class="none">Geen afspraken de komende week</div>') + '</div>';
    if (html === this._agKey) return;
    this._agKey = html;
    box.innerHTML = html;
    box.querySelectorAll('.ev').forEach((el) => el.addEventListener('click', () => this._moreInfo(el.dataset.e)));
    this._updPicnic();
  }

  /* ---------- vaatwasser, oven en meldingen ---------- */
  _updAppliances() {
    if (!this.shadowRoot || !this._hass) return;
    const st = (id) => this._state(id)?.state, num = (id) => { const v = parseFloat(st(id)); return isNaN(v) ? null : v; };
    const left = (id) => { const t = Date.parse(st(id)); return isNaN(t) ? null : Math.max(0, (t - Date.now()) / 60000); };
    const end = (id) => { const t = Date.parse(st(id)); return isNaN(t) ? null : fmtTime(t); };
    const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}` : `${Math.round(m)} min`);
    const prog = (id, map) => { const v = st(id) || ''; const k = Object.keys(map).find((x) => v.endsWith(x)); return k ? map[k] : ''; };
    const put = (box, cls, html) => { const key = cls + html; if (box._key === key) return; box._key = key; box.hidden = !cls; box.className = `was ${cls}`; box.innerHTML = html; };
    const block = (svg, name, big, ph, sub, pct, extra = '') => `<div class="r">${svg}<div class="t"><b>${name}</b><span class="tm" style="color:#fff">${big}</span></div><div class="rt"><b>${ph}</b>${sub}</div></div>${pct != null ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}${extra}`;
    // vaatwasser
    const d = this._config.dishwasher, ds = st(`sensor.${d}_status`), dBox = this.$('dish');
    if (dBox && ds) {
      const dp = prog(`select.${d}_actieve_programma`, DISH_PROG) || prog(`select.${d}_geselecteerd_programma`, DISH_PROG);
      const dl = left(`sensor.${d}_programma_eindtijd`), de = end(`sensor.${d}_programma_eindtijd`), dpct = num(`sensor.${d}_programma_voortgang`);
      const opts = [['vario_speed', 'VarioSpeed+'], ['intensieve_zone', 'Intensieve zone'], ['briljant_droog', 'Briljant droog']].filter(([k]) => st(`switch.${d}_${k}`) === 'on').map(([, n]) => `<em>${n}</em>`).join('');
      const chips = opts ? `<div class="achips">${opts}</div>` : '';
      // "klaar" onthouden tot de deur opengaat: de vaatwasser schakelt zichzelf kort na het einde uit
      let done = null; try { done = JSON.parse(localStorage.getItem('thuis-vaat-klaar') || 'null'); } catch (e) { /* geen opslag */ }
      const door = this._state(`sensor.${d}_deur`), save = (v) => { try { if (v) localStorage.setItem('thuis-vaat-klaar', JSON.stringify(v)); else localStorage.removeItem('thuis-vaat-klaar'); } catch (e) { /* geen opslag */ } };
      if (ds === 'run' || ds === 'delayedstart') { if (done) save(done = null); }
      else if (ds === 'finished' && !done) save(done = { at: Date.now(), end: de || fmtTime(Date.now()) });
      if (done && (door?.state === 'open' || (door && Date.parse(door.last_changed) > done.at) || Date.now() - done.at > 12 * HOUR)) save(done = null);
      if (ds === 'run') put(dBox, 'dish run', block(dishSvg(true), 'Vaatwasser', dl != null ? dur(dl) : '—', 'Bezig', `${dp}${dpct != null ? ` · ${fmt(dpct)}%` : ''}<br>${de ? `klaar ${de}` : ''}`, dpct ?? 0, chips));
      else if (ds === 'delayedstart') put(dBox, 'dish run', block(dishSvg(false), 'Vaatwasser', 'Gepland', 'Uitgesteld', `${dp}<br>${de ? `klaar ${de}` : ''}`, null, chips));
      else if (ds === 'pause') put(dBox, 'dish run', block(dishSvg(false), 'Vaatwasser', dl != null ? dur(dl) : '—', 'Gepauzeerd', `${dp}<br>${de ? `klaar ${de}` : ''}`, dpct ?? 0));
      else if (done) put(dBox, 'done', block(dishSvg(false), 'Vaat is klaar', done.end, 'Klaar', 'deur nog dicht —<br>laat de stoom eruit', 100));
      else if (['actionrequired', 'error'].includes(ds)) put(dBox, 'bad', block(dishSvg(false), 'Vaatwasser', '', ds === 'error' ? 'Storing' : 'Actie nodig', 'controleer de machine', null));
      else if (st(`switch.${d}_inschakelen`) === 'on') put(dBox, 'ready', block(dishSvg(false), 'Vaatwasser', prog(`select.${d}_geselecteerd_programma`, DISH_PROG) || '—', 'Aan', prog(`select.${d}_geselecteerd_programma`, DISH_PROG) ? 'klaar om te starten' : 'geen programma gekozen', null));
      else put(dBox, '', '');
    }
    // oven
    const o = this._config.oven, os = st(`sensor.${o}_status`), oBox = this.$('oven'), temp = num(`sensor.${o}_huidige_temperatuur_in_de_oven`);
    if (oBox && os) {
      const op = prog(`select.${o}_actieve_programma`, OVEN_PROG), ol = left(`sensor.${o}_programma_eindtijd`), oe = end(`sensor.${o}_programma_eindtijd`), opct = num(`sensor.${o}_programma_voortgang`);
      const lamp = '';
      const tt = temp != null ? `${fmt(temp)}°` : '—', time = ol != null ? `nog ${dur(ol)}${oe ? ` · klaar ${oe}` : ''}` : '';
      // magnetron: eigen naam, icoon en vermogen in plaats van temperatuur
      const ap = (/microwave|cooking/.test(st(`select.${o}_actieve_programma`) || '') ? st(`select.${o}_actieve_programma`) : st(`select.${o}_geselecteerd_programma`)) || '', mw = /microwave/.test(ap) ? (ap.match(/microwave_(\d+)_watt/)?.[1] ? `${ap.match(/microwave_(\d+)_watt/)[1]} W` : 'Max') : null;
      if (mw && ['run', 'pause', 'finished', 'delayedstart'].includes(os)) {
        const ph = os === 'run' ? 'Bezig' : os === 'pause' ? 'Gepauzeerd' : os === 'finished' ? 'Klaar' : 'Uitgesteld';
        put(oBox, os === 'finished' ? 'done' : 'oven run', block(microSvg(os === 'run' ? 'run' : os === 'finished' ? 'hot' : '', os === 'finished' ? 'End' : ol != null ? (() => { const sec = Math.max(0, Math.round(ol * 60)); return sec >= 3600 ? `${Math.floor(sec / 3600)}u${String(Math.floor(sec / 60) % 60).padStart(2, '0')}` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; })() : ''), os === 'finished' ? 'Magnetron is klaar' : 'Magnetron', mw, ph, os === 'finished' ? 'klaar' : time || (oe ? `klaar ${oe}` : ''), os === 'finished' ? 100 : ol != null ? opct ?? 0 : null));
      } else
      if (os === 'run') put(oBox, 'oven run', block(ovenSvg('run', temp), 'Oven', tt, 'Bezig', `${op}<br>${time}`, ol != null ? opct ?? 0 : null, lamp));
      else if (os === 'pause') put(oBox, 'oven run', block(ovenSvg('hot', temp), 'Oven', tt, 'Gepauzeerd', `${op}<br>${time}`, opct));
      else if (os === 'delayedstart') put(oBox, 'oven run', block(ovenSvg('', temp), 'Oven', 'Gepland', 'Uitgesteld', `${op}<br>${oe ? `klaar ${oe}` : ''}`, null));
      else if (os === 'finished') put(oBox, 'done', block(ovenSvg('hot', temp), 'Oven is klaar', tt, 'Klaar', `${op}<br>baktijd voorbij`, 100));
      else if (['actionrequired', 'error'].includes(os)) put(oBox, 'bad', block(ovenSvg('', temp), 'Oven', tt, os === 'error' ? 'Storing' : 'Actie nodig', 'controleer de oven', null));
      else if (st(`switch.${o}_inschakelen`) === 'on' && /microwave/.test(st(`select.${o}_geselecteerd_programma`) || '')) {
        const sp = st(`select.${o}_geselecteerd_programma`), w = sp.match(/microwave_(\d+)_watt/)?.[1];
        put(oBox, 'ready', block(microSvg(''), 'Magnetron', w ? `${w} W` : 'Max', 'Aan', 'klaar om te starten', null)); }
      else if (st(`switch.${o}_inschakelen`) === 'on') { const sel = prog(`select.${o}_geselecteerd_programma`, OVEN_PROG); put(oBox, 'ready', block(ovenSvg(temp >= 50 ? 'hot' : '', temp), 'Oven', tt, 'Aan', sel ? `${sel}<br>klaar om te starten` : 'geen programma gekozen', null)); }
      else if (temp != null && temp >= 50) put(oBox, 'cool', block(ovenSvg('hot', temp), 'Oven koelt af', tt, 'Heet', 'uit · nog warm<br>pas op bij openen', null));
      else put(oBox, '', '');
    }
    this._updCharge();
    this._updNotices();
    // bij twee of meer activiteiten of meldingen maakt Energie nu plaats
    const busy = ['evc', 'was', 'dish', 'oven', 'notTile'].filter((id) => this.$(id) && !this.$(id).hidden).length;
    this.$('enTile').hidden = busy >= 2;
  }
  // meldingen: alleen zichtbaar als er iets is; "Gedaan" verbergt een melding tot hij opnieuw binnenkomt
  _updNotices() {
    const box = this.$('notTile'), list = this.$('notList'), d = this._config.dishwasher;
    let hidden = {}; try { hidden = JSON.parse(localStorage.getItem('thuis-meldingen') || '{}'); } catch (e) { /* geen opslag */ }
    const seen = new Set();
    const items = DISH_NOTES.map(([k, t, desc, c, ic]) => ({ id: `sensor.${d}_${k}`, t, desc: `Vaatwasser · ${desc}`, c, ic })).filter((n) => {
      const s = this._state(n.id); if (s?.state !== 'present' || seen.has(n.t)) return false;
      if (hidden[n.id] === s.last_changed) return false;
      seen.add(n.t); n.since = s.last_changed; return true;
    });
    // controle na updates: een entiteit die het dashboard eerder zag maar nu niet meer bestaat
    this._health().forEach((n) => { if (hidden[n.id] !== n.since && !this._hass.states[n.id.slice(5)]) items.push(n); });
    // batterij van sensoren op of onder 5% (telefoons en de auto niet)
    this._lowBat().forEach((n) => { if (hidden[n.id] !== n.since) items.push(n); });
    // veiligheid: rookmelders (test, batterij) als melding; alarm en waarschuwing als balk bovenaan
    const safe = this._safety();
    safe.notes.forEach((n) => { const st = this._state(n.id); const since = `${n.key}:${st?.last_changed || ''}`; if (hidden[n.id + n.key] !== since) items.push({ ...n, id: n.id + n.key, since }); });
    this._updAlarm(safe.alarms);
    const html = items.map((n) => `<div class="nrow" style="--c:${n.c}"><span class="mi">${n.svg || NI[n.ic]}</span><div><b>${n.t}</b><span>${n.desc}</span></div><button data-id="${n.id}" data-since="${n.since}">Gedaan</button></div>`).join('');
    box.hidden = !items.length;
    this.$('notN').textContent = items.length || '';
    if (list.innerHTML === html) return;
    list.innerHTML = html;
    list.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      try { const h = JSON.parse(localStorage.getItem('thuis-meldingen') || '{}'); h[b.dataset.id] = b.dataset.since; localStorage.setItem('thuis-meldingen', JSON.stringify(h)); } catch (e) { /* geen opslag */ }
      this._updNotices();
    }));
    list.querySelectorAll('.nrow').forEach((r) => this._swipe(r, () => r.querySelector('button')?.click()));
  }

  _lowBat() {
    if (this._lb && Date.now() - this._lb.t < 20000) return this._lb.v;
    const v = this._lowBatCheck(); this._lb = { t: Date.now(), v }; return v;
  }
  _lowBatCheck() {
    const h = this._hass, S = h.states, E = h.entities || {}, D = h.devices || {}, A = h.areas || {}, c = this._config, out = [];
    let hid = null;
    Object.keys(S).forEach((id) => {
      if (!id.startsWith('sensor.')) return;
      const x = S[id], a = x.attributes; if (a.device_class !== 'battery' || (a.unit_of_measurement && a.unit_of_measurement !== '%')) return;
      const e = E[id] || {}; if (e.platform === 'mobile_app' || id === c.car_battery || /byd|iphone|ipad|telefoon|phone|watch/i.test(id)) return;
      const v = parseFloat(x.state), key = `bat:${id}`;
      if (isNaN(v) || v > 5) { // weer opgeladen of vervangen: een weggeveegde melding vergeten
        if (hid == null) try { hid = JSON.parse(localStorage.getItem('thuis-meldingen') || '{}'); } catch (er) { hid = {}; }
        if (hid[key]) { delete hid[key]; try { localStorage.setItem('thuis-meldingen', JSON.stringify(hid)); } catch (er) { /* geen opslag */ } }
        return;
      }
      // niet melden: rookmelders (eigen melding vanaf 20%), Hue-dimmers en -knoppen, deur- en raamsensoren
      const d0 = D[e.device_id] || {}, dn = `${id} ${this._nm(id)} ${d0.name || ''} ${d0.name_by_user || ''} ${d0.model || ''}`;
      if (/dimmer|button|knop|smart_button|tap_dial|remote|afstandsbediening|door_window|deur|raam|window|contact|io_series|toothbrush|tandenborstel|watch|airpods/i.test(dn)) return;
      if (e.device_id && Object.keys(E).some((k) => E[k].device_id === e.device_id && (SMOKE_RE.test(k) || ['smoke', 'door', 'window', 'opening', 'garage_door'].includes(S[k]?.attributes.device_class)))) return;
      const d = D[e.device_id] || {}, area = A[e.area_id || d.area_id]?.name;
      const raw = d.name_by_user || d.name || this._nm(id) || id.slice(7).replace(/_/g, ' ');
      let nm = raw.replace(/[\s_]*(batterij(niveau)?|battery( level)?)\s*$/i, '').trim(); nm = nm.charAt(0).toUpperCase() + nm.slice(1);
      out.push({ id: key, since: 'low', t: nm, desc: `Batterij bijna leeg · nog ${Math.round(v)}%${area ? ` · ${area}` : ''}`, c: '#ff8a5c', ic: 'warn', svg: RIC.svg('battery', 'on', v) });
    });
    return out.sort((p, q) => parseFloat(p.desc.match(/(\d+)%/)?.[1]) - parseFloat(q.desc.match(/(\d+)%/)?.[1])).slice(0, 3);
  }
  // controle na updates van Home Assistant of een integratie: entiteiten uit de instellingen die eerder bestonden en nu ontbreken
  _health() {
    // één keer per keer openen of herladen van de app; 15 seconden wachten, zodat integraties na een herstart van Home Assistant eerst kunnen opstarten
    if (this._hc) return this._hc;
    this._hcT0 ??= Date.now();
    if (Date.now() - this._hcT0 < 15000) { if (!this._hcTimer) this._hcTimer = setTimeout(() => this._updNotices(), 15500); return []; }
    this._hc = this._healthCheck(); return this._hc;
  }
  _healthCheck() {
    const c = this._config, S = this._hass?.states; if (!S || Object.keys(S).length < 20) return [];
    const ids = new Set(), add = (v) => { if (typeof v === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(v)) ids.add(v); };
    const NAMES = { washer: 'Wasmachine', climate: 'Thermostaat', weather: 'Weer', grid_power: 'Energie nu', solar_power: 'Zonnepanelen', car_battery: 'Auto', car_charging: 'Laadpaal', charger_power: 'Laadpaal' };
    const label = {};
    Object.entries(c).forEach(([k, v]) => { if (typeof v === 'string') { add(v); if (NAMES[k]) label[v] = NAMES[k]; } });
    if (c.dishwasher) { add(`sensor.${c.dishwasher}_status`); label[`sensor.${c.dishwasher}_status`] = 'Vaatwasser'; }
    if (c.oven) { add(`sensor.${c.oven}_status`); label[`sensor.${c.oven}_status`] = 'Oven'; }
    (c.persons || []).forEach((p) => { add(p.entity); label[p.entity] = p.name || 'Persoon'; });
    (c.covers || []).forEach((x) => { add(x); label[x] = 'Rolluik'; });
    (c.calendars || []).forEach((x) => { add(x.entity || x); label[x.entity || x] = 'Agenda'; });
    (c.waste || []).forEach((x) => { add(x.entity); label[x.entity] = `Afval ${x.name || ''}`.trim(); });
    // onthoud wat er bestaat; meld alleen wat eerder bestond (dus geen meldingen voor dingen die je nooit had)
    let seen = {}; try { seen = JSON.parse(localStorage.getItem('thuis-gezien') || '{}'); } catch (e) { /* geen opslag */ }
    let dirty = false; const out = [];
    ids.forEach((id) => {
      if (S[id]) { if (!seen[id]) { seen[id] = 1; dirty = true; } return; }
      if (seen[id]) out.push({ id: `gone:${id}`, since: 'gone', t: `${label[id] || id.split('.')[1].replace(/_/g, ' ')} niet gevonden`, desc: id, c: '#ffb340', ic: 'warn' });
    });
    if (dirty) try { localStorage.setItem('thuis-gezien', JSON.stringify(seen)); } catch (e) { /* geen opslag */ }
    // weer gevonden: een eerder weggeveegde melding vergeten, zodat hij terugkomt als het opnieuw misgaat
    try { const h = JSON.parse(localStorage.getItem('thuis-meldingen') || '{}'); let ch = false; Object.keys(h).forEach((k) => { if (k.startsWith('gone:') && S[k.slice(5)]) { delete h[k]; ch = true; } }); if (ch) localStorage.setItem('thuis-meldingen', JSON.stringify(h)); } catch (e) { /* geen opslag */ }
    return out.slice(0, 3);
  }

  // laadpaal in het kamerpaneel: kaart + knoppen Laden / Pauze / Stop (alleen de laadpaal wordt bediend)
  _evState() {
    const c = this._config, S = this._hass.states, mode = String(S[c.car_charging]?.state || ''), a = parseFloat(S[c.charger_current_a]?.state);
    const plugged = /^connected/.test(mode), zero = a === 0, soc = parseFloat(S[c.car_battery]?.state);
    return { plugged, charging: mode === 'connected_charging' && !zero, paused: plugged && (zero || (mode === 'connected_finished' && !(soc >= 99))), soc };
  }
  _evSection(rm) {
    if (!(rm.r.apps || []).includes('evc')) return '';
    const c = this._config, S = this._hass.states, st = this._evState(), box = this.$('evc');
    let card;
    if (st.plugged && box && box.innerHTML) card = `<div class="${box.className.replace(/\bgone\b/, '')}">${box.innerHTML}</div>`;
    else {
      const on = S[c.charger_online], fw = S[c.charger_firmware];
      const hl = `<div class="evh">${on ? `<span><i style="background:${on.state === 'on' ? '#3ddc97' : '#ff6b5e'}"></i>${on.state === 'on' ? 'online' : 'offline'}</span>` : ''}${fw ? `<span>firmware <b${fw.state === 'on' ? ' style="color:var(--sun)"' : ''}>${fw.state === 'on' ? 'update' : 'actueel'}</b></span>` : ''}</div>`;
      card = `<div class="was xchg evwait evoff"><div class="xr"><div class="xl"><div class="xh"><div><b>Niet aangesloten</b></div></div>${hl}</div>
        <svg class="xi xo" viewBox="140 0 46 74"><rect x="148" y="6" width="32" height="50" rx="10" fill="url(#g-white)"/><rect x="155.5" y="14" width="17" height="6.5" rx="3.2" fill="#8a94a6"/><circle cx="163" cy="37" r="5.5" fill="url(#g-metal)"/><rect x="158" y="56" width="10" height="14" rx="3" fill="url(#g-metal)"/><path d="M163 42c0 14 2 22-6 26" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="4" stroke-linecap="round"/></svg></div></div>`;
    }
    const dis = st.plugged ? '' : ' disabled', B = (a, l, ic, on) => `<button data-a="${a}" class="${on ? 'on' : ''}"${dis}><svg viewBox="0 0 24 24">${ic}</svg><span>${l}</span></button>`;
    if (this._evErr && st.charging) this._evErr = null;
    const busy = this._evBusy && Date.now() - this._evBusy < 20000;
    return `<div class="kth">Laadpaal</div><div class="evsec evone">${card.replace(/<\/div>$/, '')}<div class="evseg${busy ? ' busy' : ''}">${B('start', 'Laden', '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>', st.charging)}${B('pause', 'Pauze', '<rect x="6.5" y="5" width="4" height="14" rx="1.4" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.4" fill="currentColor"/>', st.paused)}${B('stop', 'Stop', '<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/>', false)}</div>${this._evErr ? `<div class="everr">${this._evErr}</div>` : ''}</div></div>`;
  }
  _evAct(a) {
    const c = this._config, h = this._hass, st0 = (id) => this._hass.states[id];
    const fail = (e) => { this._evErr = `Laadpaal reageert niet: ${e?.message || e || 'onbekende fout'}`; this._rmKey = null; this._updRoomSheet(); };
    const call = (d, sv, data) => Promise.resolve(h.callService(d, sv, data)).catch(fail);
    const cur = () => st0(c.charger_current_a), sw = () => st0(c.charger_switch);
    const canZero = cur() && Number(cur().attributes.min) === 0, swOk = () => sw() && !['unavailable', 'unknown'].includes(sw().state);
    const amps = () => parseFloat(cur()?.state);
    const setA = (v) => call('number', 'set_value', { entity_id: c.charger_current_a, value: v });
    const press = (id) => { if (st0(id) && st0(id).state !== 'unavailable') call('button', 'press', { entity_id: id }); };
    let back = c.charger_max_a || 16; try { back = parseFloat(localStorage.getItem('thuis-laadstroom')) || back; } catch (e) { /* geen opslag */ }
    if (!(back >= 6)) back = c.charger_max_a || 16;
    this._evErr = null; clearTimeout(this._evRetry);
    if (a === 'pause') {
      if (canZero) { const v = amps(); try { localStorage.setItem('thuis-laadstroom', String(v >= 6 ? v : back)); } catch (e) { /* geen opslag */ } setA(0); }
      else if (swOk()) call('switch', 'turn_off', { entity_id: c.charger_switch }); else press(c.charger_stop);
    } else if (a === 'start') {
      // de Zaptec stopt de sessie bij een pauze (FinalStop); de BYD vraagt daarna zelf geen stroom meer:
      // laadpaal vrijgeven én de auto vragen om te starten (de knop is er alleen als de auto niet laadt)
      const go = () => { if (canZero && !(amps() > 0)) setA(back);
        if (swOk() && sw().state === 'off') call('switch', 'turn_on', { entity_id: c.charger_switch });
        press(c.charger_resume); setTimeout(carStart, 4000); };
      // auto alleen vragen als hij nog geen stroom neemt; een weigering van de auto (laadt al) negeren, zonder melding
      const carStart = () => { const b = st0(c.car_start_button), pw = parseFloat(st0(c.charger_power)?.state);
        if (!b || b.state === 'unavailable' || pw > 300) return;
        Promise.resolve(h.callService('button', 'press', { entity_id: c.car_start_button }, undefined, false)).catch(() => {}); };
      go();
      // de Zaptec-cloud reageert soms traag: na 30 s nog niet terug, dan nogmaals
      this._evRetry = setTimeout(() => { const p = parseFloat(st0(c.charger_power)?.state); if (!(amps() > 0) || !(p > 300)) go(); }, 45000);
    } else if (a === 'stop') {
      if (canZero && !(amps() > 0)) setA(back); // geen 0 A achterlaten, anders start de volgende sessie niet
      if (swOk()) call('switch', 'turn_off', { entity_id: c.charger_switch }); else press(c.charger_stop);
    }
    this._evBusy = Date.now(); this._rmKey = null; this._updRoomSheet(); setTimeout(() => { this._rmKey = null; this._updRoomSheet(); }, 20500);
  }

  // weer: de ingestelde weer-entiteit; is die (even) niet beschikbaar, dan een andere weer-entiteit (bv. Buienradar)
  _wxId() {
    const S = this._hass?.states || {}, c = this._config;
    if (c.weather && S[c.weather]) return c.weather;
    return Object.keys(S).find((k) => k === 'weather.buienradar') || Object.keys(S).find((k) => k.startsWith('weather.')) || c.weather;
  }
  _wxState() {
    const ok = (x) => x && !['unavailable', 'unknown'].includes(x.state), S = this._hass?.states || {};
    // één bron: levert de gekozen bron geen verwachting, dan alles (ook het actuele weer) van de bron die dat wel doet
    const fe = this._fcFrom?.daily || this._fcFrom?.hourly, fs = fe && fe !== this._wxId() ? this._state(fe) : null;
    if (ok(fs)) return fs;
    const w = this._state(this._wxId()); if (ok(w)) return w;
    const alt = Object.values(S).find((x) => x.entity_id.startsWith('weather.') && ok(x));
    if (alt) return alt;
    // niets beschikbaar: het eerste uur van de verwachting als 'nu' gebruiken
    const f = (this._fc_hourly || []).find((x) => Date.parse(x.datetime) >= Date.now() - 3600000);
    return w ? { ...w, state: f?.condition || 'cloudy', attributes: { ...w.attributes, temperature: f?.temperature ?? w.attributes.temperature } } : null;
  }

  // rookmelders en waterlek-sensoren uit alle kamers
  _safety() {
    const alarms = [], notes = [];
    let rooms = []; try { rooms = this._rooms(); } catch (e) { /* nog geen ruimtes */ }
    rooms.forEach((rm) => rm.sensors.filter((x) => x.kind === 'smoke' || x.kind === 'leak').forEach((x) => {
      if (x.alarm || x.warn) alarms.push({ ...x, room: rm.name, ri: rm.i });
      if (x.kind !== 'smoke') return;
      if (x.txt === 'Test bezig') notes.push({ id: x.id, key: 'test', t: 'Rookmelder test bezig', desc: `${rm.name} · de melder test zichzelf`, c: '#7cb6ff', ic: 'warn', svg: RIC.svg('smoke', 'on') });
      if (x.bat != null && x.bat <= 20) notes.push({ id: x.id, key: 'bat', t: 'Rookmelder', desc: `Batterij bijna leeg · nog ${Math.round(x.bat)}% · ${rm.name}`, c: '#ffb340', ic: 'warn', svg: RIC.svg('battery', 'on', x.bat) });
    }));
    return { alarms, notes };
  }
  _updAlarm(all) {
    const box = this.$('alrt'); if (!box) return;
    // wegvegen verbergt een alarm tot de sensor opnieuw verandert
    let hid = {}; try { hid = JSON.parse(localStorage.getItem('thuis-alarm') || '{}'); } catch (e) { /* geen opslag */ }
    const key = (x) => `${x.txt.split(' · ')[0]}|${this._state(x.id)?.last_changed || ''}`;
    const list = all.filter((x) => hid[x.id] !== key(x));
    const html = list.map((x) => `<div class="alr${x.alarm ? '' : ' warn'}" data-ri="${x.ri}" data-id="${x.id}" data-k="${key(x)}"><i>${SENS_ICON(x)}</i><div><b>${x.txt.split(' · ')[0]}</b><span>${x.room}${x.txt.includes(' · ') ? ` · ${x.txt.split(' · ')[1]}` : ''}</span></div><em>›</em></div>`).join('');
    box.hidden = !list.length;
    if (box.innerHTML === html) return;
    box.innerHTML = html;
    box.querySelectorAll('.alr').forEach((el) => {
      el.addEventListener('click', () => this._openSheet('room', +el.dataset.ri));
      this._swipe(el, () => { try { const h = JSON.parse(localStorage.getItem('thuis-alarm') || '{}'); h[el.dataset.id] = el.dataset.k; localStorage.setItem('thuis-alarm', JSON.stringify(h)); } catch (e) { /* geen opslag */ } this._updNotices(); });
    });
  }

  // laadsessie: laadpaal met kabel naar de auto, een lichtpuls over de kabel en een voortgangsbalk (accu)
  _updCharge() {
    const box = this.$('evc'); if (!box) return;
    const c = this._config, mode = String(this._state(c.car_charging)?.state || ''), soc = parseFloat(this._state(c.car_battery)?.state);
    const charging = mode === 'connected_charging' || (/charg|laden|laadt/i.test(mode) && !/discharg|finish|niet|disconn/i.test(mode));
    const zeroA = parseFloat(this._state(c.charger_current_a || 'number.laadpaal_max_stroom')?.state) === 0;
    const paused = (mode === 'connected_finished' && !(soc >= 99)) || (/^connected/.test(mode) && zeroA);
    const plugged = charging || paused || (/^connected/.test(mode) && mode !== 'connected_finished');
    if (!plugged || soc >= 100) { if (!box.hidden) { box.hidden = true; box._key = ''; } return; }
    const pst = this._state(c.charger_power); let w = parseFloat(pst?.state);
    if (!isNaN(w) && /kw/i.test(pst.attributes.unit_of_measurement || '')) w *= 1000;
    const kw = !isNaN(w) && w > 300 ? w / 1000 : null;
    const rem = !isNaN(soc) && kw ? Math.max(0, (100 - soc) / 100 * (c.battery_kwh || 82.5)) / (kw * (c.efficiency || 0.92)) : null;
    const dur = (h) => { const m = Math.round(h * 60); return m >= 60 ? `${Math.floor(m / 60)} u ${m % 60} min` : `${m} min`; };
    const pct = isNaN(soc) ? null : Math.round(soc);
    const live = charging && !paused && kw != null, starting = charging && !paused && kw == null;
    const sched = this._state(c.car_schedule)?.state === 'on', st0 = String(this._state(c.car_start)?.state || '').slice(0, 5);
    const ttl = live ? 'Laden' : starting ? 'Laden start' : paused ? 'Gepauzeerd' : 'Wacht op laden';
    const sub = live ? (rem != null ? `vol om ${fmtTime(Date.now() + rem * 3600000)}` : '') : starting || paused ? '' : sched && /^\d\d:\d\d$/.test(st0) ? `start om ${st0}` : '';
    // auto links, laadpaal rechts; de lichtpuls loopt van de paal naar de auto
    const cab = 'M163 44c0 24-26 26-38 16s-10-8-14-7';
    const pic = `<svg class="xi" viewBox="34 0 152 74"><g transform="translate(40 10) scale(.76)">${RIC.draw('car', live ? 'teal' : 'on').replace(/url\(#g-green\)/g, 'url(#g-teal)')}</g>
      <rect x="148" y="6" width="32" height="50" rx="10" fill="url(#g-white)"/><rect x="155.5" y="14" width="17" height="6.5" rx="3.2" fill="${live ? '#5ee1d0' : '#8a94a6'}"/><circle cx="163" cy="37" r="5.5" fill="url(#g-metal)"/><rect x="158" y="56" width="10" height="14" rx="3" fill="url(#g-metal)"/>
      <path d="${cab}" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="4" stroke-linecap="round"/>${live ? `<path class="evp" d="${cab}" fill="none" stroke="#5ee1d0" stroke-width="4.5" stroke-linecap="round" pathLength="100"/>` : ''}</svg>`;
    const html = `<div class="xr"><div class="xl"><div class="xtop"><div class="xbig">${pct != null ? `${pct}<small>%</small>` : '—'}</div><div class="xnx"><b>${ttl}</b>${sub ? `<span>${sub}</span>` : ''}</div></div><div class="xk">${live ? `${fmt(kw, 1)} kW${rem != null ? ` · nog ${dur(rem)}` : ''}` : starting ? 'wacht op vermogen…' : 'Aangesloten'}</div></div>${pic}</div><div class="bar"><i style="width:${pct ?? 0}%"></i></div>`;
    const cls = `was xchg ${live ? 'evon' : 'evwait'}`, key = cls + html;
    if (box._key === key) return;
    box._key = key; box.className = cls; box.hidden = false; box.innerHTML = html;
    this._applyHidden();
  }

  // accu en laadtijd actueel houden: bij openen van de app (en elke 5 min tijdens het laden) de auto laten verversen
  _carRefresh(open) {
    const c = this._config, S = this._hass?.states; if (!S || this._kmode || document.visibilityState !== 'visible') return;
    const b = S[c.car_refresh]; if (!b || b.state === 'unavailable' || !/^connected/.test(String(S[c.car_charging]?.state || ''))) return;
    const now = Date.now(), upd = Date.parse(S[c.car_updated]?.state) || 0;
    let last = 0; try { last = +localStorage.getItem('thuis-auto-ververst') || 0; } catch (e) { /* geen opslag */ }
    const wait = open ? 2 * 60000 : 5 * 60000;
    if (now - Math.max(upd, last) < wait) return;
    try { localStorage.setItem('thuis-auto-ververst', String(now)); } catch (e) { /* geen opslag */ }
    Promise.resolve(this._hass.callService('button', 'press', { entity_id: c.car_refresh }, undefined, false)).catch(() => {});
  }

  /* ---------- wasmachine ---------- */
  _updWasher() {
    const base = this._config.washer, st = this._state(base), box = this.$('was');
    if (!st) { box.hidden = true; return; }
    const v = (k) => this._state(`${base}_${k}`)?.state, num = (k) => { const x = parseFloat(v(k)); return isNaN(x) ? null : x; };
    const door = this._state(base.replace(/^sensor\./, 'binary_sensor.') + '_deur')?.state;
    const status = st.state, phase = v('programmafase'), prog = v('programma');
    const left = num('resterende_tijd'), done = num('verstreken_tijd');
    const at = (k) => { const t = Date.parse(v(k)); return isNaN(t) ? null : fmtTime(t); };
    const end = at('eindtijd') || (left != null ? fmtTime(Date.now() + left * 60000) : null);
    const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}` : `${Math.round(m)} min`);
    const progName = WPROG[prog] || (prog && !['no_program', 'unknown', 'unavailable'].includes(prog) ? prog.replace(/_/g, ' ') : '');
    const temp = num('temperatuur'), sub = [progName, temp ? `${fmt(temp)}°` : ''].filter(Boolean).join(' · ');
    const ic = '<svg viewBox="0 0 100 100"><use href="#gWash"/></svg>';
    let cls, html;
    if (['in_use', 'pause', 'rinse_hold'].includes(status)) {
      const pct = left != null && done != null && left + done > 0 ? done / (left + done) * 100 : 0;
      const ph = status === 'pause' ? 'Gepauzeerd' : WPHASE[phase] || 'Bezig';
      cls = 'run';
      html = `<div class="r">${washSvg(status === 'pause' ? 0 : phase === 'spin' ? 2 : 1)}<div class="t"><b>Wasmachine</b><span class="tm" style="color:#fff">${left != null ? dur(left) : '—'}</span></div>
        <div class="rt"><b>${ph}</b>${sub ? `${sub}<br>` : ''}${end ? `klaar ${end}` : ''}</div></div><div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>`;
    } else if (['programmed', 'waiting_to_start'].includes(status)) {
      cls = 'run';
      html = `<div class="r">${ic}<div class="t"><b>Wasmachine</b><span>${sub || 'programma gekozen'}</span></div><div class="rt"><b>Start ${at('starttijd') || (num('start_in') == null ? 'later' : num('start_in') * 60 >= 1 ? `over ${dur(num('start_in') * 60)}` : 'zo')}</b>${end ? `klaar ${end}` : ''}</div></div>`;
    } else if (status === 'program_ended') {
      cls = 'done';
      html = `<div class="r">${ic}<div class="t"><b>Was is klaar</b><span>${door === 'off' ? 'deur nog dicht — de was zit er nog in' : sub}</span></div><div class="rt"><b>Klaar</b>${end || ''}</div></div><div class="bar"><i style="width:100%"></i></div>`;
    } else if (['failure', 'program_interrupted', 'service'].includes(status) || this._state(base.replace(/^sensor\./, 'binary_sensor.') + '_probleem')?.state === 'on') {
      cls = 'bad';
      html = `<div class="r">${ic}<div class="t"><b>Wasmachine</b><span>${status === 'program_interrupted' ? 'programma onderbroken' : 'controleer de machine'}</span></div><div class="rt"><b>Storing</b></div></div>`;
    } else {
      cls = status === 'on' ? 'ready' : 'idle';
      if (status === 'on') html = `<div class="r">${ic}<div class="t"><b>Wasmachine</b><span class="tm" style="color:#fff">${progName || '—'}</span></div><div class="rt"><b>Aan</b>${progName ? 'klaar om te starten' : 'geen programma gekozen'}</div></div>`;
      else html = `<div class="r">${ic}<div class="t"><b>Wasmachine</b></div><div class="rt">${status === 'not_connected' ? 'niet verbonden' : status === 'off' ? 'uit' : 'klaar voor gebruik'}</div></div>`;
    }
    const key = cls + html;
    if (key === this._wasKey) return;
    this._wasKey = key;
    box.hidden = cls === 'idle'; // uit of klaar voor gebruik: niet tonen
    box.className = `was ${cls}`;
    box.innerHTML = html;
  }

  /* ---------- afval ---------- */
  // afvalsensoren: uit de instellingen, anders automatisch die van Afvalbeheer (attribuut Wastecollector)
  _wasteList() {
    if (this._config.waste.length) return this._config.waste;
    const kind = (t) => /gft|groen/.test(t) ? 'gft' : /pmd|plastic|pbd/.test(t) ? 'pmd' : /papier|karton/.test(t) ? 'papier' : /rest/.test(t) ? 'rest' : null;
    const names = { gft: 'GFT', pmd: 'PMD', papier: 'Papier', rest: 'Rest' };
    return Object.values(this._hass?.states || {})
      .filter((st) => st.entity_id.startsWith('sensor.') && (st.attributes.Wastecollector || st.attributes.wastecollector))
      .map((st) => ({ st, type: kind(st.entity_id + ' ' + this._nm(st).toLowerCase()) }))
      .filter((x) => x.type)
      .map((x) => ({ name: names[x.type], type: x.type, entity: x.st.entity_id }));
  }
  // afvalvenster: ophaaldagen van de komende twee weken (uit de afvalkalender als die er is, anders de eerstvolgende per bak)
  async _wasteSheet() {
    const box = this.$('wsB'); if (!box) return;
    const S = this._hass.states, day0 = startOfDay(Date.now()), min = this._binMin ?? 0;
    const kind = (t) => /gft|groen/i.test(t) ? 'gft' : /pmd|plastic|pbd/i.test(t) ? 'pmd' : /papier|karton/i.test(t) ? 'papier' : /rest/i.test(t) ? 'rest' : null;
    const names = { gft: 'GFT', pmd: 'PMD', papier: 'Papier', rest: 'Restafval' };
    let list = [];
    const cal = Object.keys(S).find((k) => k.startsWith('calendar.') && /afval|cyclus|waste|ophaal/.test(k) && S[k].state !== 'unavailable');
    if (cal) {
      const ev = await this._hass.callApi('GET', `calendars/${cal}?start=${encodeURIComponent(new Date(day0).toISOString())}&end=${encodeURIComponent(new Date(day0 + 15 * DAY).toISOString())}`).catch(() => []);
      list = (Array.isArray(ev) ? ev : []).map((e) => { const tp = kind(e.summary || ''); const t = Date.parse(e.start?.date || e.start?.dateTime || e.start); return tp && !isNaN(t) ? { type: tp, t: startOfDay(t) } : null; }).filter(Boolean);
    }
    if (!list.length) list = (this._binItems || []).filter((i) => i.days != null).map((i) => ({ type: i.type, t: startOfDay(i.t), entity: i.entity }));
    const ent = Object.fromEntries((this._binItems || []).map((i) => [i.type, i.entity]));
    list = list.map((x) => ({ ...x, days: Math.round((x.t - day0) / DAY) }));
    // vandaag (na 15:00) al opgehaald: de volgende datum komt pas na middernacht van Afvalbeheer
    const done = list.filter((x) => x.days === 0 && min === 1 && !list.some((y) => y.type === x.type && y.days > 0));
    list = list.filter((x) => x.days >= min).sort((a, b) => a.t - b.t);
    const soon = list.filter((x) => x.days <= 14), later = list.filter((x) => x.days > 14 && !soon.some((y) => y.type === x.type));
    // elke bak altijd tonen: zonder (nieuwe) datum onderaan, gedempt
    (this._binItems || []).forEach((i) => { if (![...soon, ...later, ...done].some((y) => y.type === i.type)) done.push({ type: i.type, entity: i.entity, unknown: true }); });
    const lbl = (d) => d === 0 ? 'vandaag' : d === 1 ? 'morgen' : `over ${d} d`;
    const dd = (x, long) => long ? new Date(x.t).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) : x.days === 0 ? 'Vandaag' : x.days === 1 ? `Morgen · ${new Date(x.t).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')}` : new Date(x.t).toLocaleDateString('nl-NL', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
    const row = (x, i) => { const m = BINS[x.type] || BINS.rest; return `<div class="wsr${i === 0 ? ' first' : ''}" style="--c:${m[1]}" data-e="${x.entity || ent[x.type] || ''}"><svg viewBox="0 0 100 100"><use href="#${m[0]}"/></svg><div><b>${names[x.type]}</b><span>${dd(x, i === 0)}</span></div><em>${lbl(x.days)}</em></div>`; };
    box.innerHTML = (soon.length ? soon.map(row).join('') : '<div class="hnone">Geen ophaaldagen in de komende twee weken</div>')
      + (later.length ? `<div class="hday">Later</div>${later.map((x) => row(x, 1)).join('')}` : '')
      + (done.length ? `<div class="hday">${done.every((x) => x.unknown) ? 'Zonder datum' : 'Vandaag opgehaald'}</div>${done.map((x) => { const m = BINS[x.type] || BINS.rest; return `<div class="wsr wdone" style="--c:${m[1]}" data-e="${x.entity || ent[x.type] || ''}"><svg viewBox="0 0 100 100"><use href="#${m[0]}"/></svg><div><b>${names[x.type]}</b><span>${x.unknown ? 'nog geen datum bekend' : 'volgende datum volgt morgen'}</span></div><em>${x.unknown ? '–' : '✓'}</em></div>`; }).join('')}` : '');
    box.querySelectorAll('.wsr[data-e]').forEach((el) => el.addEventListener('click', () => el.dataset.e && this._moreInfo(el.dataset.e)));
  }

  _updWaste() {
    const list = this._wasteList();
    const box = this.$('bins');
    if (!list.length) {
      if (this._binKey !== 'leeg') { this._binKey = 'leeg'; this.$('mAf').innerHTML = `<div class="mlab"><i class="ric">${RIC.svg('recycle', 'on')}</i> Afval</div><span>Geen afvalsensoren</span>`; box.innerHTML = '<div class="wempty">Geen afvalsensoren gevonden. Ze worden automatisch herkend bij Afvalbeheer; anders zet je ze in de kaartinstellingen bij <b>waste</b>.</div>'; }
      return;
    }
    const day0 = startOfDay(Date.now());
    const items = list.map((b) => {
      const st = this._state(b.entity), raw = st?.state;
      const at = st?.attributes || {};
      // Afvalbeheer: Sort_date 20261105 / Days_until; Waste Collection Schedule: days; anders een datum als status
      const sd = String(at.Sort_date ?? at.sort_date ?? '');
      let t = /^\d{8}$/.test(sd) ? new Date(+sd.slice(0, 4), +sd.slice(4, 6) - 1, +sd.slice(6, 8)).getTime() : NaN;
      const du = at.Days_until ?? at.days_until ?? at.days;
      if (isNaN(t) && du != null && !isNaN(+du)) t = day0 + du * DAY;
      if (isNaN(t)) t = Date.parse(raw);
      const days = isNaN(t) ? null : Math.round((startOfDay(t) - day0) / DAY);
      return { ...b, t, days, meta: BINS[b.type] || BINS.rest };
    }).sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
    // na 15:00 is de bak van vandaag geleegd: dan de bak van morgen (of later) tonen
    const late = new Date().getHours() >= 15, min = late ? 1 : 0;
    const next = items.find((i) => i.days != null && i.days >= min);
    this._binItems = items; this._binMin = min;
    const key = JSON.stringify([late, items.map((i) => [i.name, i.days])]);
    if (key === this._binKey) return;
    this._binKey = key;
    box.className = 'bins';
    box.style.setProperty('--n', items.length);
    box.innerHTML = items.map((i) => {
      const isNext = i === next && i.days <= 1; // alleen oplichten bij vandaag of morgen
      const tag = i.days === 0 ? 'VANDAAG' : i.days === 1 ? 'MORGEN' : '';
      const d = i.days == null ? '—' : new Date(i.t).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
      return `<div class="bin${isNext ? ' next' : ''}" data-e="${i.entity}" style="--bc:${i.meta[1]}">${isNext && tag ? `<span class="tag">${tag}</span>` : ''}
        <svg viewBox="0 0 100 100"><use href="#${i.meta[0]}"/></svg><div class="n">${i.name}</div><div class="d">${d}</div></div>`;
    }).join('');
    box.querySelectorAll('[data-e]').forEach((el) => el.addEventListener('click', () => this._moreInfo(el.dataset.e)));
    // telefoon: eerstvolgende bak groot met icoon, daaronder de volgende twee
    const fd = (i) => (i.days === 0 ? 'Vandaag' : i.days === 1 ? 'Morgen' : new Date(i.t).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''));
    const rest = items.filter((i) => i !== next && i.days != null && i.days >= min).slice(0, 2);
    const mf = this.$('mAf');
    mf.style.setProperty('--bc', next ? next.meta[1] : 'var(--muted)');
    // geen bak vandaag of morgen: rustige stand, de bak verschijnt pas de dag ervoor (MORGEN)
    const quiet = next && next.days >= 2;
    const until = quiet ? (next.days === 2 ? 'vandaag en morgen' : `tot en met ${new Date(next.t - DAY).toLocaleDateString('nl-NL', { weekday: 'long' })}`) : '';
    if (quiet) { mf.classList.add('quiet'); mf.style.setProperty('--bc', 'var(--muted)');
      mf.innerHTML = `<div class="mlab"><i class="ric">${RIC.svg('recycle', 'on')}</i> Afval</div><svg class="mbin" viewBox="0 0 100 100"><use href="#binRst"/></svg><b>Geen afval</b><span class="mq">${until}</span><em class="mchip">${next.name} · ${fd(next)}</em>`;
      mf.onclick = () => this._openSheet('waste'); return; }
    mf.classList.remove('quiet');
    mf.innerHTML = next ? `<div class="mlab"><i class="ric">${RIC.svg('recycle', 'on')}</i> Afval</div><svg class="mbin" viewBox="0 0 100 100"><use href="#${next.meta[0]}"/></svg><b>${next.name}</b>${next.days === 0 || next.days === 1 ? `<em class="mtag d${next.days}"><i class="dot"></i>${fd(next)}</em>` : `<em>${fd(next)}</em>`}${rest.map((i) => `<span>${i.name} · ${fd(i)}</span>`).join('')}` : `<div class="mlab"><i class="ric">${RIC.svg('recycle', 'on')}</i> Afval</div><span>Geen ophaaldata</span>`;
    mf.onclick = () => next && this._openSheet('waste');
  }

  /* ---------- Picnic-bezorging (alleen telefoon, alleen op de dag zelf) ---------- */
  // tijden uit de Picnic-integratie (verwachte aankomst, anders het tijdslot); zonder integratie uit de agenda
  _picnicIds() {
    if (this._picIds) return this._picIds;
    const ents = this._hass?.entities || {}, ids = {};
    const want = { eta_s: 'next_delivery_eta_start', eta_e: 'next_delivery_eta_end', slot_s: 'next_delivery_slot_start', slot_e: 'next_delivery_slot_end' };
    for (const [k, tk] of Object.entries(want)) {
      const hit = Object.values(ents).find((e) => e.platform === 'picnic' && e.translation_key === tk);
      ids[k] = (this._config.picnic || {})[k] || hit?.entity_id || null;
    }
    if (Object.values(ents).some((e) => e.platform === 'picnic')) this._picIds = ids;
    return ids;
  }
  _updPicnic() {
    const box = this.$('pic');
    if (!box || !this._hass) return;
    const now = Date.now(), day0 = startOfDay(now), ids = this._picnicIds();
    const ts = (id) => { const t = Date.parse(this._state(id)?.state); return isNaN(t) ? null : t; };
    let s = ts(ids.eta_s), e = ts(ids.eta_e), eta = s != null && e != null;
    if (!eta) { s = ts(ids.slot_s); e = ts(ids.slot_e); }
    if ((s == null || e == null) && this._events) {
      const ev = this._events.filter((x) => /picnic/i.test(x.summary || '') && x.start?.dateTime).map((x) => ({ s: Date.parse(x.start.dateTime), e: Date.parse(x.end.dateTime) }))
        .filter((x) => x.e > now && startOfDay(x.s) === day0).sort((a, b) => a.s - b.s)[0];
      if (ev) ({ s, e } = ev);
    }
    const show = s != null && e != null && startOfDay(s) === day0 && now < e;
    let html = '';
    if (show) {
      const icon = ([].concat(this._config.agenda_icons || []).find((x) => [].concat(x.match).some((w) => /picnic/i.test(w))) || {}).image || '/local/picnic.png';
      const mins = (m) => (m >= 90 ? `${Math.round(m / 60)} uur` : `${Math.max(1, Math.round(m))} min`);
      const busy = now >= s, pct = busy ? Math.min(100, Math.round((now - s) / (e - s) * 100)) : null;
      html = `<div class="r"><img class="pici" src="${icon}" alt=""><div class="t"><b>Picnic komt bezorgen</b><span class="tm" style="color:#fff">${fmtTime(s)} – ${fmtTime(e)}</span></div>`
        + `<div class="rt"><b>${busy ? 'Onderweg' : eta ? 'Verwacht' : 'Vandaag'}</b>${busy ? `nog ${mins((e - now) / 60000)}` : `over ${mins((s - now) / 60000)}`}</div></div>`
        + (busy ? `<div class="bar"><i style="width:${pct}%"></i></div>` : '');
    }
    box.hidden = !show;
    box.dataset.sig = show ? String(s) : '';
    if (box.innerHTML !== html) box.innerHTML = html;
    this._applyHidden();
    box.onclick = () => ids.eta_s && this._moreInfo(eta ? ids.eta_s : ids.slot_s);
  }

  /* ---------- verbergen door te vegen (telefoon) ---------- */
  // een verborgen blok komt terug zodra de toestand verandert (bijv. van draaien naar klaar, of een nieuwe bezorging)
  _sig(el) { return el.id === 'pic' ? el.dataset.sig || '' : el.className.replace(/\b(gone|swiping)\b/g, '').trim(); }
  _hidden() {
    try {
      // eenmalig: oude verborgen blokken van vóór versie 120 vergeten (die bleven ten onrechte verborgen)
      if (localStorage.getItem('thuis-verborgen-v') !== '2') { localStorage.removeItem('thuis-verborgen'); localStorage.setItem('thuis-verborgen-v', '2'); }
      return JSON.parse(localStorage.getItem('thuis-verborgen') || '{}');
    } catch (e) { return {}; }
  }
  _hide(id) {
    const h = this._hidden(); h[id] = this._sig(this.$(id));
    try { localStorage.setItem('thuis-verborgen', JSON.stringify(h)); } catch (e) { /* geen opslag */ }
    this._applyHidden();
  }
  _applyHidden() {
    const h = this._hidden(); let dirty = false;
    ['pic', 'evc', 'was', 'dish', 'oven'].forEach((id) => {
      const el = this.$(id); if (!el) return;
      // toestand veranderd (of apparaat uit): het verbergen vergeten, zodat het blok bij de volgende keer weer verschijnt
      if (h[id] != null && (h[id] !== this._sig(el) || el.hidden)) { delete h[id]; dirty = true; }
      el.classList.toggle('gone', h[id] != null);
    });
    if (dirty) try { localStorage.setItem('thuis-verborgen', JSON.stringify(h)); } catch (e) { /* geen opslag */ }
  }
  _swipe(el, onGone) {
    if (!el || el._swOn) return;
    el._swOn = true;
    const OPEN = 96;
    let x0 = 0, y0 = 0, dx = 0, mode = null, open = false, act = null, block = false;
    const host = () => el.parentNode;
    const mkAct = () => {
      if (act) return act;
      const p = host(); if (getComputedStyle(p).position === 'static') p.style.position = 'relative';
      act = document.createElement('div'); act.className = 'swact';
      act.innerHTML = '<button><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>Verberg</button>';
      Object.assign(act.style, { top: el.offsetTop + 'px', left: el.offsetLeft + 'px', width: el.offsetWidth + 'px', height: el.offsetHeight + 'px', borderRadius: getComputedStyle(el).borderRadius });
      act.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); gone(); });
      el.before(act); el.classList.add('swiping');
      return act;
    };
    const setX = (x, anim) => { el.style.transition = anim ? 'transform .25s cubic-bezier(.3,.7,.2,1)' : 'none'; el.style.transform = x ? `translateX(${x}px)` : ''; };
    const close = () => { open = false; setX(0, true); setTimeout(() => { if (!open && act) { act.remove(); act = null; el.classList.remove('swiping'); } }, 260); };
    const gone = () => {
      setX(-el.offsetWidth - 20, true);
      setTimeout(() => { act?.remove(); act = null; el.classList.remove('swiping'); setX(0); open = false; onGone(); }, 230);
    };
    el.addEventListener('touchstart', (e) => {
      if (!this._mq?.matches) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; mode = null; dx = open ? -OPEN : 0;
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (!this._mq?.matches || mode === 'v') return;
      const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
      if (!mode) { if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my)) mode = 'h'; else if (Math.abs(my) > 10) { mode = 'v'; return; } else return; }
      e.preventDefault();
      dx = Math.min(0, mx + (open ? -OPEN : 0));
      mkAct().classList.toggle('full', -dx > el.offsetWidth * 0.55);
      setX(dx);
    }, { passive: false });
    el.addEventListener('touchend', () => {
      if (mode !== 'h') { if (open && mode === null) { block = true; close(); } return; }
      block = true; setTimeout(() => { block = false; }, 350);
      if (-dx > el.offsetWidth * 0.55) gone();
      else if (-dx > 48) { open = true; setX(-OPEN, true); act?.classList.remove('full'); }
      else close();
    });
    el.addEventListener('click', (e) => { if (block) { block = false; e.stopPropagation(); e.preventDefault(); } }, true);
  }

  _coverToggle(id) {
    const st = this._state(id); if (!st) return;
    const pos = st.attributes.current_position ?? (st.state === 'closed' ? 0 : 100), moving = ['opening', 'closing'].includes(st.state);
    this._hass.callService('cover', moving ? 'stop_cover' : pos > 1 ? 'close_cover' : 'open_cover', { entity_id: id });
  }

  /* ---------- panelen (telefoon): thermostaat, weer en rolluik ---------- */
  _openSheet(kind, id) {
    if (!this._mq?.matches) return;
    this._sheet = kind; this._shKey = null; this._cvId = id; this._thArc = null;
    const sh = this.$('sheet'), body = this.$('shBody');
    sh.classList.toggle('full', ['cv', 'lt', 'th', 'room', 'rh', 'ppl', 'waste'].includes(kind)); sh.classList.toggle('lamp', kind === 'lt'); sh.classList.toggle('therm', kind === 'th');
    const HB = '<button class="cvhb" id="cvHb" aria-label="Geschiedenis"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg></button>';
    if (kind === 'lt') {
      this._cvHist = false;
      const a = this._state(id)?.attributes || {}, modes = a.supported_color_modes || [];
      const ct = modes.some((m) => ['color_temp', 'hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(m)), col = modes.some((m) => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(m));
      const K = [[2200, '#ffb04a'], [2700, '#ffd28a'], [4000, '#fff1d6'], [6000, '#e8f1ff']];
      body.innerHTML = `${HB}<button class="shx cvx" aria-label="Sluiten">✕</button><div class="cvh"><b id="cvN"></b><span id="cvS"></span></div>
        <div class="cvsl lsl" id="cvSl"><div class="lsf" id="cvF"></div><span class="cvi lsi">${MBULB}</span></div>
        ${ct ? `<div class="lcols" id="lCols">${K.map(([k, c]) => `<button data-k="${k}" style="--c:${c}" aria-label="${k} K"></button>`).join('')}${col ? '<button class="more" data-more="1" aria-label="Kleur"></button>' : ''}</div>` : ''}
        <div class="lpw"><button id="lPw"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/></svg><span id="lPwT">Uit</span></button></div>`;
      body.querySelectorAll('#lCols button').forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.more) { this._moreInfo(this._cvId); return; }
        this._hass.callService('light', 'turn_on', { entity_id: this._cvId, color_temp_kelvin: +b.dataset.k });
      }));
      this.$('lPw').addEventListener('click', () => this._hass.callService('light', 'toggle', { entity_id: this._cvId }));
      this.$('cvHb').addEventListener('click', () => this._cvHistory());
      const sl = this.$('cvSl');
      sl.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false }); // paneel en pagina niet laten meeschuiven
      let y0 = null, moved = false;
      const at = (e) => { const r = sl.getBoundingClientRect(); return clamp(Math.round((r.bottom - e.clientY) / r.height * 100), 0, 100); };
      sl.addEventListener('pointerdown', (e) => { y0 = e.clientY; moved = false; sl.setPointerCapture(e.pointerId); });
      sl.addEventListener('pointermove', (e) => { if (y0 == null) return; if (Math.abs(e.clientY - y0) > 6) moved = true; if (moved) { this._cvDrag = at(e); this._updSheet(); } });
      sl.addEventListener('pointerup', (e) => {
        if (y0 == null) return; y0 = null;
        if (!moved) { this._cvDrag = null; this._hass.callService('light', 'toggle', { entity_id: this._cvId }); return; }
        const v = at(e); this._cvDrag = v; this._cvHold = Date.now();
        this._hass.callService('light', v < 1 ? 'turn_off' : 'turn_on', v < 1 ? { entity_id: this._cvId } : { entity_id: this._cvId, brightness_pct: Math.max(1, v) });
        setTimeout(() => { if (Date.now() - this._cvHold >= 2900) { this._cvDrag = null; this._updSheet(); } }, 3000);
      });
      sl.addEventListener('pointercancel', () => { y0 = null; this._cvDrag = null; this._updSheet(); });
    } else if (kind === 'cv') {
      const up = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14.5l6-6 6 6"/></svg>';
      const dn = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5l6 6 6-6"/></svg>';
      const sp = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="4.5" y="4.5" width="15" height="15" rx="3.2"/></svg>';
      this._cvHist = false;
      body.innerHTML = `${HB}<button class="shx cvx" aria-label="Sluiten">✕</button><div class="cvh"><b id="cvN"></b><span id="cvS"></span></div>
        <div class="cvsl" id="cvSl"><div class="cvf" id="cvF"></div><span class="cvi" id="cvI"></span></div>
        <div class="cvb"><button data-a="open_cover">${up}<span>Open</span></button><button data-a="stop_cover">${sp}<span>Stop</span></button><button data-a="close_cover">${dn}<span>Dicht</span></button></div>`;
      body.querySelectorAll('.cvb button').forEach((b) => b.addEventListener('click', () => this._hass.callService('cover', b.dataset.a, { entity_id: this._cvId })));
      this.$('cvHb').addEventListener('click', () => this._cvHistory());
      // schuifregelaar: slepen = stand kiezen (bij loslaten naar die stand), korte tik = open/dicht/stop
      const sl = this.$('cvSl');
      sl.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false }); // paneel en pagina niet laten meeschuiven
      let y0 = null, moved = false;
      const at = (e) => { const r = sl.getBoundingClientRect(); return clamp(Math.round((e.clientY - r.top) / r.height * 20) * 5, 0, 100); };
      sl.addEventListener('pointerdown', (e) => { y0 = e.clientY; moved = false; sl.setPointerCapture(e.pointerId); });
      sl.addEventListener('pointermove', (e) => { if (y0 == null) return; if (Math.abs(e.clientY - y0) > 6) moved = true; if (moved) { this._cvDrag = at(e); this._updSheet(); } });
      const end = (e) => {
        if (y0 == null) return; y0 = null;
        if (!moved) { this._cvDrag = null; this._coverToggle(this._cvId); return; }
        const d = at(e); this._cvDrag = d; this._cvHold = Date.now();
        this._hass.callService('cover', 'set_cover_position', { entity_id: this._cvId, position: 100 - d });
        setTimeout(() => { if (Date.now() - this._cvHold >= 2900) { this._cvDrag = null; this._updSheet(); } }, 3000);
      };
      sl.addEventListener('pointerup', end); sl.addEventListener('pointercancel', () => { y0 = null; this._cvDrag = null; this._updSheet(); });
    } else if (kind === 'th') {
      this._cvHist = false;
      const MI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h14"/></svg>';
      const PL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
      const PW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3.5v8"/><path d="M7.2 6.6a7 7 0 1 0 9.6 0"/></svg>';
      body.innerHTML = `${HB}<button class="shx cvx" aria-label="Sluiten">✕</button><div class="cvh"><b>Thermostaat</b><span id="thS"></span></div>
        <div class="thd" id="thD"><svg id="thArc" viewBox="0 0 290 262"></svg><div class="thc"><div class="thn" id="thN"></div><div class="thl" id="thL"></div><div class="tht" id="thT"></div></div></div>
        <div class="cvb thb"><button id="thMin" aria-label="Lager">${MI}</button><button class="tpow" id="thPow" aria-label="Aan/uit">${PW}</button><button id="thPlus" aria-label="Hoger">${PL}</button></div>
        <div class="thsel" id="thSel"><button class="thp" id="thP"></button><div class="thm" id="thM"></div></div>`;
      this.$('thMin').addEventListener('click', () => this._tStep(-1));
      this.$('thPlus').addEventListener('click', () => this._tStep(1));
      this.$('thPow').addEventListener('click', () => {
        const { cl, a } = this._tGeo(); if (!cl) return;
        const modes = (a.hvac_modes || []).filter((m) => m !== 'off'), on = modes.includes('heat') ? 'heat' : modes[0];
        if (cl.state === 'off') { if (on) this._hass.callService('climate', 'set_hvac_mode', { entity_id: cl.entity_id, hvac_mode: on }); else this._hass.callService('climate', 'turn_on', { entity_id: cl.entity_id }); }
        else this._hass.callService('climate', 'set_hvac_mode', { entity_id: cl.entity_id, hvac_mode: 'off' });
      });
      this.$('thP').addEventListener('click', (e) => { e.stopPropagation(); this.$('thSel').classList.toggle('open'); });
      body.addEventListener('click', (e) => { if (!e.target.closest('#thSel')) this.$('thSel')?.classList.remove('open'); });
      this.$('cvHb').addEventListener('click', () => this._thHistory());
      // boog: slepen = temperatuur kiezen, bij loslaten instellen
      const arc = this.$('thArc'), A0 = 135, A1 = 405;
      const val = (e) => {
        const { min, max, step } = this._tGeo(), r = arc.getBoundingClientRect();
        let deg = Math.atan2((e.clientY - r.top) / r.height * 262 - 140, (e.clientX - r.left) / r.width * 290 - 145) * 180 / Math.PI;
        if (deg < 90) deg += 360;
        deg = clamp(deg, A0, A1);
        return clamp(Math.round((min + (deg - A0) / (A1 - A0) * (max - min)) / step) * step, min, max);
      };
      arc.addEventListener('pointerdown', (e) => { e.preventDefault(); arc.setPointerCapture(e.pointerId); clearTimeout(this._tTimer); this._tTimer = null; this._tDragging = true; this._tTarget = val(e); this._updThermo(); });
      arc.addEventListener('pointermove', (e) => { if (!this._tDragging) return; const v = val(e); if (v !== this._tTarget) { this._tTarget = v; this._updThermo(); } });
      const up = () => { if (!this._tDragging) return; this._tDragging = false; this._tSend(); };
      arc.addEventListener('pointerup', up); arc.addEventListener('pointercancel', up);
      arc.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    } else if (kind === 'waste') {
      this._cvHist = false;
      body.innerHTML = `<button class="shx cvx" aria-label="Sluiten">✕</button><div class="cvh"><b>Afval</b><span>Komende twee weken</span></div><div id="wsB"><div class="hnone">Laden…</div></div>`;
      setTimeout(() => this._wasteSheet(), 0);
    } else if (kind === 'ppl') {
      this._cvHist = false; this._pplMapEl = null;
      body.innerHTML = `<button class="shx cvx" aria-label="Sluiten">✕</button><div class="cvh"><b>Aanwezigheid</b><span id="pplS"></span></div>
        <div class="pmap" id="pplMap"><div class="hnone">Kaart laden…</div></div><div class="pwho" id="pplWho"></div><div id="pplTl"><div class="hnone">Laden…</div></div>`;
      const pm = this.$('pplMap'); pm.addEventListener('touchmove', (e) => { e.stopPropagation(); if (e.cancelable && e.touches.length === 1 && !e.target.closest?.('ha-map, .leaflet-container, canvas')) e.preventDefault(); }, { passive: false });
      setTimeout(() => { this._pplMap(); this._pplLog(); }, 0);
    } else if (kind === 'room') {
      this._cvHist = false; this._roomBack = null; this._roomIdx = id; this._rmKey = null;
      body.innerHTML = `${HB}<button class="shx cvx" aria-label="Sluiten">✕</button><div class="cvh"><b id="rmN"></b><span id="rmS"></span></div><div id="rmB"></div>`;
      this.$('cvHb').addEventListener('click', () => this._roomHistory(id));
    } else {
      body.innerHTML = '<div id="shWx"></div>';
    }
    body.querySelector('.shx')?.addEventListener('click', () => this._closeSheet());
    sh.style.transform = ''; sh.scrollTop = 0;
    sh.hidden = false; this.$('shV').hidden = false;
    this._updSheet();
  }
  /* geschiedenis van een rolluik: grafiek van 24 uur en een tijdlijn per dag (uit history en logbook van HA) */
  async _cvHistory() {
    const id = this._cvId, body = this.$('shBody'), lamp = id.startsWith('light.'), name = (this._nm(id) || id).replace(/^Rolluik /, '').replace(/^Hue /, '');
    this._cvHist = true;
    body.innerHTML = `<div class="hh"><button id="hBack"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>${name}</button></div>
      <div class="hti"><b>Geschiedenis</b><span>${lamp ? 'Lamp' : 'Rolluik'} ${name}</span></div><div id="hBody"><div class="hnone">Laden…</div></div>`;
    this.$('hBack').addEventListener('click', () => this._openSheet(lamp ? 'lt' : 'cv', id));
    const now = Date.now(), from = new Date(now - 7 * DAY).toISOString();
    const [hist, log] = await Promise.all([
      this._hass.callApi('GET', `history/period/${from}?filter_entity_id=${id}&end_time=${encodeURIComponent(new Date(now).toISOString())}`).catch(() => []),
      this._hass.callApi('GET', `logbook/${from}?entity=${id}&end_time=${encodeURIComponent(new Date(now).toISOString())}`).catch(() => []),
    ]);
    if (!['cv', 'lt'].includes(this._sheet) || !this._cvHist || this._cvId !== id) return;
    // standen (ook alleen-attribuutwijzigingen tellen: de positie zit in een attribuut)
    const ev = [];
    for (const x of (Array.isArray(hist) && Array.isArray(hist[0]) ? hist[0] : [])) {
      if (['opening', 'closing', 'unavailable', 'unknown'].includes(x.state)) continue;
      // lamp: pos = helderheid (0 = uit); rolluik: pos = % open
      const pos = lamp ? (x.state === 'on' ? Math.max(1, Math.round((x.attributes?.brightness ?? 255) / 2.55)) : 0) : x.attributes?.current_position ?? (x.state === 'closed' ? 0 : 100), t = Date.parse(x.last_updated || x.last_changed);
      if (ev.length && ev[ev.length - 1].pos === pos) continue;
      ev.push({ t, pos });
    }
    // wie of wat: het logboekbericht vlak voor de wijziging
    const L = (Array.isArray(log) ? log : []).map((l) => ({ ...l, t: Date.parse(l.when) })).sort((a, b) => a.t - b.t);
    // bij een rolluik komt de eindstand (bv. 60% dicht) vaak van het apparaat zelf, zonder bron; neem dan de bron van de beweging ervoor ("gaat dicht" via de app)
    const hasSrc = (x) => x.context_user_id || x.context_entity_id || x.context_event_type === 'call_service' || x.context_domain === 'homekit' || x.context_event_type === 'homekit_state_change';
    const who = (t) => { const w = [...L].reverse().filter((x) => x.t <= t + 3000 && x.t >= t - 5 * 60000); return this._who(w.find(hasSrc) || w[0]); };
    // grafiek afgelopen 24 uur
    const t0 = now - DAY, W = 340, H = 80, X = (t) => (Math.max(t, t0) - t0) / DAY * W, Y = (p) => (H - 2) - (lamp ? p : 100 - p) / 100 * (H - 8);
    let p0 = lamp ? 0 : 100; for (const e of ev) if (e.t <= t0) p0 = e.pos;
    let d = `M0 ${Y(p0).toFixed(1)}`;
    for (const e of ev.filter((e) => e.t > t0)) d += ` L${X(e.t).toFixed(1)} ${Y(p0).toFixed(1)} L${X(e.t).toFixed(1)} ${Y(e.pos).toFixed(1)}`, p0 = e.pos;
    d += ` L${W} ${Y(p0).toFixed(1)}`;
    const ax = [0, 6, 12, 18].map((h) => fmtTime(t0 + h * HOUR)).concat('nu');
    const chart = `<div class="shcard"><div class="shlab">Afgelopen 24 uur <span>${lamp ? 'helderheid' : 'hoe ver dicht'}</span></div><svg class="hg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="hgf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lamp ? '#ffb02e' : '#5aa2ff'}" stop-opacity=".55"/><stop offset="1" stop-color="${lamp ? '#ffb02e' : '#5aa2ff'}" stop-opacity=".05"/></linearGradient></defs><path d="${d} L${W} ${H} L0 ${H}Z" fill="url(#hgf)"/><path d="${d}" fill="none" stroke="${lamp ? '#ffd27a' : '#8fc6ff'}" stroke-width="2"/></svg><div class="hax">${ax.map((a) => `<span>${a}</span>`).join('')}</div></div>`;
    // tijdlijn per dag, nieuwste eerst
    const UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
    const DN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
    const day0 = startOfDay(now), dname = (t) => { const k = Math.round((day0 - startOfDay(t)) / DAY); return k === 0 ? 'Vandaag' : k === 1 ? 'Gisteren' : new Date(t).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }); };
    const list = ev.slice(1).map((e, i) => ({ ...e, prev: ev[i].pos })).reverse().slice(0, 40);
    let lastDay = '', rows = '';
    for (const e of list) {
      const dn = dname(e.t); if (dn !== lastDay) { rows += `<div class="hday">${dn}</div>`; lastDay = dn; }
      const down = e.pos < e.prev, w = who(e.t);
      const txt = lamp ? (e.pos === 0 ? 'Uit' : e.prev === 0 ? `Aan · ${e.pos}%` : `Gedimd naar ${e.pos}%`) : e.pos >= 99 ? 'Open' : e.pos <= 1 ? 'Dicht' : `${100 - e.pos}% dicht`;
      const ico = lamp ? `<i class="hico lmp${e.pos ? ' on' : ''}">${MBULB}</i>` : `<i class="hico${down ? ' dn' : ''}">${down ? DN : UP}</i>`;
      rows += `<div class="hrow"><div class="hline">${ico}</div><div class="htx"><b>${txt}</b>${w}</div><div class="htm">${fmtTime(e.t)}</div></div>`;
    }
    this.$('hBody').innerHTML = chart + (rows || '<div class="hnone">Geen wijzigingen in de afgelopen 7 dagen</div>');
  }

  /* geschiedenis thermostaat: binnen- en ingestelde temperatuur, verwarmde periodes, programmawissels */
  async _thHistory() {
    const id = this._climateId(), body = this.$('shBody'), sh = this.$('sheet');
    this._cvHist = true; sh.classList.remove('hot');
    body.innerHTML = `<div class="hh"><button id="hBack"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Thermostaat</button></div>
      <div class="hti"><b>Geschiedenis</b></div>
      <div class="tqseg" id="tqSeg"><button data-h="6">6 uur</button><button data-h="24">24 uur</button><button data-h="168">7 dagen</button></div>
      <div id="hBody"><div class="hnone">Laden…</div></div>`;
    this.$('hBack').addEventListener('click', () => this._openSheet('th'));
    const now = Date.now(), from = new Date(now - 8 * DAY).toISOString(), endQ = `end_time=${encodeURIComponent(new Date(now).toISOString())}`;
    const wx = this._state(this._wxId()) ? this._wxId() : null;
    const autos = Object.keys(this._hass.states).filter((k) => /^(automation|script)\./.test(k));
    const [hist, whist, alog] = await Promise.all([
      this._hass.callApi('GET', `history/period/${from}?filter_entity_id=${id}&${endQ}`).catch(() => []),
      wx ? this._hass.callApi('GET', `history/period/${from}?filter_entity_id=${wx}&${endQ}&significant_changes_only=0`).catch(() => []) : [],
      autos.length ? this._hass.callApi('GET', `logbook/${new Date(now - 3 * DAY).toISOString()}?entity=${autos.join(',')}&end_time=${encodeURIComponent(new Date(now).toISOString())}`).catch(() => []) : [],
    ]);
    if (this._sheet !== 'th' || !this._cvHist) return;
    const first = (h) => (Array.isArray(h) && Array.isArray(h[0]) ? h[0] : []);
    const H = first(hist).map((x) => ({ t: Date.parse(x.last_updated || x.last_changed), cur: x.attributes?.current_temperature, tgt: x.attributes?.temperature, act: isHeating(x.attributes) ? 'heating' : x.attributes?.hvac_action, pre: x.attributes?.preset_mode }))
      .filter((x) => !isNaN(x.t) && x.cur != null).sort((a, b) => a.t - b.t);
    if (!H.length) { this.$('hBody').innerHTML = '<div class="hnone">Nog geen geschiedenis beschikbaar</div>'; return; }
    // segmenten: elke stand geldt tot de volgende wijziging
    const seg = (arr) => arr.map((x, i) => ({ ...x, e: arr[i + 1] ? arr[i + 1].t : now }));
    const S = seg(H);
    const OUT = seg(first(whist).map((x) => ({ t: Date.parse(x.last_updated || x.last_changed), v: +x.attributes?.temperature })).filter((x) => !isNaN(x.t) && !isNaN(x.v)).sort((a, b) => a.t - b.t));
    const clip = (arr, a, b) => arr.filter((s) => s.e > a && s.t < b).map((s) => ({ ...s, t: Math.max(s.t, a), e: Math.min(s.e, b) }));
    const wavg = (arr, k, a, b) => { let n = 0, w = 0; for (const s of clip(arr, a, b)) if (s[k] != null) { n += s[k] * (s.e - s.t); w += s.e - s.t; } return w > 0 ? n / w : null; };
    const heatMin = (a, b) => Math.round(clip(S, a, b).filter((s) => s.act === 'heating').reduce((n, s) => n + s.e - s.t, 0) / 60000);
    const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} u ${String(m % 60).padStart(2, '0')}` : `${m} min`);
    const t1 = (v) => fmt(v, 1), sup = '<sup>°</sup>';
    const dayLab = (t) => { const k = Math.round((startOfDay(now) - startOfDay(t)) / DAY); return k === 0 ? 'vandaag' : k === 1 ? 'gisteren' : new Date(t).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }); };
    const flame = '<svg class="gf" viewBox="0 0 100 100"><use href="#gFlame"/></svg>';

    // wie: een automatisering of script dat vlak ervoor liep
    const AL = (Array.isArray(alog) ? alog : []).map((l) => ({ t: Date.parse(l.when), n: l.name || (l.entity_id || '').split('.')[1]?.replace(/_/g, ' ') })).filter((l) => !isNaN(l.t));
    const who = (t) => { const l = AL.filter((x) => x.t <= t + 2000 && x.t >= t - 120000).pop(); return l ? `Automatisering · ${l.n}` : ''; };
    // wijzigingen: programma's en handmatige temperatuur
    const ev = [];
    for (let i = 1; i < H.length; i++) {
      const a = H[i - 1], b = H[i]; if (b.t < now - 3 * DAY) continue;
      if (b.pre && b.pre !== a.pre && b.pre !== 'none') ev.push({ t: b.t, k: 'pre', v: b.pre, tgt: b.tgt });
      else if (b.tgt != null && a.tgt != null && b.tgt !== a.tgt) ev.push({ t: b.t, k: 'tmp', from: a.tgt, tgt: b.tgt });
    }
    const ic = (k, c) => `<i class="hico" style="background:color-mix(in srgb,${c} 24%,transparent);color:${c}"><svg class="fi" viewBox="0 0 24 24">${FI[k]}</svg></i>`;
    const dn = (t) => { const k = Math.round((startOfDay(now) - startOfDay(t)) / DAY); return k === 0 ? 'Vandaag' : k === 1 ? 'Gisteren' : new Date(t).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }); };
    let rows = '', lastDay = '';
    for (const e of ev.reverse().slice(0, 40)) {
      const d = dn(e.t); if (d !== lastDay) { rows += `<div class="hday">${d}</div>`; lastDay = d; }
      const w = who(e.t), deg = (v) => `${fmt(v, v % 1 ? 1 : 0)}°`;
      const P = PRESETS[e.v] || [e.v, 'house', '#aeb6c4'];
      const [icon, txt, sub] = e.k === 'pre' ? [ic(P[1], P[2]), `Programma ${P[0]}`, [w, e.tgt != null ? deg(e.tgt) : ''].filter(Boolean).join(' · ')]
        : [ic('therm', '#8fc6ff'), `${deg(e.from)} → ${deg(e.tgt)}`, w];
      rows += `<div class="hrow"><div class="hline">${icon}</div><div class="htx"><b>${txt}</b>${sub ? `<span>${sub}</span>` : ''}</div><div class="htm">${fmtTime(e.t)}</div></div>`;
    }

    this.$('hBody').innerHTML = `<div class="tqc"><div class="tqr"><div><small id="tqLab"></small><b id="tqCur"></b></div><div class="r"><small id="tqRLab"></small><b id="tqTgt"></b></div></div>
      <svg class="tqch" id="tqCh"></svg><div class="tqlg" id="tqLg"></div></div><div class="tqst" id="tqSt"></div>
      <div class="hsec">Wijzigingen</div>${rows || '<div class="hnone">Geen wijzigingen in de afgelopen 3 dagen</div>'}`;
    const svg = this.$('tqCh');
    let span = this._thSpan || 24, geo = null, days = [];

    const stats = () => {
      const tiles = (a) => a.map(([k, v, sub, cls]) => `<div><small>${k}</small><b class="${cls || ''}">${v}</b>${sub ? `<em>${sub}</em>` : ''}</div>`).join('');
      if (span === 168) {
        const tot = days.reduce((n, d) => n + d.min, 0);
        this.$('tqSt').innerHTML = tiles([['Gemiddeld', `${t1(wavg(S, 'cur', startOfDay(now) - 6 * DAY, now))}°`], ['Verwarmd', `${Math.round(tot / 60)} uur`], ['Per dag', dur(Math.round(tot / 7))]]);
        return;
      }
      const a0 = now - span * HOUR, ha = heatMin(a0, now), hb = heatMin(a0 - DAY, now - DAY), df = ha - hb;
      const oa = wavg(OUT, 'v', a0, now), ob = wavg(OUT, 'v', a0 - DAY, now - DAY), od = oa != null && ob != null ? oa - ob : null;
      const os = od == null ? '' : Math.abs(od) < .5 ? 'buiten even warm' : `buiten ${fmt(Math.abs(od))}° ${od < 0 ? 'kouder' : 'warmer'}`;
      const hasY = H[0].t <= a0 - DAY + HOUR;
      this.$('tqSt').innerHTML = tiles([['Verwarmd', dur(ha)], ['Gemiddeld', `${t1(wavg(S, 'cur', a0, now))}°`],
        ['Vs. gisteren', hasY ? (df === 0 ? 'gelijk' : `${df > 0 ? '+' : '−'}${dur(Math.abs(df))}`) : '—', hasY ? os : '', hasY && df !== 0 ? (df > 0 ? 'up' : 'dn') : '']]);
    };

    const showL = (t) => {
      const x = clip(S, (t ?? now) - 1, (t ?? now)).pop() || S[S.length - 1];
      this.$('tqLab').textContent = `Temperatuur · ${t == null ? 'nu' : startOfDay(t) === startOfDay(now) ? fmtTime(t) : `${dayLab(t)} ${fmtTime(t)}`}`;
      this.$('tqCur').innerHTML = t1(x.cur) + sup;
      const heat = x.act === 'heating';
      this.$('tqRLab').textContent = heat ? 'Verwarmt tot' : 'Ingesteld';
      this.$('tqTgt').className = 'bl';
      this.$('tqTgt').innerHTML = x.tgt != null ? `${heat ? flame : ''}${t1(x.tgt)}${sup}` : '—';
      const c = this.$('tqX'); if (!c) return;
      if (t == null) { c.style.display = 'none'; return; }
      c.style.display = ''; const xx = geo.X(t);
      c.querySelector('line').setAttribute('x1', xx); c.querySelector('line').setAttribute('x2', xx);
      const dot = c.querySelector('circle'); dot.setAttribute('cx', xx); dot.setAttribute('cy', clamp(geo.Y(x.cur), 0, geo.B));
    };

    const drawLine = () => {
      const t0 = now - span * HOUR, W = svg.clientWidth || 320, Hh = 200, PR = 36, PT = 6, PB = 26, B = Hh - PB;
      const P = clip(S, t0, now);
      const cs = P.map((s) => s.cur);
      let lo = Math.min(...cs), hi = Math.max(...cs); const pad = Math.max(.2, (hi - lo) * .15); lo -= pad; hi += pad;
      const step = hi - lo > 2.5 ? 1 : hi - lo > 1.2 ? .5 : .2;
      const X = (t) => (t - t0) / (span * HOUR) * (W - PR), Y = (v) => PT + (hi - v) / (hi - lo) * (B - PT);
      let s = `<defs><linearGradient id="tqFg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0782e" stop-opacity=".45"/><stop offset="1" stop-color="#f0782e" stop-opacity=".04"/></linearGradient><clipPath id="tqPa"><rect x="0" y="0" width="${W - PR}" height="${B}"/></clipPath>`;
      const path = (k) => { let d = ''; for (const q of P) { if (q[k] == null) continue; const y = Y(q[k]).toFixed(1); d += `${d ? ' L' : 'M'}${X(q.t).toFixed(1)} ${y} L${X(q.e).toFixed(1)} ${y}`; } return d; };
      const dc = path('cur'), dt = path('tgt'), area = `${dc} L${X(now).toFixed(1)} ${B} L0 ${B}Z`;
      s += `<clipPath id="tqCp"><path d="${area}"/></clipPath></defs>`;
      for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) s += `<line x1="0" x2="${W - PR}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,255,255,.08)"/><text x="${W - PR + 6}" y="${Y(v) + 4}">${fmt(v, step < 1 ? 1 : 0)}°</text>`;
      const tick = span === 6 ? HOUR : 4 * HOUR;
      for (let t = startOfDay(t0) + Math.ceil((t0 - startOfDay(t0)) / tick) * tick; t <= now; t += tick) { const x = X(t); if (x < 14 || x > W - PR - 4) continue; s += `<line x1="${x}" x2="${x}" y1="${PT}" y2="${B}" stroke="rgba(255,255,255,.05)"/><text x="${x}" y="${Hh - 6}" text-anchor="middle">${fmtTime(t)}</text>`; }
      s += `<path d="${area}" fill="url(#tqFg)"/><g clip-path="url(#tqCp)">`;
      for (const q of P) if (q.act === 'heating') s += `<rect x="${X(q.t).toFixed(1)}" y="0" width="${Math.max(1.5, X(q.e) - X(q.t)).toFixed(1)}" height="${B}" fill="#ff9a4d" opacity=".35"/>`;
      s += `</g><g clip-path="url(#tqPa)"><path d="${dt}" fill="none" stroke="#8fc6ff" stroke-width="2" stroke-dasharray="5 4"/></g>`;
      s += `<path d="${dc}" fill="none" stroke="#f0782e" stroke-width="2.4" stroke-linejoin="round"/>`;
      s += `<g id="tqX" style="display:none"><line y1="0" y2="${B}" stroke="rgba(255,255,255,.55)"/><circle r="6.5" fill="#f0782e" stroke="#fff" stroke-width="2.5"/></g>`;
      svg.innerHTML = s; geo = { X, Y, B, W, PR, t0 };
      this.$('tqLg').innerHTML = '<span><i style="background:#f0782e"></i>Temperatuur</span><span><i style="background:repeating-linear-gradient(90deg,#8fc6ff 0 4px,transparent 4px 6px)"></i>Ingesteld</span><span><i style="background:rgba(255,154,77,.6);height:8px"></i>Verwarmen</span>';
      stats(); showL(null);
    };

    const showB = (i, sel) => {
      const d = days[i]; if (!d) return;
      svg.querySelectorAll('.tqb').forEach((b) => b.setAttribute('opacity', sel ? (+b.dataset.i === i ? 1 : .35) : (+b.dataset.i === 6 ? 1 : .6)));
      this.$('tqLab').textContent = `Temperatuur · ${dayLab(d.t)}`;
      this.$('tqCur').innerHTML = d.avg != null ? `${t1(d.avg)}${sup}<span class="rg">${t1(d.lo)} – ${t1(d.hi)}°</span>` : '—';
      this.$('tqRLab').textContent = 'Verwarmd'; this.$('tqTgt').className = ''; this.$('tqTgt').textContent = dur(d.min);
    };
    const drawBars = () => {
      days = [];
      for (let k = 6; k >= 0; k--) {
        const a = startOfDay(now) - k * DAY, b = Math.min(a + DAY, now), P = clip(S, a, b);
        days.push({ t: a, min: heatMin(a, b), avg: wavg(S, 'cur', a, b), lo: P.length ? Math.min(...P.map((q) => q.cur)) : null, hi: P.length ? Math.max(...P.map((q) => q.cur)) : null });
      }
      const ok = days.filter((d) => d.lo != null), W = svg.clientWidth || 320, Hh = 200, PR = 36, PT = 6, PB = 26, B = Hh - PB, bw = (W - PR) / 7;
      const lo = Math.floor(Math.min(...ok.map((d) => d.lo)) - .3), hi = Math.ceil(Math.max(...ok.map((d) => d.hi)) + .3), Y = (v) => PT + (hi - v) / (hi - lo || 1) * (B - PT);
      let s = '';
      for (let v = lo; v <= hi; v++) s += `<line x1="0" x2="${W - PR}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,255,255,.08)"/><text x="${W - PR + 6}" y="${Y(v) + 4}">${v}°</text>`;
      days.forEach((d, i) => {
        const cx = i * bw + bw / 2, w = Math.min(16, bw * .34);
        s += `<text x="${cx}" y="${Hh - 6}" text-anchor="middle"${i === 6 ? ' style="fill:#fff;font-weight:600"' : ''}>${i === 6 ? 'vand.' : new Date(d.t).toLocaleDateString('nl-NL', { weekday: 'short' })}</text>`;
        if (d.lo == null) return;
        s += `<rect class="tqb" data-i="${i}" x="${cx - w / 2}" y="${Y(d.hi)}" width="${w}" height="${Math.max(w, Y(d.lo) - Y(d.hi))}" rx="${w / 2}" fill="#f0782e"/><circle cx="${cx}" cy="${Y(d.avg)}" r="4" fill="#fff"/>`;
      });
      svg.innerHTML = s; geo = { bw, PR, W };
      this.$('tqLg').innerHTML = '<span><i style="background:#f0782e;height:8px;width:8px"></i>Laagste – hoogste</span><span><i style="background:#fff;width:7px;height:7px;border-radius:50%"></i>Gemiddeld</span>';
      stats(); showB(6, false);
    };
    const draw = () => {
      this._thSpan = span;
      this.$('tqSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.h === span));
      (span === 168 ? drawBars : drawLine)();
    };
    // schuiven door de grafiek
    const pick = (e) => {
      if (!geo) return;
      const r = svg.getBoundingClientRect(), fx = clamp((e.clientX - r.left) / (r.width * (geo.W - geo.PR) / geo.W), 0, 1);
      if (span === 168) showB(Math.min(6, Math.floor(fx * 7)), true);
      else showL(geo.t0 + fx * span * HOUR);
    };
    const reset = () => (span === 168 ? showB(6, false) : showL(null));
    svg.addEventListener('pointerdown', (e) => { e.preventDefault(); svg.setPointerCapture(e.pointerId); pick(e); });
    svg.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') pick(e); });
    svg.addEventListener('pointerup', reset); svg.addEventListener('pointercancel', reset);
    this.$('tqSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { span = +b.dataset.h; draw(); }));
    draw();
  }

  _closeSheet() {
    if (!this._sheet) return;
    // paneel geopend vanuit een kamer: terug naar die kamer
    const back = this._sheet !== 'room' ? this._roomBack : null;
    this._roomBack = null;
    if (back != null) { if (this._sheet === 'th' && this._tMark) this._tMark.after(this.$('tTile')); this.$('sheet').classList.remove('therm', 'hot', 'lamp'); this._cvDrag = null; this._thArc = null; this._openSheet('room', back); return; }
    if (this._sheet === 'th' && this._tMark) this._tMark.after(this.$('tTile'));
    this._sheet = null;
    this._pplMapEl = null;
    this.$('sheet').hidden = true; this.$('shV').hidden = true; this.$('shBody').innerHTML = ''; this.$('sheet').classList.remove('full', 'therm', 'hot', 'lamp'); this._cvDrag = null; this._cvHist = false; this._thArc = null;
  }
  _updSheet() {
    if (!this._sheet || !this._hass) return;
    if (this._sheet === 'room') { this._updRoomSheet(); return; }
    if (this._sheet === 'ppl') { this._updPplSheet(); return; }
    const sh = this.$('sheet');
    if (this._sheet === 'lt') {
      const st = this._state(this._cvId); if (!st || this._cvHist || !this.$('cvF')) return;
      const a = st.attributes, on = st.state === 'on', b = on ? Math.round((a.brightness ?? 255) / 2.55) : 0, v = this._cvDrag ?? b;
      const set = (id, h) => { const el = this.$(id); if (el && el.innerHTML !== h) el.innerHTML = h; };
      set('cvN', (this._nm(st) || this._cvId).replace(/^Hue /, ''));
      set('cvS', st.state === 'unavailable' ? 'Niet bereikbaar' : v > 0 ? `Aan · ${v}%` : 'Uit');
      this.$('cvF').style.height = `${v}%`;
      this.$('cvSl').classList.toggle('off', v <= 0);
      set('lPwT', on ? 'Uit' : 'Aan');
      const k = a.color_mode === 'color_temp' ? a.color_temp_kelvin : null;
      this.$('lCols')?.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('on', on && k != null && Math.abs(+x.dataset.k - k) === Math.min(...[2200, 2700, 4000, 6000].map((q) => Math.abs(q - k)))));
      this.$('lCols')?.querySelector('.more')?.classList.toggle('on', on && a.color_mode && a.color_mode !== 'color_temp' && a.color_mode !== 'brightness');
      return;
    }
    if (this._sheet === 'cv') {
      const st = this._state(this._cvId); if (!st || this._cvHist || !this.$('cvF')) return;
      const a = st.attributes, pos = a.current_position ?? (st.state === 'closed' ? 0 : 100);
      const d = this._cvDrag ?? 100 - pos, p = 100 - d;
      const set = (id, h) => { const el = this.$(id); if (el && el.innerHTML !== h) el.innerHTML = h; };
      set('cvN', (this._nm(st) || this._cvId).replace(/^Rolluik /, ''));
      set('cvS', this._cvDrag == null && st.state === 'opening' ? 'Gaat open' : this._cvDrag == null && st.state === 'closing' ? 'Gaat dicht' : p >= 99 ? 'Open' : p <= 1 ? 'Dicht' : `${d}% dicht`);
      this.$('cvF').style.height = `${d}%`;
      set('cvI', mBlind(p));
      return;
    }
    if (this._sheet === 'th') {
      const { cl, a, min, max } = this._tGeo(); if (!cl || this._cvHist || !this.$('thArc')) return;
      const hot = this.$('mTh').classList.contains('hot'), off = cl.state === 'off', cur = a.current_temperature, tgt = this._tTarget ?? a.temperature ?? 20;
      sh.classList.toggle('hot', hot);
      const set = (id, h) => { const el = this.$(id); if (el && el.innerHTML !== h) el.innerHTML = h; };
      set('thS', off ? 'Uit' : this._tDragging ? 'Loslaten om in te stellen' : hot ? 'Verwarmen' : 'Op temperatuur');
      set('thN', cur != null ? `${fmt(cur, 1)}<small>°</small>` : '—');
      set('thL', hot ? 'Verwarmt tot' : 'Ingesteld op');
      set('thT', `${hot ? '<svg class="gf" viewBox="0 0 100 100"><use href="#gFlame"/></svg>' : '<span class="okc"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg></span>'}${fmt(tgt, tgt % 1 ? 1 : 0)}°`);
      // boog
      const cx = 145, cy = 140, r = 118, a0 = 135, a1 = 405, ang = (v) => a0 + (clamp(v, min, max) - min) / (max - min || 1) * (a1 - a0);
      const pt = (d) => [cx + r * Math.cos(d * Math.PI / 180), cy + r * Math.sin(d * Math.PI / 180)];
      const path = (f, t) => { const [x0, y0] = pt(f), [x1, y1] = pt(t); return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${t - f > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
      const [kx, ky] = pt(ang(tgt)), kr = this._tDragging ? 20 : 17;
      let svg = `<defs><linearGradient id="thgM" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${hot ? '#ffc9a0' : '#3b82f6'}"/><stop offset=".55" stop-color="${hot ? '#ffe6d2' : '#8fc6ff'}"/><stop offset="1" stop-color="${hot ? '#ffffff' : '#cfe6ff'}"/></linearGradient></defs>`;
      svg += `<path d="${path(a0, a1)}" stroke="rgba(0,0,0,.25)" stroke-width="26" fill="none" stroke-linecap="round"/>`;
      svg += `<path d="${path(a0, Math.max(a0 + .5, ang(tgt)))}" stroke="url(#thgM)" stroke-width="26" fill="none" stroke-linecap="round"/>`;
      if (cur != null) { const [nx, ny] = pt(ang(cur)); svg += `<circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="3.5" fill="rgba(255,255,255,.85)"/>`; }
      svg += `<circle cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="${kr}" fill="#fff" style="filter:drop-shadow(0 3px 8px rgba(0,0,0,.4))"/>`;
      const lt = isLight(this), pw = this.$('thPow');
      if (pw) { pw.hidden = !(a.hvac_modes || []).includes('off'); pw.classList.toggle('on', !off); }
      sh.classList.toggle('thl8', lt);
      if (lt) {
        // lichte weergave: dunne boog blauw → warm, wit knopje met gekleurde stip, grote temperatuur met °C
        const [sx, sy] = pt(a0), [ex, ey] = pt(a1), fr = (ang(tgt) - a0) / (a1 - a0) * 100, dot = hot ? '#ff8a3d' : '#4a9df0';
        svg = `<defs><linearGradient id="thgL" gradientUnits="userSpaceOnUse" x1="35" y1="0" x2="255" y2="0"><stop offset="0" stop-color="#4a9df0"/><stop offset=".55" stop-color="#f5b431"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient></defs>`;
        svg += `<path d="${path(a0, a1)}" stroke="#e8e9f0" stroke-width="18" fill="none" stroke-linecap="round"/>`;
        if (!off) svg += `<path d="${path(a0, a1)}" pathLength="100" stroke-dasharray="${Math.max(.3, fr).toFixed(2)} 200" stroke="url(#thgL)" stroke-width="18" fill="none" stroke-linecap="round"/>`;
        if (cur != null) { const [nx, ny] = pt(ang(cur)); svg += `<circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="3.5" fill="#111318" opacity=".5"/>`; }
        svg += `<circle cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="${this._tDragging ? 15 : 13}" fill="#fff" style="filter:drop-shadow(0 2px 5px rgba(40,50,80,.22))"/><circle cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="5" fill="${off ? '#aebcd3' : dot}"/>`;
        svg += `<text x="${(sx + 4).toFixed(1)}" y="${(sy + 30).toFixed(1)}" text-anchor="middle" font-size="12" fill="#a1a1aa">${fmt(min, min % 1 ? 1 : 0)}°</text><text x="${(ex - 4).toFixed(1)}" y="${(ey + 30).toFixed(1)}" text-anchor="middle" font-size="12" fill="#a1a1aa">${fmt(max, max % 1 ? 1 : 0)}°</text>`;
        set('thN', cur != null ? `${fmt(cur, 1)}<small>°C</small>` : '—');
        set('thL', off ? 'uit' : `doel ${fmt(tgt, tgt % 1 ? 1 : 0)}°`);
      }
      if (this._thArc !== svg || !this.$('thArc').firstChild) { this.$('thArc').innerHTML = svg; this._thArc = svg; }
      // programma
      const modes = Object.keys(PRESETS).filter((m) => (a.preset_modes || []).includes(m)), now = this._preWait || a.preset_mode;
      const p = PRESETS[now] || ['—', 'house', '#aeb6c4'], ic = (k, c) => `<svg class="fi" viewBox="0 0 24 24" style="color:${c}">${FI[k]}</svg>`;
      set('thP', `${ic(p[1], p[2])}<span>${p[0]}</span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9l5-5 5 5M7 15l5 5 5-5"/></svg>`);
      const mh = modes.map((m) => `<button data-m="${m}" class="${m === now ? 'on' : ''}"><i>${m === now ? '✓' : ''}</i>${ic(PRESETS[m][1], PRESETS[m][2])}${PRESETS[m][0]}</button>`).join('');
      const mb = this.$('thM');
      if (mb.innerHTML !== mh) {
        mb.innerHTML = mh;
        mb.querySelectorAll('button').forEach((x) => x.addEventListener('click', (e) => {
          e.stopPropagation(); this.$('thSel').classList.remove('open');
          this._preWait = x.dataset.m;
          this._hass.callService('climate', 'set_preset_mode', { entity_id: this._climateId(), preset_mode: x.dataset.m });
          setTimeout(() => { this._preWait = null; this._updThermo(); }, 8000);
          this._updThermo();
        }));
      }
      return;
    }
    // weer
    const w = this._wxState(); if (!w) return;
    const a = w.attributes, ic = this.$('mWIc').getAttribute('href').slice(1), label = this.$('wD').textContent;
    const I = (k) => `<svg viewBox="0 0 100 100"><use href="#${k}"/></svg>`;
    const now = Date.now(), num = (v) => (v == null || isNaN(+v) ? null : +v);
    // regen komende 2 uur (Buienradar)
    const rs = this._state(this._config.rain_now)?.state || '', rm = rs.match(/^(\d{1,2}):(\d{2});([\d,]+)$/);
    let rain = '';
    if (rm) {
      const mm = rm[3].split(',').map((v) => (+v ? 10 ** ((+v - 109) / 32) : 0));
      let t0 = new Date().setHours(+rm[1], +rm[2], 0, 0); if (t0 - now > 12 * HOUR) t0 -= 24 * HOUR; else if (now - t0 > 12 * HOUR) t0 += 24 * HOUR;
      const list = mm.map((v, i) => ({ v, t: t0 + i * 300000 })).filter((x) => x.t + 300000 > now).slice(0, 24);
      const mx = Math.max(2, ...list.map((x) => x.v));
      rain = `<div class="shcard"><div class="shlab">Regen komende 2 uur <span>${this._rainSoon() || ''}</span></div><div class="shrain">${list.map((x) => `<i style="height:${Math.max(2, x.v / mx * 46).toFixed(1)}px;opacity:${x.v >= 0.1 ? 1 : 0.25}"></i>`).join('')}</div><div class="shrx"><span>nu</span><span>+30</span><span>+60</span><span>+90</span><span>+120</span></div></div>`;
    }
    const hrs = (this._fc_hourly || []).filter((f) => Date.parse(f.datetime) > now - 3600000).slice(0, 6);
    const wn = (e) => /buienradar/.test(e || '') ? 'Buienradar' : /^weather\.forecast_/.test(e || '') ? 'Met.no' : (this._nm(e) || e || '').replace(/^Forecast\s*/i, '');
    const srcTxt = wn(w.entity_id);
    const hour = hrs.length ? `<div class="shcard"><div class="shlab">Per uur</div><div class="shhrs">${hrs.map((f, i) => {
      const p = num(f.precipitation_probability), mmv = num(f.precipitation);
      const extra = p != null && p >= 30 ? `${Math.round(p)}%` : mmv != null && mmv >= 0.1 ? `${fmt(mmv, 1)} mm` : '';
      return `<div>${i === 0 ? 'Nu' : new Date(f.datetime).getHours().toString().padStart(2, '0')}${I((WCOND[f.condition] || ['', 'wCloud'])[1])}<b>${fmt(f.temperature)}°</b><em>${extra}</em></div>`;
    }).join('')}</div></div>` : '';
    const days = (this._fc_daily || []).filter((f) => startOfDay(Date.parse(f.datetime)) >= startOfDay(now)).slice(0, 6);
    let daily = '';
    if (days.length) {
      const L = Math.min(...days.map((f) => f.templow ?? f.temperature)), H = Math.max(...days.map((f) => f.temperature)), R = Math.max(1, H - L);
      daily = `<div class="shcard"><div class="shlab">Komende dagen</div>${days.map((f) => {
        const lo = f.templow ?? f.temperature, hi = f.temperature, di = (WCOND[f.condition] || ['', 'wCloud'])[1];
        const d = startOfDay(Date.parse(f.datetime)) === startOfDay(now) ? 'Vandaag' : new Date(f.datetime).toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', '').replace(/^./, (c) => c.toUpperCase());
        return `<div class="shday"><span>${d}</span>${I(di === 'wNight' ? 'wSunny' : di)}<span class="l">${fmt(Math.floor(lo))}°</span><div class="shbar"><i style="left:${((lo - L) / R * 100).toFixed(0)}%;right:${((H - hi) / R * 100).toFixed(0)}%"></i></div><span class="h">${fmt(Math.ceil(hi))}°</span></div>`;
      }).join('')}</div>`;
    }
    const det = [];
    if (num(a.wind_speed) != null) det.push(['Wind', `${fmt(a.wind_speed)} km/u`, [a.wind_bearing != null ? DIRS[Math.round(a.wind_bearing / 45) % 8] : '', num(a.wind_gust_speed) ? `windstoten ${fmt(a.wind_gust_speed)}` : ''].filter(Boolean).join(' · ')]);
    if (num(a.humidity) != null) det.push(['Vochtigheid', `${fmt(a.humidity)}%`, num(a.dew_point) != null ? `dauwpunt ${fmt(a.dew_point)}°` : '']);
    if (num(a.uv_index) != null) det.push(['UV-index', fmt(a.uv_index), a.uv_index < 3 ? 'laag' : a.uv_index < 6 ? 'matig' : a.uv_index < 8 ? 'hoog' : 'zeer hoog']);
    if (num(a.pressure) != null) det.push(['Luchtdruk', `${fmt(a.pressure)} hPa`, '']);
    const feels = num(a.apparent_temperature);
    const html = `<div class="shtop"><div><div class="shwx">${I(ic)}<b>${fmt(a.temperature)}°</b><span class="shpl">${this._config.weather_place ? `<em>${this._config.weather_place}</em>` : ''}${srcTxt}</span></div><div class="shcond">${label}</div>
        <div class="shmm">${feels != null ? `voelt als ${fmt(feels)}° · ` : ''}<span class="lo">↓ ${this.$('wLo').textContent}</span> <span class="hi">↑ ${this.$('wHi').textContent}</span></div></div><button class="shx" aria-label="Sluiten">✕</button></div>
      ${rain}${hour}${daily}${det.length ? `<div class="shgrid">${det.map(([t, v, s2]) => `<div><small>${t}</small><b>${v}</b><span>${s2}</span></div>`).join('')}</div>` : ''}
      <button class="shrbtn" id="shRb">Buienradar bekijken</button><div class="shrad" id="shRad" hidden><iframe title="Buienradar"></iframe><i class="home"></i></div>`;
    const box = this.$('shWx');
    if (!box || html === this._shKey) return;
    const radOpen = this.$('shRad') && !this.$('shRad').hidden;
    this._shKey = html; box.innerHTML = html;
    box.querySelector('.shx').addEventListener('click', () => this._closeSheet());
    const openRad = () => {
      const r = this.$('shRad'), f = r.querySelector('iframe'), k = r.offsetWidth / 550, z = this._state('zone.home')?.attributes || {};
      r.hidden = false; this.$('shRb').hidden = true;
      const kk = r.offsetWidth / 550; r.style.height = `${Math.round(512 * kk)}px`; f.style.transform = `scale(${kk})`;
      if (!f.src) f.src = `https://gadgets.buienradar.nl/gadget/zoommap/?lat=${(z.latitude ?? 52.1).toFixed(4)}&lng=${(z.longitude ?? 5.18).toFixed(4)}&overname=2&zoom=${this._config.radar_zoom}&naam=Thuis&size=3&voor=1`;
      return k;
    };
    this.$('shRb').addEventListener('click', openRad);
    if (radOpen) openRad();
  }

  /* ---------- statuspillen (telefoon) ---------- */
  /* ---------- tabblad Kamers ---------- */
  // per kamer: lampen (Hue-kamers niet dubbel), rolluiken, temperatuur, apparaten en eigen scènes
  // kamers uit de ruimtes en verdiepingen van Home Assistant (als er geen 'rooms' in de instellingen staan)
  _areaRooms() {
    const h = this._hass, A = h?.areas, E = h?.entities, D = h?.devices || {}, F = h?.floors || {};
    if (!A || !E) return [];
    const c0 = this._config;
    // opnieuw opbouwen als de registers van Home Assistant veranderen (ruimte, apparaat of entiteit verplaatst) of de instellingen
    if (this._arRooms && this._arRef && this._arRef[0] === A && this._arRef[1] === E && this._arRef[2] === h.devices && this._arRef[3] === F && this._arRef[4] === c0) return this._arRooms;
    // ruimtes samenvoegen (room_merge: { "Zolder overloop": "Zolder" }) en eigen volgorde (room_order: [namen])
    const lc = (x) => String(x || '').trim().toLowerCase(), byName = {};
    Object.entries(A).forEach(([id, a]) => { byName[lc(a.name)] = id; byName[lc(id)] = id; });
    const merge = {}; Object.entries(c0.room_merge || {}).forEach(([from, to]) => { const f = byName[lc(from)], t = byName[lc(to)]; if (f && t && f !== t) merge[f] = t; });
    const order = (c0.room_order || []).map(lc);
    const byArea = {};
    for (const [id, e] of Object.entries(E)) {
      if (e.hidden || e.disabled_by || e.entity_category) continue;
      let a = e.area_id || D[e.device_id]?.area_id; if (!a) continue; a = merge[a] || a;
      (byArea[a] = byArea[a] || []).push(id);
    }
    const icon = (n) => { n = n.toLowerCase(); return /woon/.test(n) ? 'sofa' : /keuken/.test(n) ? 'pot' : /toilet|wc/.test(n) ? 'toilet' : /tuin|zwembad|terras|balkon/.test(n) ? 'tree' : /bad/.test(n) ? 'bath' : /was/.test(n) ? 'wash' : /werk|kantoor|studeer/.test(n) ? 'desk' : /^zolder|attic|vliering/.test(n) ? 'attic' : /overloop|trap|gang/.test(n) ? 'stairs' : /slaap|kamer/.test(n) ? 'bed' : /tuin|zwembad|terras|balkon/.test(n) ? 'tree' : /oprit|garage|carport/.test(n) ? 'drive' : /schuur|berging/.test(n) ? 'shed' : 'door'; };
    const c = this._config, flr = (f) => F[f] || {};
    // laadpaal: in de ruimte van de laadpaal, anders bij de oprit/garage
    const evE = E[c.car_charging] || {}, evArea = c.car_charging ? (merge[evE.area_id || D[evE.device_id]?.area_id] || evE.area_id || D[evE.device_id]?.area_id) : null;
    const rooms = Object.entries(A).filter(([aid]) => !merge[aid]).map(([aid, a]) => {
      const ids = byArea[aid] || [], dom = (d) => ids.filter((x) => x.startsWith(d + '.'));
      const sens = (cls) => ids.filter((x) => x.startsWith('sensor.') && h.states[x]?.attributes.device_class === cls && !/inverter|omvormer|oven|wasmachine|vaatwasser|laadpaal/i.test(x));
      const lights = dom('light'), covers = dom('cover'), climate = dom('climate').length > 0;
      const apps = [[`sensor.${c.dishwasher}_status`, 'dish'], [`sensor.${c.oven}_status`, 'oven'], [c.washer, 'was']].filter(([e]) => ids.includes(e)).map(([, k]) => k);
      if (c.car_charging && (evArea ? evArea === aid : /oprit|garage|carport|driveway/i.test(a.name))) apps.push('evc');
      // sensoren: binary_sensor (waterlek, rook, beweging, deur, raam) en rookmelders die hun status als sensor geven (zoals Nest Protect)
      // deuren van huishoudelijke apparaten (wasmachine, vaatwasser, oven …) zijn geen kamersensor
      const appDev = new Set([c0.washer, c0.dishwasher && `sensor.${c0.dishwasher}_status`, c0.oven && `sensor.${c0.oven}_status`].filter(Boolean).map((e) => E[e]?.device_id).filter(Boolean));
      const isApp = (x) => appDev.has(E[x]?.device_id) || APP_RE.test(x) || APP_RE.test(this._nm(x));
      // camera's (bv. UniFi Protect): hun detecties (beweging, persoon, geluid van rook/CO) zijn geen losse sensoren of rookmelders
      const camDev = this._camDev ||= new Set(Object.keys(E).filter((k) => k.startsWith('camera.')).map((k) => E[k].device_id).filter(Boolean));
      const cams = [...new Map(ids.filter((x) => x.startsWith('camera.') && E[x]?.device_id).map((x) => [E[x].device_id, x])).values()];
      const sensors0 = ids.filter((x) => !camDev.has(E[x]?.device_id));
      const sensors = sensors0.filter((x) => ((x.startsWith('binary_sensor.') && SENS_KIND[h.states[x]?.attributes.device_class]) || (x.startsWith('sensor.') && SMOKE_RE.test(x))) && !(SENS_KIND[h.states[x]?.attributes.device_class] !== 'leak' && isApp(x)));
      // slimme stekkers en schakelaars (bv. IKEA Grillplats): een switch met een vermogensmeter op hetzelfde apparaat
      const devOf = (x) => E[x]?.device_id, evDev = devOf(c0.car_charging);
      const plugs = dom('switch').filter((x) => { const d = devOf(x); if (!d || appDev.has(d) || d === evDev) return false;
        if (/automation|alarm|detection|detectie|overlay|privacy|adguard|statuslampje|hoge_fps|cloud|_motion|_illuminance|ingeschakeld|nachtwacht|lichtpad|stoomcontrole|let_op/i.test(x)) return false;
        return Object.keys(E).some((k) => E[k].device_id === d && h.states[k]?.attributes.device_class === 'power') || /plug|stopcontact|grillplats|tretakt|inspelning/i.test(x); });
      if (!lights.length && !covers.length && !climate && !sensors.length && !plugs.length && !cams.length) return null;
      const t = sens('temperature'), hu = sens('humidity');
      return { name: a.name, floor: flr(a.floor_id).name || '', level: flr(a.floor_id).level ?? 99, icon: icon(a.name), climate, lights, covers, apps, scenes: aid,
        temp: climate ? null : t.find((x) => !/motion/.test(x)) || t[0] || null, humidity: hu[0] || null, sensors, plugs, cams };
    }).filter(Boolean);
    // verdiepingen op volgorde (laag naar hoog, buiten als laatste); binnen een verdieping de volgorde van Home Assistant
    // verdieping: herken de naam (kelder, begane grond, eerste, tweede, zolder, buiten), anders het niveau uit Home Assistant
    const fRank = (r) => { const n = lc(r.floor); return /buiten|tuin|outside/.test(n) ? 999 : /kelder|souterrain|basement/.test(n) ? -1 : /begane|parterre|ground/.test(n) ? 0 : /eerste|1e|first/.test(n) ? 1 : /tweede|2e|second/.test(n) ? 2 : /derde|3e|third/.test(n) ? 3 : /zolder|vliering|attic/.test(n) ? 50 : typeof r.level === 'number' ? r.level : 99; };
    const oRank = (r) => { const i = order.indexOf(lc(r.name)); return i < 0 ? 1e3 : i; };
    rooms.forEach((r, i) => { r._i = i; r.level = fRank(r); });
    rooms.sort((a, b) => a.level - b.level || oRank(a) - oRank(b) || a._i - b._i);
    this._arRef = [A, E, h.devices, F, c0]; this._arRooms = rooms; this._camDev = null;
    return rooms;
  }
  _rooms() {
    // één keer per update van Home Assistant uitrekenen (Thuis, meldingen en Kamers gebruiken dezelfde lijst)
    if (this._rmMemo && this._rmMemo.h === this._hass && this._rmMemo.c === this._config && this._rmMemo.k === (this._kOpt ? 1 : 0) && this._rmMemo.t === Math.floor(Date.now() / 5000)) return this._rmMemo.v;
    const v = this._roomsBuild();
    this._rmMemo = { h: this._hass, c: this._config, k: this._kOpt ? 1 : 0, t: Math.floor(Date.now() / 5000), v };
    return v;
  }
  _roomsBuild() {
    const st = (id) => this._state(id);
    const list = (this._config.rooms || []).length ? this._config.rooms : this._areaRooms();
    const isG = (x) => !!x.attributes.is_hue_group, lc = (x) => String(x || '').toLowerCase(), byName = {}, sceneIds = [];
    // lampen van een Hue-kamer erbij zoeken op naam (attribuut lights); de Hue-kamer zelf alleen tonen als er niets los te vinden is
    Object.values(this._hass.states).forEach((x) => { const id = x.entity_id;
      if (id.startsWith('light.') && !isG(x) && x.state !== 'unavailable') byName[lc(this._nm(x))] ??= x;
      else if (id.startsWith('scene.')) sceneIds.push(id); });
    return list.map((r, i) => {
      const all = (r.lights || []).map(st).filter(Boolean);
      const members = all.filter(isG).flatMap((g) => (Array.isArray(g.attributes.lights) ? g.attributes.lights : []).map((n) => byName[lc(n)]).filter(Boolean));
      let cand = [...all.filter((x) => !isG(x)), ...members].filter((x) => x.state !== 'unavailable');
      if (!cand.length) cand = all.filter((x) => isG(x) && x.state !== 'unavailable');
      const seen = new Set(), lights = cand.filter((x) => { const k = lc(this._nm(x)); if (seen.has(k)) return false; seen.add(k); return true; });
      const on = lights.filter((x) => x.state === 'on').length;
      const covers = (r.covers || []).map(st).filter(Boolean).map((x) => {
        const a = x.attributes, pos = a.current_position != null ? a.current_position : x.state === 'closed' ? 0 : 100;
        return { id: x.entity_id, pos, moving: ['opening', 'closing'].includes(x.state), name: (this._nm(x) || x.entity_id).replace(/^Rolluik /, '') };
      });
      let temp = null, hum = null, heat = false;
      if (r.climate) { const c = st(this._climateId()); temp = c?.attributes.current_temperature ?? null; heat = isHeating(c?.attributes); }
      if (r.temp) { const v = parseFloat(st(r.temp)?.state); if (!isNaN(v)) temp = v; }
      if (r.humidity) { const v = parseFloat(st(r.humidity)?.state); if (!isNaN(v)) hum = v; }
      const apps = (r.apps || []).map((k) => { const box = this.$(k); if (!box || box.hidden) return null; return { k, box, txt: k === 'evc' ? (box.querySelector('.xbig')?.textContent || '') : box.querySelector('.tm')?.textContent || box.querySelector('.rt b')?.textContent || '' }; }).filter(Boolean);
      const slug = r.scenes || r.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const strip = (n) => { const re = new RegExp(`^${r.name}\\s+`, 'i'); let t = n.replace(re, ''); if (re.test(t) && t.replace(re, '')) t = t.replace(re, ''); t = t || r.name; return t.charAt(0).toUpperCase() + t.slice(1); };
      const scenes = sceneIds.filter((k) => k.startsWith(`scene.${slug}_`)).map((k) => { const x = st(k); return { id: k, name: strip(this._nm(x) || k), t: Date.parse(x.state) || 0 }; })
        .map((x) => ({ ...x, own: !HUE_SCENES.includes(x.name.toLowerCase()) && !/^nieuw/i.test(x.name) && !/^\d+$/.test(x.name) }));
      const E = this._hass.entities || {}, S = this._hass.states;
      // sensoren per apparaat: hoofdsensor + lux en batterij van hetzelfde apparaat
      const seenDev = new Set();
      const sensors = [...(r.sensors || []), ...(r.leaks || [])].map(st).filter(Boolean).map((x) => {
        const dc = x.attributes.device_class, isS = x.entity_id.startsWith('sensor.');
        const kind = isS ? 'smoke' : SENS_KIND[dc] || 'motion', K = SENS_TXT[kind], dev = E[x.entity_id]?.device_id;
        // rookmelder: één regel per apparaat (rook + koolmonoxide samen)
        if (kind === 'smoke' && dev) { if (seenDev.has(dev)) return null; seenDev.add(dev); }
        const sibs = dev ? Object.keys(E).filter((k) => k !== x.entity_id && E[k].device_id === dev && S[k]) : [];
        const sibK = (cls, re) => sibs.find((k) => k.startsWith('sensor.') && (S[k].attributes.device_class === cls || (re && re.test(k))));
        const sib = (cls, re) => { const k = sibK(cls, re); const v = k ? parseFloat(S[k].state) : NaN; return isNaN(v) ? null : v; };
        const bat = sib('battery', /_(batterij|batterijniveau|battery|battery_level)$/), lux = sib('illuminance'), luxId = sibK('illuminance'), tmp = sib('temperature'), t = Date.parse(x.last_changed) || 0;
        let on = x.state === 'on', off = ['unavailable', 'unknown'].includes(x.state), warn = false, txt; let pid = x.entity_id;
        if (kind === 'smoke') {
          const lvl = (e) => !e ? 0 : e.entity_id.startsWith('binary_sensor.') ? (e.state === 'on' ? 2 : 0) : /warn|heads|waarschuw/i.test(e.state) ? 1 : /emerg|alarm|detect|gevaar|nood|^on$/i.test(e.state) ? 2 : 0;
          const smoke = isS || dc === 'smoke' ? x : S[sibs.find((k) => SMOKE_RE.test(k) || S[k].attributes.device_class === 'smoke')];
          // tikken opent de rookstatus; koolmonoxide wordt wel meegelezen
          if (smoke) { pid = smoke.entity_id; off = ['unavailable', 'unknown'].includes(smoke.state); }
          const co = S[[x.entity_id, ...sibs].find((k) => CO_RE.test(k) || S[k]?.attributes.device_class === 'carbon_monoxide')];
          const ls = lvl(smoke), lc = lvl(co), lv = Math.max(ls, lc);
          const test = [smoke, co].some((e) => e?.state === 'testing');
          on = lv === 2; warn = lv === 1;
          txt = off ? 'Niet bereikbaar' : lv === 2 ? `${ls === 2 ? 'Rook' : 'Koolmonoxide'} gedetecteerd · sinds ${fmtTime(t)}` : lv === 1 ? `Waarschuwing ${ls === 1 ? 'rook' : 'koolmonoxide'}` : test ? 'Test bezig' : co ? 'Geen rook of koolmonoxide' : 'Geen rook';
        } else txt = off ? 'Niet bereikbaar' : on ? `${K.on}${K.since ? ` · sinds ${Date.now() - t < 12 * HOUR ? fmtTime(t) : relTime(t)}` : ''}` : `${K.last && t ? `Laatst ${relTime(t)}` : K.off}`;
        return { id: pid, kind, on, off, warn, t, alarm: on && K.alarm, bat, lux, luxId, tmp, label: K.label, txt };
      }).filter(Boolean).sort((p, q) => (q.alarm - p.alarm) || (q.warn - p.warn) || (SENS_ORDER.indexOf(p.kind) - SENS_ORDER.indexOf(q.kind)));
      // apparaten die uit staan: rustig in een lijst in het kamerpaneel
      const cf = this._config;
      const NM = { was: ['Wasmachine', 'washer', cf.washer], dish: ['Vaatwasser', 'dish', `sensor.${cf.dishwasher}_status`], oven: ['Oven', 'ovenX', `sensor.${cf.oven}_status`], evc: ['Laadpaal', 'car', cf.car_charging] };
      const offApps = (r.apps || []).filter((k) => !apps.some((a) => a.k === k) && NM[k] && S[NM[k][2]]).map((k) => ({ k, id: NM[k][2], nm: NM[k][0], ic: NM[k][1], txt: 'Stand-by' }));
      const plugs = (r.plugs || []).map(st).filter((x) => x && x.state !== 'unavailable').map((x) => {
        const d = E[x.entity_id]?.device_id, dv = this._hass.devices?.[d] || {}, pid = d && Object.keys(E).find((k) => E[k].device_id === d && S[k]?.attributes.device_class === 'power');
        const w = pid ? parseFloat(S[pid].state) : NaN;
        return { id: x.entity_id, on: x.state === 'on', w: isNaN(w) ? null : w, nm: dv.name_by_user || this._nm(x) || dv.name || x.entity_id };
      });
      // camera: één pil met de laatste detectie (persoon, auto, dier, aanbellen of beweging)
      const KIND = [[/persoon|person/, 'Persoon'], [/voertuig|vehicle/, 'Auto'], [/animal|dier/, 'Dier'], [/_deurbel$|doorbell|_ring$/, 'Aangebeld'], [/beweging|motion/, 'Beweging']];
      const cams = (r.cams || []).filter((id) => S[id]).map((id) => {
        const d = E[id]?.device_id, dv = this._hass.devices?.[d] || {};
        const det = Object.keys(E).filter((k) => k.startsWith('binary_sensor.') && E[k].device_id === d && S[k] && !['unavailable', 'unknown'].includes(S[k].state))
          .map((k) => { const m = KIND.find(([re]) => re.test(k)); return m ? { k, lb: m[1], on: S[k].state === 'on', t: Date.parse(S[k].last_changed) || 0, pr: KIND.indexOf(m) } : null; }).filter(Boolean);
        const cur = det.filter((x) => x.on).sort((p, q) => p.pr - q.pr)[0];
        const last = det.sort((p, q) => (q.t - p.t) || (p.pr - q.pr))[0];
        return { id, nm: dv.name_by_user || dv.name || this._nm(id) || 'Camera', on: !!cur, txt: cur ? `${cur.lb} nu` : last ? `${last.lb} · ${relTime(last.t)}` : 'Geen detectie' };
      });
      return { i, r, name: r.name, floor: r.floor || '', icon: r.icon, lights, on, covers, temp, hum, heat, apps, offApps, scenes, sensors, plugs, cams };
    });
  }
  _roomToggle(i) {
    const rm = this._rooms()[i]; if (!rm || !rm.lights.length) return;
    const on = !(this._kOpt?.[i] ?? rm.on > 0);
    this._kOpt = { ...(this._kOpt || {}), [i]: on }; clearTimeout(this._kOptT); this._kOptT = setTimeout(() => { this._kOpt = null; this._rmListKey = null; this._updRooms(); }, 6000);
    this._hass.callService('light', on ? 'turn_on' : 'turn_off', { entity_id: rm.lights.map((x) => x.entity_id) });
    this._rmListKey = null; this._updRooms();
  }
  _coverTxt(x) { return x.moving ? (this._state(x.id)?.state === 'opening' ? 'gaat open' : 'gaat dicht') : x.pos >= 99 ? 'open' : x.pos <= 1 ? 'dicht' : `${100 - x.pos}% dicht`; }
  _updRooms() {
    const box = this.$('kList'); if (!box || !this._hass) return;
    const rooms = this._rooms(), opt = this._kOpt || {};
    if (this._kOpt) { rooms.forEach((rm) => { if (opt[rm.i] != null && (rm.on > 0) === opt[rm.i]) delete opt[rm.i]; }); if (!Object.keys(opt).length) this._kOpt = null; }
    const BL = (p) => mBlind(p), fmtT = (v) => fmt(v, 1);
    const row = (rm) => {
      const lit = rm.lights.length && (opt[rm.i] ?? rm.on > 0), l1 = rm.lights.length ? (lit ? `<span class="y">${MBULB}${opt[rm.i] != null ? '' : rm.on}</span>` : `<span>${MBULB}Uit</span>`) : '';
      const l2 = [];
      if (rm.covers.length) { const dn = rm.covers.filter((c) => c.pos < 99); l2.push(dn.length ? `<span class="b">${BL(dn.length === 1 ? dn[0].pos : 0)}${rm.covers.length === 1 ? (rm.apps.length && dn[0].pos > 1 && !dn[0].moving ? `${100 - dn[0].pos}%` : this._coverTxt(dn[0]).replace(/^./, (c) => c.toUpperCase())) : `${dn.length} dicht`}</span>` : `<span>${BL(100)}Open</span>`); }
      // apparaat: Rounded-icoon en wat er gebeurt ("Wast nog 42 min")
      const AP = { was: ['washer', 1, 'Wast', 'Wasmachine'], dish: ['dish', 1, 'Vaatwasser', 'Vaatwasser'], oven: ['ovenX', 'run', 'Oven', 'Oven'] };
      rm.apps.forEach((a) => {
        if (a.k === 'evc') { const on = a.box.classList.contains('evon'); l2.push(`<span class="ap" style="color:${on ? '#5ee1d0' : ''}"><svg class="ri2" viewBox="0 0 100 100">${RIC.draw('car', on ? 'teal' : 'on').replace(/url\(#g-green\)/g, 'url(#g-teal)')}</svg>${a.txt}${on ? ' · laadt' : ' · wacht'}</span>`); return; }
        const [ic, md, , nm] = AP[a.k] || AP.was, t = String(a.txt || '').trim();
        const txt = /^\d/.test(t) ? `Nog ${t}` : t ? `${nm} ${t.charAt(0).toLowerCase()}${t.slice(1)}` : `${nm} bezig`;
        l2.push(`<span class="ap"><svg class="ri2" viewBox="0 0 100 100">${RIC.draw(ic, 'on', md)}</svg>${txt}</span>`); });
      // temperatuur klein in de statusregel
      if (rm.temp != null) l2.push(`<span class="tq">${MTHERM}${fmtT(rm.temp)}°</span>`);
      return `<div class="kr${lit ? ' lit' : ''}" data-i="${rm.i}"><i class="ri">${RIC.room(rm.icon, lit)}</i><div class="mid"><div class="nm">${rm.name}</div>${l1 || l2.length ? `<div class="ln">${l1}${l2.join('')}</div>` : ''}</div>${rm.lights.length ? `<button class="ksw${lit ? ' on' : ''}" data-i="${rm.i}" aria-label="Alle lampen ${rm.name}"></button>` : '<i class="kpad"></i>'}</div>`;
    };
    const floors = [...new Set(rooms.map((x) => x.floor))];
    const html = floors.map((f) => { const rs = rooms.filter((x) => x.floor === f);
      return `${f ? `<div class="kfh"><b>${f}</b></div>` : ''}<div class="krs">${rs.map(row).join('')}</div>`; }).join('');
    // pillen: lampen, rolluiken, klimaat (huis)
    const lOn = rooms.reduce((a, x) => a + x.on, 0), cv = rooms.flatMap((x) => x.covers), cDn = cv.filter((c) => c.pos < 99).length;
    const cl = this._state(this._climateId()), ct = cl?.attributes.current_temperature;
    const ts = rooms.filter((x) => x.temp != null && !/buiten/i.test(x.floor)).map((x) => x.temp), tlo = ts.length ? Math.min(...ts) : ct, thi = ts.length ? Math.max(...ts) : ct;
    const trange = tlo == null ? '' : Math.abs(thi - tlo) < 0.05 ? `${fmtT(tlo)}°` : `${fmtT(tlo)} – ${fmtT(thi)}°`;
    const P = (k, col, ic, t, v, hot) => `<div class="mp${hot ? ' hot' : ''}" data-k="${k}" style="--c:${col}"><i class="g">${ic}</i><div><b>${t}</b><span>${v}</span></div></div>`;
    const pills = P('', '#ffc83d', gBulb(lOn > 0), 'Lampen', lOn ? `${lOn} aan` : 'alles uit', lOn > 0) + (cv.length ? P('', '#5aa2ff', gBlind(cDn ? 0 : 100), 'Rolluiken', cDn ? `${cDn} dicht` : 'alles open', cDn > 0) : '')
      + (ct != null ? P('th', '#ff9a4d', `<svg viewBox="0 0 100 100"><use href="#${isHeating(cl.attributes) ? 'gFlame' : 'gTherm'}"/></svg>`, 'Klimaat', trange, isHeating(cl.attributes)) : '');
    if (this.$('kPills').innerHTML !== pills) { this.$('kPills').innerHTML = pills; this.$('kPills').querySelector('[data-k="th"]')?.addEventListener('click', () => this._openSheet('th')); }
    if (html === this._rmListKey) return;
    this._rmListKey = html; box.innerHTML = html;
    box.querySelectorAll('.kr').forEach((el) => el.addEventListener('click', (e) => {
      if (e.target.closest('.ksw')) { e.stopPropagation(); this._roomToggle(+e.target.closest('.ksw').dataset.i); return; }
      this._openSheet('room', +el.dataset.i);
    }));
  }
  // lamp- en rolluiktegels zoals bij Bediening (telefoon): tik = eigen paneel, tik op het rondje = aan/uit of open/dicht, lang = HA-venster
  _ltTile(s) {
    const a = s.attributes, isOn = s.state === 'on', col = this._lightColor(a), name = this._shortName(this._nm(s) || s.entity_id);
    return `<div class="lt${isOn ? ' on' : ''}" data-id="${s.entity_id}" style="--lc:${col};--a:${isOn ? (0.12 + 0.28 * (a.brightness ?? 255) / 255).toFixed(3) : 0}"><i class="mi2">${gBulb(isOn)}</i><div class="n">${name}</div><div class="ms">${isOn ? `Aan${a.brightness != null ? ` · ${Math.round(a.brightness / 2.55)}%` : ''}` : 'Uit'}</div></div>`;
  }
  _cvTile(x) { return `<div class="cv${x.pos < 99 ? ' on' : ''}" data-id="${x.id}" style="--a:${(0.24 + 0.36 * (100 - x.pos) / 100).toFixed(3)}"><i class="mi2">${gBlind(x.pos)}</i><b>${x.name}</b><span>${this._coverTxt(x)}</span></div>`; }
  _shortName(n) { const rm = ((this._config.rooms || []).length ? this._config.rooms : this._areaRooms())[this._roomIdx]; let t = String(n).replace(/^Hue /, ''); if (rm) { const re = new RegExp(`^(${rm.name}|zolder)\\s+`, 'i'); if (re.test(t) && t.replace(re, '')) t = t.replace(re, ''); } return t.charAt(0).toUpperCase() + t.slice(1); }
  _bindTiles(box, ri) {
    box.querySelectorAll('.lt, .cv').forEach((el) => {
      const id = el.dataset.id, lamp = el.classList.contains('lt');
      let timer = null, long = false;
      const cancel = () => { clearTimeout(timer); el.classList.remove('press'); };
      el.addEventListener('pointerdown', () => { long = false; el.classList.add('press'); timer = setTimeout(() => { long = true; cancel(); this._moreInfo(id); }, 500); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => el.addEventListener(t, cancel));
      el.addEventListener('contextmenu', (ev) => { ev.preventDefault(); if (!long) this._moreInfo(id); long = true; });
      el.addEventListener('click', (e) => {
        if (long) { long = false; return; }
        if (e.target.closest('.mi2')) { if (lamp) this._hass.callService('light', 'toggle', { entity_id: id }); else this._coverToggle(id); return; }
        this._openSheet(lamp ? 'lt' : 'cv', id); this._roomBack = ri;
      });
    });
  }
  _updRoomSheet() {
    const B = this.$('rmB'); if (!B || this._cvHist) return;
    let rm = this._rooms()[this._roomIdx]; if (!rm) return;
    const n = rm.lights.length; let sum = [n ? (rm.on ? `${rm.on} ${rm.on === 1 ? 'lamp' : 'lampen'} aan` : 'lampen uit') : '', rm.covers.length ? (rm.covers.some((c) => c.pos < 99) ? (rm.covers.length === 1 ? `rolluik ${this._coverTxt(rm.covers[0])}` : `${rm.covers.filter((c) => c.pos < 99).length} rolluiken dicht`) : (rm.covers.length === 1 ? 'rolluik open' : 'rolluiken open')) : '', ...rm.apps.map((a) => a.k === 'evc' ? (a.box.classList.contains('evon') ? 'auto laadt' : 'auto aangesloten') : `${a.k === 'was' ? 'wasmachine' : a.k === 'dish' ? 'vaatwasser' : 'oven'} bezig`)].filter(Boolean); rm.sensors.filter((x) => x.alarm).forEach((x) => sum.unshift(x.txt.split(' · ')[0].toLowerCase())); sum = sum.join(' · ');
    this.$('rmN').textContent = rm.name; this.$('rmS').textContent = sum.charAt(0).toUpperCase() + sum.slice(1);
    // klimaat: thermostaat (zoals op Thuis) of de temperatuur van de sensor
    let clim = '';
    if (rm.r.climate) {
      const cl = this._state(this._climateId()), a = cl?.attributes || {}, tt = a.temperature != null ? `${fmt(a.temperature, 1)}°` : '—';
      const heating = isHeating(a), pre = this.$('tPre')?.querySelector('.pb .fi')?.outerHTML || '';
      clim = `<div class="tile mth kglass${heating ? ' hot' : cl?.state !== 'off' ? ' ok' : ''}" id="rmTh"><div class="mtop"><div class="mbig">${a.current_temperature != null ? `${fmt(a.current_temperature, 1)}<small>°</small>` : '—'}</div><div class="kpre">${pre}</div></div>
        <div class="mst"><span class="mic">${this.$('mIc')?.innerHTML || ''}</span><span>${cl?.state === 'off' ? 'Thermostaat uit' : heating ? `Verwarmt tot <b>${tt}</b>` : `Op temperatuur · <b>${tt}</b>`}</span></div>
        <div class="mstp"><button data-d="-1" aria-label="Lager">−</button><button data-d="1" aria-label="Hoger">+</button></div></div>`;
    } else if (rm.temp != null) {
      clim = `<div class="tile mth kglass" id="rmTh"><div class="mtop"><div class="mbig">${fmt(rm.temp, 1)}<small>°</small></div></div><div class="mst" style="color:var(--muted)">${rm.hum != null ? `<span>💧 ${fmt(rm.hum)}% vocht</span>` : '<span>Temperatuur</span>'}</div></div>`;
    }
    const own = rm.scenes.filter((x) => x.own), shown = this._rmAllSc ? rm.scenes : own;
    const recent = rm.on ? rm.scenes.reduce((m, x) => (x.t > (m?.t || 0) ? x : m), null) : null;
    // sensoren als pillen bovenaan, zoals op het Thuis-scherm
    const PILL = { leak: ['Watersensor', 'Geen water', 'Water!'], smoke: ['Rookmelder', 'In orde', 'Alarm!'], motion: ['Beweging', '', 'Nu'], door: ['Deur', 'Dicht', 'Open'], window: ['Raam', 'Dicht', 'Open'] };
    const phone = !!this._mq?.matches, pills = rm.sensors.map((x) => { const [lb, ok, on] = PILL[x.kind] || PILL.motion;
      const v = x.off ? 'Niet bereikbaar' : x.alarm ? (x.kind === 'smoke' && /kool/i.test(x.txt) ? 'CO-alarm!' : on) : x.warn ? 'Waarschuwing' : x.on ? on : x.kind === 'motion' ? x.txt.replace(/^Laatst /, '') : x.kind === 'smoke' && x.txt === 'Test bezig' ? 'Test' : ok;
      // bewegingssensor: ook licht (lux) en, als de kamer een thermostaat heeft, de eigen temperatuur
      // telefoon: licht als eigen pil direct na de beweging (luxwaarde als titel, maan als het donker is)
      const luxP = phone && x.kind === 'motion' && !x.off && x.lux != null
        ? `<div class="mp ksp" data-id="${x.luxId}"><i class="g">${RIC.svg(x.lux < 10 ? 'moon' : 'sun', 'on')}</i><div><b>${fmt(x.lux)} lux</b><span>${x.lux < 10 ? 'Donker' : x.lux < 100 ? 'Schemerig' : x.lux < 1000 ? 'Helder' : 'Zonnig'}</span></div></div>` : '';
      const extra = x.kind === 'motion' && !x.off ? [x.lux != null && !luxP ? `${fmt(x.lux)} lux` : '', x.tmp != null && rm.r.climate ? `${fmt(x.tmp, 1)}°` : ''].filter(Boolean).join(' · ') : '';
      const v2 = extra ? `${v} · ${extra}` : v;
      return `<div class="mp ksp${x.alarm ? ' alarm' : x.warn || (x.on && x.kind !== 'motion') ? ' warn' : x.on ? ' hot' : ''}" data-id="${x.id}"><i class="g">${SENS_ICON(x)}</i><div><b>${lb}</b><span>${v2}</span></div></div>${luxP}`; }).join('');
    const plugPills = (rm.plugs || []).map((x) => { const p = x.w != null && x.w >= 1 ? fmtPower(x.w) : null; return `<div class="mp ksp" data-plug="${x.id}"><i class="g">${RIC.svg('plug', x.on ? 'on' : 'off')}</i><div><b>${x.nm}</b><span>${x.on ? (p ? `${p.v} ${p.u}` : 'Aan') : 'Uit'}</span></div></div>`; }).join('');
    const camPills = (rm.cams || []).map((x) => `<div class="mp ksp${x.on ? ' hot' : ''}" data-id="${x.id}"><i class="g">${RIC.svg('camera', 'on')}</i><div><b>${rm.cams.length > 1 || !new RegExp(`^${rm.name}$`, 'i').test(x.nm) ? x.nm : 'Camera'}</b><span>${x.txt}</span></div></div>`).join('');
    const hasEv = (rm.r.apps || []).includes('evc'); if (hasEv) { rm = { ...rm, apps: rm.apps.filter((a) => a.k !== 'evc'), offApps: rm.offApps.filter((a) => a.k !== 'evc'), scenes: [] }; } // oprit: geen scènes
    const html = (plugPills + camPills + pills ? `<div class="kspills">${plugPills}${camPills}${pills}</div>` : '') + (clim ? `<div class="kth">Klimaat</div><div class="mrow">${clim}</div>` : '')
      + (n ? `<div class="kth">Lampen</div><div class="lights">${rm.lights.map((x) => this._ltTile(x)).join('')}</div>` : '')
      + (rm.covers.length ? `<div class="kth">${rm.covers.length > 1 ? 'Rolluiken' : 'Rolluik'}</div><div class="covers">${rm.covers.map((x) => this._cvTile(x)).join('')}</div>` : '')
      + this._evSection(rm)
      + (rm.apps.length || rm.offApps.length ? `<div class="kth">Apparaten</div>${rm.apps.length ? `<div class="mstack">${rm.apps.map((a) => `<div class="${a.box.className}" data-k="${a.k}">${a.box.innerHTML}</div>`).join('')}</div>` : ''}${rm.offApps.length ? `<div class="kglass klk koff"${rm.apps.length ? ' style="margin-top:10px"' : ''}>${rm.offApps.map((x) => `<div class="lk" data-id="${x.id}" data-k="${x.k}"><i>${RIC.svg(x.ic, 'off')}</i><div><b>${x.nm}</b><span>${x.txt}</span></div></div>`).join('')}</div>` : ''}` : '')
      + (rm.scenes.length ? `<div class="kth">Scènes</div><div class="ksc">${shown.map((x) => `<div class="mp${recent && x.id === recent.id && Date.now() - x.t < 12 * HOUR ? ' hot' : ''}" data-id="${x.id}" style="--c:#ffc83d"><b>${x.name}</b></div>`).join('')}${own.length < rm.scenes.length ? `<button class="kall">${this._rmAllSc ? 'Minder' : own.length ? 'Alle scènes ›' : 'Hue-scènes ›'}</button>` : ''}</div>` : '');
    if (html === this._rmKey) return;
    this._rmKey = html; B.innerHTML = html;
    const ri = this._roomIdx;
    this._bindTiles(B, ri);
    const th = B.querySelector('#rmTh');
    if (th && rm.r.climate) {
      th.querySelectorAll('.mstp button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this._tStep(+b.dataset.d); }));
      th.addEventListener('click', () => { this._openSheet('th'); this._roomBack = ri; });
    }
    B.querySelectorAll('.mstack .was').forEach((el) => el.addEventListener('click', () => el.dataset.k === 'evc' ? (this._closeSheet?.(), go({ dataset: { nav: NAV.auto } })) : this._appHistory(this._roomIdx, el.dataset.k)));
    B.querySelectorAll('.evb button, .evseg button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); if (!b.disabled) this._evAct(b.dataset.a); }));
    B.querySelector('.evsec .was')?.addEventListener('click', () => { this._closeSheet?.(); go({ dataset: { nav: NAV.auto } }); });
    B.querySelectorAll('.kspills .mp[data-plug]').forEach((el) => el.addEventListener('click', (e) => { e.stopImmediatePropagation(); this._hass.callService('switch', 'toggle', { entity_id: el.dataset.plug }); }, true));
    B.querySelectorAll('.klk.koff .lk').forEach((el) => el.addEventListener('click', (e) => { if (el.dataset.k && el.dataset.k !== 'evc') { e.stopImmediatePropagation(); this._appHistory(this._roomIdx, el.dataset.k); } }, true));
    B.querySelectorAll('.klk .lk, .kspills .mp').forEach((el) => el.addEventListener('click', () => el.dataset.k === 'evc' ? (this._closeSheet?.(), go({ dataset: { nav: NAV.auto } })) : this._moreInfo(el.dataset.id)));
    B.querySelectorAll('.ksc .mp').forEach((el) => el.addEventListener('click', () => { this._hass.callService('scene', 'turn_on', { entity_id: el.dataset.id }); el.classList.add('hot'); }));
    B.querySelector('.kall')?.addEventListener('click', () => { this._rmAllSc = !this._rmAllSc; this._rmKey = null; this._updRoomSheet(); });
  }
  // wie of wat een wijziging deed (logboekregel van die wijziging)
  _who(l) {
    if (!l) return '';
    const I = (bg, c, svg) => `<i style="background:${bg};color:${c}"><svg viewBox="0 0 24 24">${svg}</svg></i>`;
    const ce = l.context_entity_id || '', nm = l.context_entity_id_name || l.context_name || ce.split('.')[1]?.replace(/_/g, ' ') || '';
    if (/^(automation|script)\./.test(ce)) return `<span class="hwho">${I('rgba(185,162,255,.2)', '#b9a2ff', '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>')}Automatisering · ${nm}</span>`;
    if (/^scene\./.test(ce) || l.context_domain === 'scene') return `<span class="hwho">${I('rgba(127,209,139,.2)', '#7fd18b', '<path d="M12 2l2.6 6.4L21 9l-5 4.4L17.5 20 12 16.6 6.5 20 8 13.4 3 9l6.4-.6z"/>')}Scène · ${nm.replace(/^scene /, '')}</span>`;
    if (l.context_user_id) {
      const ps = this._config.persons || [], hit = ps.find((p) => this._state(p.entity)?.attributes.user_id === l.context_user_id);
      if (hit) { const pic = hit.picture || this._state(hit.entity)?.attributes.entity_picture; return `<span class="hwho"><i style="${pic ? `background-image:url('${pic}')` : ''}">${pic ? '' : (hit.name || '?')[0]}</i>${hit.name}</span>`; }
      return `<span class="hwho">${l.context_user_id === this._hass.user?.id ? 'Door jou' : 'Door een gebruiker'}</span>`;
    }
    if (l.context_event_type === 'homekit_state_change' || l.context_domain === 'homekit') return `<span class="hwho">${I('rgba(143,198,255,.2)', '#8fc6ff', '<path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm-7 9h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.9V21h-2v-3.1A7 7 0 0 1 5 11z"/>')}Via Apple Woning</span>`;
    if (l.context_event_type === 'call_service') return '<span class="hwho">Via Home Assistant</span>';
    return `<span class="hwho">${I('rgba(230,199,156,.2)', '#e6c79c', '<path d="M12 2a1.5 1.5 0 0 1 1.5 1.5V11h1V5a1.5 1.5 0 0 1 3 0v6h.5V8a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-14 0v-3a1.5 1.5 0 0 1 3 0v1h.5V4a1.5 1.5 0 0 1 3 0v7h.5V3.5A1.5 1.5 0 0 1 12 2z"/>')}Handmatig</span>`;
  }
  // geschiedenis van een hele kamer: alle lampen en rolluiken, met wie of wat
  async _roomHistory(i) {
    const rm = this._rooms()[i], body = this.$('shBody'); if (!rm) return;
    this._cvHist = true;
    body.innerHTML = `<div class="hh"><button id="hBack"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>${rm.name}</button></div>
      <div class="hti"><b>Geschiedenis</b><span>Afgelopen 3 dagen</span></div><div id="hBody"><div class="hnone">Laden…</div></div>`;
    this.$('hBack').addEventListener('click', () => this._openSheet('room', i));
    const ids = [...rm.lights.map((x) => x.entity_id), ...rm.covers.map((x) => x.id)];
    const log = ids.length ? await this._hass.callApi('GET', `logbook/${new Date(Date.now() - 3 * DAY).toISOString()}?entity=${ids.join(',')}&end_time=${encodeURIComponent(new Date().toISOString())}`).catch(() => []) : [];
    if (this._sheet !== 'room' || !this._cvHist) return;
    const UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
    const DN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
    const day0 = startOfDay(Date.now()), dname = (t) => { const k = Math.round((day0 - startOfDay(t)) / DAY); return k === 0 ? 'Vandaag' : k === 1 ? 'Gisteren' : new Date(t).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }); };
    const ALL = (Array.isArray(log) ? log : []).map((l) => ({ ...l, t: Date.parse(l.when) }));
    // eindstand zonder bron (bv. rolluik meldt zelf "dicht"): de bron van de opdracht ervoor (tot 5 min) gebruiken
    const hasSrc = (x) => x.context_user_id || x.context_entity_id || x.context_event_type === 'call_service' || x.context_domain === 'homekit' || x.context_event_type === 'homekit_state_change';
    const src = (l) => hasSrc(l) ? l : ALL.filter((x) => x.entity_id === l.entity_id && x.t <= l.t && x.t >= l.t - 5 * 60000 && hasSrc(x)).sort((a, b) => b.t - a.t)[0] || l;
    const L = ALL.filter((l) => ['on', 'off', 'open', 'closed'].includes(l.state)).sort((a, b) => b.t - a.t).slice(0, 120);
    let last = '', rows = '';
    for (const l of L) {
      const dn = dname(l.t); if (dn !== last) { rows += `<div class="hday">${dn}</div>`; last = dn; }
      const lamp = l.entity_id.startsWith('light.'), nm = lamp ? this._shortName(this._nm(l.entity_id) || l.name || '') : (l.name || '').replace(/^Rolluik /, '');
      const ico = lamp ? `<i class="hico lmp${l.state === 'on' ? ' on' : ''}">${MBULB}</i>` : `<i class="hico${l.state === 'closed' ? ' dn' : ''}">${l.state === 'closed' ? DN : UP}</i>`;
      const txt = lamp ? (l.state === 'on' ? 'Aan' : 'Uit') : l.state === 'open' ? 'Open' : 'Dicht';
      rows += `<div class="hrow"><div class="hline">${ico}</div><div class="htx"><b>${txt} <em class="hnm">· ${nm}</em></b>${this._who(src(l))}</div><div class="htm">${fmtTime(l.t)}</div></div>`;
    }
    this.$('hBody').innerHTML = rows || '<div class="hnone">Geen wijzigingen in de afgelopen 3 dagen</div>';
  }

  // geschiedenis van een apparaat: elke keer dat het aan het werk was, met programma, duur en afloop (7 dagen)
  _appOpen(k) {
    const ri = this._rooms().findIndex((r) => (r.r.apps || []).includes(k));
    const c = this._config, id = k === 'was' ? c.washer : `sensor.${c[k === 'dish' ? 'dishwasher' : 'oven']}_status`;
    if (ri < 0) return this._moreInfo(id);
    if (this._sheet !== 'room' || this._roomIdx !== ri) this._openSheet('room', ri);
    setTimeout(() => this._appHistory(ri, k), 60);
  }
  async _appHistory(i, k) {
    const rm = this._rooms()[i], body = this.$('shBody'), c = this._config; if (!rm) return;
    this._cvHist = true;
    const NM = { was: 'Wasmachine', dish: 'Vaatwasser', oven: 'Oven' }[k];
    const sid = k === 'was' ? c.washer : `sensor.${c[k === 'dish' ? 'dishwasher' : 'oven']}_status`;
    const pid = k === 'was' ? `${c.washer}_programma` : `select.${c[k === 'dish' ? 'dishwasher' : 'oven']}_actieve_programma`;
    const tid = k === 'was' ? `${c.washer}_temperatuur` : null;
    body.innerHTML = `<div class="hh"><button id="hBack"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>${rm.name}</button></div>
      <div class="hti"><b>${NM}</b><span>Afgelopen 7 dagen</span></div><div id="hBody"><div class="hnone">Laden…</div></div>`;
    this.$('hBack').addEventListener('click', () => { this._cvHist = false; this._rmKey = null; this._openSheet('room', i); });
    const from = new Date(Date.now() - 7 * DAY).toISOString(), end = encodeURIComponent(new Date().toISOString());
    const ids = [sid, pid, tid].filter((x) => x && this._state(x));
    const log = await this._hass.callApi('GET', `logbook/${from}?entity=${ids.join(',')}&end_time=${end}`).catch(() => []);
    if (this._sheet !== 'room' || !this._cvHist) return;
    const L = (Array.isArray(log) ? log : []).map((l) => ({ ...l, t: Date.parse(l.when) })).sort((a, b) => a.t - b.t);
    const RUN = /^(in_use|run|running|pause|rinse_hold)$/, OK = /^(finished|program_ended|end)$/, BAD = /^(aborting|program_interrupted|failure|error)$/;
    const progAt = (t) => { const p = [...L].reverse().find((x) => x.entity_id === pid && x.t <= t + 3 * 60000 && !/^(no_program|unknown|unavailable)$/.test(x.state)); if (!p) return '';
      const map = k === 'was' ? WPROG : k === 'dish' ? DISH_PROG : OVEN_PROG; const key = Object.keys(map).find((x) => p.state === x || p.state.endsWith(x)); return key ? map[key] : p.state.replace(/^.*program_/, '').replace(/_/g, ' '); };
    const tempAt = (t) => { if (!tid) return ''; const p = [...L].reverse().find((x) => x.entity_id === tid && x.t <= t + 10 * 60000 && !isNaN(parseFloat(x.state))); return p ? `${fmt(parseFloat(p.state))}°` : ''; };
    const sessions = []; let cur = null;
    for (const l of L.filter((x) => x.entity_id === sid)) {
      if (RUN.test(l.state)) { if (!cur) cur = { t0: l.t }; }
      else if (cur) { sessions.push({ ...cur, t1: l.t, res: OK.test(l.state) ? 'ok' : BAD.test(l.state) ? 'bad' : 'ok' }); cur = null; }
    }
    if (cur) sessions.push({ ...cur, t1: null, res: 'run' });
    const day0 = startOfDay(Date.now()), dname = (t) => { const k2 = Math.round((day0 - startOfDay(t)) / DAY); return k2 === 0 ? 'Vandaag' : k2 === 1 ? 'Gisteren' : new Date(t).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }); };
    const dur = (m) => m >= 60 ? `${Math.floor(m / 60)} u ${m % 60} min` : `${m} min`;
    const ic = `<i class="hico app">${k === 'was' ? washSvg(0) : k === 'dish' ? dishSvg(false) : ovenSvg('', null)}</i>`;
    let last = '', rows = '';
    for (const x of sessions.reverse().filter((x) => !x.t1 || x.t1 - x.t0 > 60000).slice(0, 40)) {
      const dn = dname(x.t0); if (dn !== last) { rows += `<div class="hday">${dn}</div>`; last = dn; }
      const pr = [progAt(x.t0), tempAt(x.t0)].filter(Boolean).join(' · ') || NM;
      const m = x.t1 ? Math.round((x.t1 - x.t0) / 60000) : null;
      const st = x.res === 'run' ? '<span class="hwho hrun">Bezig</span>' : x.res === 'bad' ? '<span class="hwho hbad">Afgebroken</span>' : `<span class="hwho">Klaar · ${dur(m)}</span>`;
      rows += `<div class="hrow"><div class="hline">${ic}</div><div class="htx"><b>${pr}</b>${st}</div><div class="htm">${fmtTime(x.t0)}${x.t1 ? `–${fmtTime(x.t1)}` : ''}</div></div>`;
    }
    this.$('hBody').innerHTML = rows || `<div class="hnone">${NM} is de afgelopen 7 dagen niet gebruikt</div>`;
  }

  /* ---------- paneel Aanwezigheid: kaart met avatars, status per persoon en tijdlijn ---------- */
  _pplList() {
    const home = this._state('zone.home')?.attributes || {};
    const km = (a, b) => { if (a?.latitude == null || b?.latitude == null) return null; const R = 6371, r = (x) => x * Math.PI / 180, dLa = r(b.latitude - a.latitude), dLo = r(b.longitude - a.longitude);
      const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
    return (this._config.persons || []).filter((p) => p.entity).map((p) => {
      const st = this._state(p.entity), s = st?.state || 'unknown', a = st?.attributes || {};
      const zone = s === 'home' ? 'Thuis' : s === 'not_home' ? 'Weg' : s === 'unknown' || s === 'unavailable' ? 'Onbekend' : (this._nm(`zone.${s}`) || s);
      const d = s === 'not_home' ? km(a, home) : null;
      return { ...p, st, s, zone, home: s === 'home', dist: d, pic: p.picture || a.entity_picture || '', since: st ? Date.parse(st.last_changed) : null };
    });
  }
  _pplSince(t) {
    if (!t) return '';
    const day0 = startOfDay(Date.now()), k = Math.round((day0 - startOfDay(t)) / DAY);
    return `sinds ${k === 0 ? '' : k === 1 ? 'gisteren ' : new Date(t).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '') + ' '}${fmtTime(t)}`;
  }
  _updPplSheet() {
    const ps = this._pplList(), n = ps.filter((p) => p.home).length;
    const sum = !ps.length ? '' : n === ps.length ? (ps.length > 1 ? 'Iedereen thuis' : `${ps[0].name} thuis`) : n === 0 ? (ps.length > 1 ? 'Niemand thuis' : `${ps[0].name} weg`) : ps.map((p) => `${p.name} ${p.home ? 'thuis' : p.s === 'not_home' ? 'weg' : p.s === 'unknown' || p.s === 'unavailable' ? 'onbekend' : /^werk$/i.test(p.zone) ? 'op werk' : `bij ${p.zone}`}`).join(' · ');
    const set = (id, h) => { const el = this.$(id); if (el && el.innerHTML !== h) el.innerHTML = h; };
    set('pplS', sum);
    const col = (p) => (p.home ? '#3ddc97' : p.s === 'not_home' ? '#8fa6c8' : '#7cb6ff');
    set('pplWho', ps.map((p, i) => `<div class="pc" data-i="${i}" style="--c:${col(p)}"><div class="pav" style="${p.pic ? `background-image:url('${p.pic}')` : ''}">${p.pic ? '' : (p.name || '?')[0]}</div><div><b>${p.name}</b><span>${p.zone}${p.dist != null ? ` · ${fmt(p.dist, p.dist < 10 ? 1 : 0)} km` : ''}</span><em>${this._pplSince(p.since)}</em></div></div>`).join(''));
    this.$('pplWho')?.querySelectorAll('.pc').forEach((el) => { el.onclick = () => this._moreInfo(ps[+el.dataset.i].entity); });
    if (this._pplMapEl) { this._pplMapEl.hass = this._hass; this._pplMarkers(); }
  }
  async _pplMap() {
    const box = this.$('pplMap'); if (!box || !window.loadCardHelpers) return;
    try {
      const helpers = await window.loadCardHelpers();
      const ents = [...this._pplList().map((p) => p.entity), ...(this._state('zone.home') ? ['zone.home'] : [])];
      const el = helpers.createCardElement({ type: 'map', entities: ents, theme_mode: 'dark', hours_to_show: 0, aspect_ratio: '70%', default_zoom: 14, cluster: false });
      // pins van Home Assistant: rond, zonder donkere achtergrond en zonder staartje (via de thema-variabelen van de kaart)
      [['--ha-picture-border-radius', '50%'], ['--ha-marker-background', 'transparent'], ['--ha-marker-color', 'transparent'], ['--ha-marker-size', '44px'], ['--ha-cluster-shadow', 'drop-shadow(0 4px 10px rgba(0,0,0,.55))']].forEach(([k, v]) => el.style.setProperty(k, v));
      el.hass = this._hass;
      if (this._sheet !== 'ppl' || !this.$('pplMap')) return;
      this.$('pplMap').replaceChildren(el); this._pplMapEl = el; this._pplMarkers();
    } catch (e) { console.warn('thuis-card: kaart laden mislukt', e); }
  }
  // per persoon de kleur van de rand (thuis groen, weg grijsblauw, andere zone blauw) via de 'parts' van de kaart
  _pplMarkers(tries = 0) {
    const el = this._pplMapEl, root = el?.shadowRoot;
    if (!root) { if (tries < 40) setTimeout(() => this._pplMarkers(tries + 1), 250); return; }
    const ps = this._pplList();
    const css = 'ha-map::part(marker){border-radius:50%!important;background:transparent!important;border-width:3px!important}'
      + ps.map((p) => `ha-map::part(marker-${p.entity.replace('.', '-')}){border-color:${p.home ? '#3ddc97' : p.s === 'not_home' ? '#8fa6c8' : '#7cb6ff'}!important}`).join('');
    let st = root.getElementById('tp-pins');
    if (!st) { st = document.createElement('style'); st.id = 'tp-pins'; root.appendChild(st); }
    if (st.textContent !== css) st.textContent = css;
    // personen hebben in Home Assistant geen foto: onze avatar op de pin zetten (ook als de kaart pins opnieuw maakt)
    const byId = Object.fromEntries(ps.filter((p) => p.pic).map((p) => [p.entity, p.pic]));
    const roots = [], walk = (n) => { if (!n) return; if (n.shadowRoot) { roots.push(n.shadowRoot); walk(n.shadowRoot); } for (const c of n.children || []) walk(c); };
    walk(el);
    let found = 0;
    for (const r of roots) r.querySelectorAll('ha-entity-marker').forEach((m) => {
      const pic = byId[m.entityId || m.getAttribute('entity-id')]; if (!pic) return; found++;
      if (m.entityPicture !== pic) { m.entityPicture = pic; m.setAttribute('entity-picture', pic); }
    });
    clearTimeout(this._pplPicT);
    if (this._sheet === 'ppl' && this._pplMapEl === el) this._pplPicT = setTimeout(() => this._pplMarkers(tries + 1), found ? 1500 : 250);
  }
  async _pplLog() {
    const ps = this._pplList(), box = this.$('pplTl'); if (!box || !ps.length) return;
    const now = Date.now(), from = new Date(now - 7 * DAY).toISOString();
    const log = await this._hass.callApi('GET', `logbook/${from}?entity=${ps.map((p) => p.entity).join(',')}&end_time=${encodeURIComponent(new Date(now).toISOString())}`).catch(() => []);
    if (this._sheet !== 'ppl' || !this.$('pplTl')) return;
    const byId = Object.fromEntries(ps.map((p) => [p.entity, p]));
    const day0 = startOfDay(now), dname = (t) => { const k = Math.round((day0 - startOfDay(t)) / DAY); return k === 0 ? 'Vandaag' : k === 1 ? 'Gisteren' : new Date(t).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }); };
    const L = (Array.isArray(log) ? log : []).filter((l) => byId[l.entity_id] && l.state && !['unknown', 'unavailable'].includes(l.state)).map((l) => ({ ...l, t: Date.parse(l.when) })).sort((a, b) => b.t - a.t).slice(0, 60);
    let last = '', rows = '';
    for (const l of L) {
      const p = byId[l.entity_id], dn = dname(l.t), home = l.state === 'home', away = l.state === 'not_home';
      if (dn !== last) { rows += `<div class="hday">${dn}</div>`; last = dn; }
      const zn = home ? 'Thuis' : away ? 'Weg' : (this._nm(`zone.${l.state}`) || l.state);
      const txt = home ? `${p.name} is thuisgekomen` : away ? `${p.name} is weggegaan` : `${p.name} is bij ${zn}`;
      const c = home ? '#3ddc97' : away ? '#8fa6c8' : '#7cb6ff';
      rows += `<div class="pev" style="--c:${c}"><div class="pav" style="${p.pic ? `background-image:url('${p.pic}')` : ''}">${p.pic ? '' : (p.name || '?')[0]}</div><div class="pt"><b>${txt}</b><span>${fmtTime(l.t)}</span></div><span class="ptag">${zn.toLowerCase()}</span></div>`;
    }
    this.$('pplTl').innerHTML = rows || '<div class="hnone">Geen wijzigingen in de afgelopen 7 dagen</div>';
  }

  _updPills() {
    const c = this._config;
    const lights = this._lightIds().map((id) => this._state(id)).filter(Boolean), lOn = lights.filter((s) => s.state === 'on').length;
    const covers = this._coverIds().map((id) => this._state(id)), cDown = covers.filter((s) => (s.attributes.current_position ?? (s.state === 'closed' ? 0 : 100)) < 99).length;
    const pvS = this._state(c.solar_power), pvV = parseFloat(pvS?.state), pv = isNaN(pvV) ? null : /kw/i.test(pvS.attributes.unit_of_measurement || '') ? pvV * 1000 : pvV;
    const rain = (this._rainSoon() || '').replace(/<[^>]+>/g, ''), rm = rain.match(/Regen over (\d+) min/), rNow = /regent nu/.test(rain);
    const P = (k, col, ic, t, v, hot) => `<div class="mp${hot ? ' hot' : ''}" data-k="${k}" style="--c:${col}"><i class="g">${ic}</i><div><b>${t}</b><span>${v}</span></div></div>`;
    const pw = pv == null ? '—' : (() => { const f = fmtPower(pv); return `${f.v} ${f.u}`; })();
    const u = (id, st = '') => `<svg viewBox="0 0 100 100" style="${st}"><use href="#${id}"/></svg>`;
    const minPos = covers.reduce((m, s) => Math.min(m, s.attributes.current_position ?? (s.state === 'closed' ? 0 : 100)), 100);
    const night = this._state('sun.sun')?.state === 'below_horizon';
    const car = parseFloat(this._state(c.car_battery)?.state), chg = /charg|laden|laadt/i.test(this._state(c.car_charging)?.state || '');
    const html = (rNow || rm ? P('rain', '#38bdf8', u(rNow ? 'wRain' : 'gDrop'), rNow ? 'Het regent' : 'Regen', rNow ? 'nu' : `over ${rm[1]} min`, 1) : '')
      + (lights.length ? P('bed', '#ffc83d', gBulb(lOn > 0), 'Lampen', lOn ? `${lOn} aan` : 'alles uit', lOn > 0) : '')
      + (covers.length ? P('bed', '#5aa2ff', gBlind(minPos), 'Rolluiken', cDown ? `${cDown} dicht` : 'alles open', cDown > 0) : '')
      + P('nu', 'var(--sun)', pv > 5 ? u('gSun') : night ? u('wNight') : RIC.svg('sun', 'off'), 'Zon', pv > 5 ? pw : 'geen opwek', pv > 5)
      + (!isNaN(car) ? P('auto', '#5ee1d0', RIC.svg('car', chg ? 'teal' : 'on'), 'Auto', `${Math.round(car)}%${chg ? ' · laadt' : ''}`, chg) : '');
    if (html === this._pillKey) return;
    this._pillKey = html;
    const box = this.$('mPills');
    box.innerHTML = html;
    box.querySelectorAll('.mp').forEach((el) => el.addEventListener('click', () => {
      const k = el.dataset.k;
      if (k === 'bed') this.$('bedTile').scrollIntoView({ behavior: 'smooth', block: 'start' });
      else if (k === 'nu') this.shadowRoot.querySelector(`.xtabs [data-nav="${NAV.nu}"]`)?.click();
      else if (k === 'auto') go({ dataset: { nav: NAV.auto } });
      else this._moreInfo(c.rain_now);
    }));
  }
}

customElements.define('thuis-card', ThuisCard);
// tabblad Kamers: dezelfde kaart in kamers-modus (deelt tegels, panelen en gegevens met Thuis)
class KamersCard extends ThuisCard {
  constructor() { super(); this._kmode = true; }
  getCardSize() { return 10; }
}
customElements.define('kamers-card', KamersCard);
window.customCards.push({ type: 'kamers-card', name: 'Kamers', description: 'Alle kamers per verdieping met lampen, rolluiken, temperatuur en apparaten' });
window.customCards.push({ type: 'thuis-card', name: 'Thuis', description: 'Startscherm: aanwezigheid, thermostaat, weer, camera’s, verlichting en afval' });
