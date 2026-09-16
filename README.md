# waha-bot

Bot de WhatsApp sobre [WAHA](https://waha.devlike.pro/) (WhatsApp HTTP API).
Recibe mensajes por webhook, los rutea a un *intent* y responde consultando una API externa.

Hoy sabe una sola cosa: **cuándo juega Boca**.

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

## La API de fútbol

Los partidos **futuros** de la liga argentina no están en ningún feed gratuito y abierto,
así que el servicio soporta dos proveedores y se elige con `FOOTBALL_PROVIDER`:

| Proveedor | Variable | Partidos futuros | Notas |
|---|---|---|---|
| `api-football` | `APIFOOTBALL_KEY` | sí | Registro gratis, 100 requests/día. Verificá que tu plan cubra la temporada actual. |
| `thesportsdb` (premium) | `SPORTSDB_KEY` | sí | Key paga, usa la API v2. |
| `thesportsdb` (free, default) | `SPORTSDB_KEY=3` | **no** | Sin registro. Sólo sirve para resultados ya jugados. |

Con el default (`3`) el bot funciona pero responde que no hay fecha confirmada y muestra
el último resultado. Para respuestas útiles, poné una `APIFOOTBALL_KEY` en el `.env`.

Las respuestas se cachean 10 minutos (`FOOTBALL_CACHE_MINUTES`) para no gastar cuota.

## Seguridad

- `WAHA_API_KEY` protege la API de WAHA; sin ella cualquiera en tu red puede mandar mensajes desde tu WhatsApp.
- `WEBHOOK_HMAC_KEY` hace que el bot verifique la firma de cada webhook y rechace lo que no venga de WAHA.
- `ALLOWED_NUMBERS` limita a quién le contesta. Vacío = a cualquiera que le escriba.
- Los grupos se ignoran salvo que pongas `REPLY_IN_GROUPS=true`.

## Estructura

```
src/
├── index.js                    servidor Express + webhook
├── config.js                   configuración desde variables de entorno
├── filters.js                  firma HMAC y qué mensajes se ignoran
├── waha.js                     cliente de WAHA (sendText, seen, typing)
├── router.js                   intents y formato de las respuestas
└── services/football/
    ├── index.js                elige proveedor + caché
    ├── normalize.js            forma común de un partido
    ├── apifootball.js
    └── thesportsdb.js
test/                           node --test
```

## Agregar un intent nuevo

En `src/router.js`, sumá una entrada al array `INTENTS`:

```js
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
