# MiroTalk SFU → Coolify

## Важно

Стек **собирается из Dockerfile** (не `mirotalk/sfu:latest`), чтобы подтянуть русский лендинг.
После деплоя при «старых» текстах — очисти `sessionStorage` сайта (ключ `brandData`) или открой в приватном окне.

## Деплой

1. Залей этот репозиторий в Git (GitHub/GitLab/и т.д.).
2. Coolify → **New Resource** → репозиторий → Build Pack: **Docker Compose**.
3. **Docker Compose Location:** `/docker-compose.yaml` (именно `.yaml`).
4. **Base Directory:** `/`
5. После пуша compose: в Coolify нажми **Reload Compose File** / Save — иначе может остаться пустой `services: {}` → ошибка `no service selected`.
6. Continue → в Environment Variables заполни:

| Переменная | Значение |
|---|---|
| `SFU_ANNOUNCED_IP` | Публичный **IPv4** сервера Coolify |
| `SERVER_HOST_URL` | `https://meet.твой-домен.ru` (без `:3010`) |
| `SFU_NUM_WORKERS` | `4` (или по числу ядер, но не оставляй пустым) |
| `UI_LANGUAGE` | `ru` |
| `APP_NAME` | Название, например `ОПТ РФ Миро` |

7. У сервиса `mirotalksfu` домен **строго** так: `https://meet.твой-домен.ru:3010`  
   (`:3010` = порт внутри контейнера; снаружи 443 через Traefik).  
   Без `:3010` Traefik стучится в 80 → сайт «не стартует».
8. Deploy. Если в логах `ECONNRESET` каждые 30с — это healthcheck/proxy, не падение приложения.

### Если деплой: `no service selected`

Coolify уже мог остановить старый контейнер, а новый не поднять.

1. Убедись, что в Git на `main` свежий `docker-compose.yaml` (без `${VAR:?}` и без кириллицы/`<br />` в defaults).
2. В ресурсе Coolify → **Reload Compose File** → проверь, что сервис `mirotalksfu` виден.
3. Redeploy.

Русские тексты UI берутся из `config.template.js` / env в Coolify UI, не из defaults compose.

## Firewall (критично для видео/звука)

На хосте Coolify открой:

```bash
# пример ufw
ufw allow 40000:40100/udp
ufw allow 40000:40100/tcp
```

Без этих портов UI откроется, но WebRTC (медиа) не заработает.

## Важные переменные

| Var | Default | Зачем |
|---|---|---|
| `SFU_ANNOUNCED_IP` | — | Публичный IP для ICE candidates |
| `SFU_SERVER` | `true` | WebRTCServer: 1 порт на worker |
| `SFU_MIN_PORT` / `SFU_MAX_PORT` | `40000` / `40100` | Диапазон медиа-портов |
| `SFU_NUM_WORKERS` | CPU count | Число mediasoup workers |
| `TRUST_PROXY` | `true` | За Traefik Coolify |
| `HOST_PROTECTED` | `false` | Защита создания комнат (логин/пароль MiroTalk) |
| `PHONE_AUTH_ENABLED` | `true` | OTP по телефону до join/create |
| `PHONE_CREATORS` | — | Номера организаторов `+79…,+79…` (только они создают комнаты) |
| `PHONE_STORE_PATH` | `/src/app/data/phone-store.json` | Файл профилей/истории (volume `mirotalksfu-phone-data`) |
| `TELEGRAM_GATEWAY_TOKEN` | — | Токен Telegram Gateway |
| `PROXY_URL` | — | **Обязателен** для Gateway (`http://user:pass@host:port`) |
| `SMSC_LOGIN` / `SMSC_PASSWORD` | — | Fallback SMS через SMSC.ru |
| `HOST_USERS` | — | `user:pass:Name:*\|admin:admin:Admin:*` |
| `RECORDING_ENABLED` | `false` | Серверная запись |

Секреты `JWT_SECRET` / `API_KEY_SECRET` Coolify генерирует сам (`SERVICE_PASSWORD_64_*`).

## Что не делать

- Не ставь `network_mode: host` — сломает proxy Coolify.
- Не добавляй свой блок `networks:` в compose.
- Не указывай домен в `SFU_ANNOUNCED_IP` — нужен именно IPv4.
- Не используй `docker-compose.yml` — Coolify в этом проекте ждёт **`docker-compose.yaml`**.

## Локальный прогон (без Coolify)

```bash
# задай IP (для локалки можно 127.0.0.1 — медиа с других машин не заработает)
set SFU_ANNOUNCED_IP=127.0.0.1
docker compose -f docker-compose.yaml up
```

Для полного локального стека по апстриму: см. `docker-compose.template.yml` + `.env.template`.

## Обновление образа

В Coolify: Redeploy (pull `mirotalk/sfu:latest`), либо:

```bash
docker compose -f docker-compose.yaml pull
docker compose -f docker-compose.yaml up -d
```
