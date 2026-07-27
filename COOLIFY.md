# MiroTalk SFU → Coolify

## Деплой

1. Залей этот репозиторий в Git (GitHub/GitLab/и т.д.).
2. Coolify → **New Resource** → репозиторий → Build Pack: **Docker Compose**.
3. **Docker Compose Location:** `/docker-compose.yaml` (именно `.yaml`).
4. **Base Directory:** `/`
5. Continue → в Environment Variables заполни:

| Переменная | Значение |
|---|---|
| `SFU_ANNOUNCED_IP` | Публичный **IPv4** сервера Coolify (обязательно) |
| `UI_LANGUAGE` | `ru` (уже по умолчанию) |
| `APP_NAME` | Название, например `ОПТ РФ Миро` |

6. У сервиса `mirotalksfu` укажи домен вида: `https://meet.твой-домен.ru:3010`  
   (`:3010` — порт **внутри** контейнера; снаружи будет 443 через Traefik).
7. Deploy.

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
| `HOST_PROTECTED` | `false` | Защита создания комнат |
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
