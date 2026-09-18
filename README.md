# waha-bot

Bot de WhatsApp sobre [WAHA](https://waha.devlike.pro/) (WhatsApp HTTP API).
Recibe mensajes por webhook, los rutea a un *intent* y responde consultando una API externa.

Sabe **cuándo juega Boca**, **cómo forma**, el **historial de enfrentamientos** y te avisa solo el día del partido.

```
⚽ Próximo partido de Boca Juniors

Boca Juniors vs River Plate
🏆 Argentinian Primera Division — fecha 12
📅 Domingo, 20 de septiembre a las 20:30 hs
🏟 La Bombonera
⏳ Faltan 4 días y 9 h
```

## Cómo funciona

```
WhatsApp ──► WAHA (Docker, :3000) ──webhook──► bot (Node, :3001)
                  ▲                                  │
                  └──────── POST /api/sendText ──────┘
                                                     │
                                          API de fútbol (HTTP)
```

## Puesta en marcha

```bash
cp .env.example .env     # y editá las claves
npm install
npm run waha:up          # levanta WAHA en Docker
npm run dev              # levanta el bot
```

Está escrito en TypeScript y corre con [tsx](https://github.com/privatenumber/tsx) directo
sobre los `.ts` (sin paso de build). `npm run typecheck` corre `tsc` sólo para chequear
tipos.

Después, vinculá tu WhatsApp:

1. Abrí el dashboard de WAHA: http://localhost:3000/dashboard (usuario/clave del `.env`).
2. Inicia la sesión `default` y escaneá el QR desde *Dispositivos vinculados* en tu teléfono.
3. Mandale un mensaje al número vinculado: *"cuándo juega Boca?"*.

> Usá un número secundario. WhatsApp puede banear cuentas por uso automatizado;
> WAHA es un cliente no oficial.

Para verificar que el bot está vivo sin usar WhatsApp:

```bash
curl -s localhost:3001/health
```

Y para simular un mensaje entrante (con el bot corriendo):

```bash
curl -X POST localhost:3001/webhook -H 'Content-Type: application/json' -d '{"event":"message","payload":{"id":"x","from":"5491122334455@c.us","fromMe":false,"body":"cuando juega boca?"}}'
```

## De dónde salen los partidos

Los partidos **futuros** de la liga argentina no están en ningún feed gratuito y abierto,
así que el servicio soporta varios proveedores y se elige con `FOOTBALL_PROVIDER`:

| Proveedor | Variable | Partidos futuros | Notas |
|---|---|---|---|
| `promiedos` (default sin key) | `PROMIEDOS_TEAM_ID` | sí | Gratis y sin registro, pero es scraping. |
| `api-football` | `APIFOOTBALL_KEY` | sí | Registro gratis, 100 requests/día. Verificá que tu plan cubra la temporada actual. |
| `thesportsdb` (premium) | `SPORTSDB_KEY` | sí | Key paga, usa la API v2. |
| `thesportsdb` (free) | `SPORTSDB_KEY=3` | **no** | Sin registro. Sólo sirve para resultados ya jugados. |

Con `auto` (el default) se usa api-football si hay `APIFOOTBALL_KEY`, y si no Promiedos.
Las respuestas se cachean 10 minutos (`FOOTBALL_CACHE_MINUTES`) para no gastar cuota
ni golpear el sitio de más.

### Promiedos

Promiedos no tiene API pública: la interna (`api.promiedos.com.ar`) responde `{}` sin
credenciales. Lo que sí es público es el JSON que el sitio ya renderiza en la página del
equipo, dentro del `<script id="__NEXT_DATA__">` de Next.js. De ahí salen próximos
partidos, últimos resultados, ronda, horario en hora argentina y el estadio cuando juega
de local, todo en un pedido de ~17 KB (gzip).

```
https://www.promiedos.com.ar/team/x/igg
                                  ↑  ↑
                              slug   id del equipo (el slug no se valida)
```

El `id` sale de la URL del equipo en el sitio (`/team/boca-juniors/igg` → `igg`) y se
configura con `PROMIEDOS_TEAM_ID`.

La ficha de cada partido (`/game/x/{id}`) agrega formaciones, bajas, árbitro, TV, la
liga real —la página del equipo no la trae, por eso los partidos de copa salen sin el
`🏆` hasta que se consulta la ficha— y el historial de los últimos enfrentamientos entre
los dos equipos.

Para datos de fútbol argentino es lo más confiable que hay gratis —es la fuente que mira
todo el mundo acá, con horarios y reprogramaciones al día—, pero tiene la contra de todo
scraping:

- No hay contrato ni SLA: si cambian la página, el parseo se rompe (los tests de
  `test/promiedos.test.ts` usan un HTML de ejemplo, así que **no** te vas a enterar por
  ahí; te enterás cuando el bot conteste mal).
- Es uso no previsto del sitio. Mantené el caché alto, no lo consultes en loop y no lo
  uses para nada masivo.
- No expone la liga de cada partido, sólo la principal del equipo: los partidos de copa
  salen sin el `🏆`.

Si querés algo que no dependa de que no toquen el HTML, poné una `APIFOOTBALL_KEY`:
es un contrato real, con versionado y soporte, a cambio de registrarte y de un límite
de 100 requests por día.

## Avisos automáticos

Además de contestar, el bot puede escribir primero. Con `NOTIFY_TO` cargado manda hasta
tres mensajes por partido:

1. **El día del partido**, a la hora que digas (`NOTIFY_MATCH_DAY_AT`, default 09:00):
   horario, cancha, TV y árbitro.
2. **El historial de enfrentamientos**, junto con el aviso anterior (sólo con Promiedos).
3. **Un rato antes** (`NOTIFY_LINEUP_MINUTES`, default 60): la formación, apenas
   Promiedos la publica. Si todavía no salió, reintenta en cada vuelta hasta 15 minutos
   después del inicio; si nunca sale, no manda nada.

```bash
NOTIFY_TO=5491122334455          # o el id de un grupo: 1234567890-1234567890@g.us
NOTIFY_MATCH_DAY_AT=09:00
NOTIFY_LINEUP_MINUTES=60
NOTIFY_POLL_MINUTES=5            # cada cuánto revisa
```

Ejemplos reales:

```
📣 *Hoy juega Flamengo*

*Flamengo vs Independiente Del Valle*
🏆 CONMEBOL Copa Libertadores
🕒 21:30 hs
🏟 Estadio Jornalista Mário Filho (Maracanã)
📺 Fox Sports, Disney+ Premium
👨‍⚖️ Andrés Matonte
```

```
📋 *Formación confirmada*
Boca Juniors vs Instituto — 20:00 hs

*Boca Juniors* — 4-1-2-1-2
1 Marchesín, 3 Blanco, 32 Costa, 2 Di Lollo, 23 Weigandt, 5 Paredes (C), 21 Herrera, 18 Delgado, 36 Aranda, 16 Merentiel, 28 Bareiro
DT: Claudio Úbeda

*Instituto* — 3-4-3
28 Roffo, 6 Alarcón (C), 26 Mosevich, 22 Massaccesi, 3 Sosa, 19 Lodico, 55 Abregú, 44 Cerato, 10 Luna, 11 Fonseca, 20 Cordoba
DT: Diego Flores

🤕 Bajas Boca Juniors: Ascacibar, Belmonte, Zeballos, Giménez, Cavani y 2 más
```

Lo ya enviado se guarda en `.state/notifications.json`, así que reiniciar el bot no
repite el aviso. El chequeo corre cada 5 minutos y sale a la red sólo si hay algo para
mandar (el resto lo resuelve el caché).

Dos detalles que conviene saber:

- **Las formaciones sólo las trae Promiedos.** Con `api-football` o TheSportsDB el aviso
  del día del partido funciona igual, pero el de la formación no se manda nunca.
- **WhatsApp no sabe que es un bot.** Mandar mensajes no solicitados desde una cuenta
  personal es justo lo que WhatsApp mira para banear: avisale a poca gente y no lo
  conviertas en una lista de difusión.

## Seguridad

- `WAHA_API_KEY` protege la API de WAHA; sin ella cualquiera en tu red puede mandar mensajes desde tu WhatsApp.
- `WEBHOOK_HMAC_KEY` hace que el bot verifique la firma de cada webhook y rechace lo que no venga de WAHA.
- `ALLOWED_NUMBERS` limita a quién le contesta. Vacío = a cualquiera que le escriba.
- Los grupos se ignoran salvo que pongas `REPLY_IN_GROUPS=true`.

## Estructura

```
src/
├── index.ts                    servidor Express + webhook
├── config.ts                   configuración desde variables de entorno
├── filters.ts                  firma HMAC y qué mensajes se ignoran
├── waha.ts                     cliente de WAHA (sendText, seen, typing)
├── notifier.ts                 avisos automáticos (día del partido, historial y formación)
├── router.ts                   intents y formato de las respuestas
├── types/express.d.ts          augmenta Request con rawBody (firma HMAC)
└── services/football/
    ├── index.ts                elige proveedor + caché
    ├── types.ts                tipos compartidos (Match, MatchDetails, FootballProvider...)
    ├── normalize.ts            forma común de un partido
    ├── promiedos.ts            scraping del __NEXT_DATA__ de promiedos.com.ar
    ├── apifootball.ts
    └── thesportsdb.ts
test/                           tsx --test
```

## Agregar un intent nuevo

En `src/router.ts`, sumá una entrada al array `INTENTS`:

```ts
{
  name: 'clima',
  test: (t) => /clima|temperatura/.test(t),   // t viene en minúsculas y sin acentos
  run: async () => '🌤 Hoy 22°',
}
```

El primero que matchea gana; si no matchea ninguno se manda la ayuda.
La lógica de red va en `src/services/`, no en el router.

## Tests

```bash
npm test
```
