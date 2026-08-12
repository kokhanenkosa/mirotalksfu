# OPTRF Academy / Uchilka — функционал и механика видео-потоков

Документ для разработчиков и агентов Cursor. Визуальный стиль: [`OPTRF-DESIGN-SYSTEM.md`](./OPTRF-DESIGN-SYSTEM.md).  
Правило качества: `.cursor/rules/optrf-video-quality.mdc` (**alwaysApply**).

---

## Принцип качества

**Ничего лишнего не лимитировать.** Цель: realtime + отличное качество.  
Авто-деградация — только emergency (реальная сеть/CPU), не proactive из‑за dialog / peers / layout.  
В сессии качество крутят **вручную** создатель и модератор.

---

## Серверный bitrate (mediasoup)

`app/src/config.template.js` → `mediasoup.webRtcTransport`:

| Параметр | Значение |
|----------|----------|
| `initialAvailableOutgoingBitrate` | **12 Mbps** |
| `minimumAvailableOutgoingBitrate` | **3 Mbps** |
| `maxIncomingBitrate` | **20 Mbps** |
| codec `x-google-start-bitrate` | **3000** kbps |

---

## Клиентские encodings (≈3× прежних)

### Webcam simulcast

| layer | maxBitrate |
|-------|------------|
| low | ~0.54 Mbps |
| mid | ~1.8 Mbps |
| high | **6 Mbps** (слайдер 1–12) |

### Screen

| layer | maxBitrate |
|-------|------------|
| low | ~1.2 Mbps |
| mid | ~2.7 Mbps |
| high | **7.5 Mbps** (слайдер 1–15) |

---

## Ручное управление в сессии

**Где:** Настройки → вкладка **Модератор** (создатель / презентер).

| Контрол | ID | Действие |
|---------|-----|----------|
| Профиль | `#streamQualityPreset` | `max` (default) / `high` / `balanced` / `saver` / `perf` — **без auto** |
| Потолок камеры | `#manualWebcamMbps` | Mbps → live `producer.setParameters` |
| Потолок экрана | `#manualScreenMbps` | Mbps → live setParameters |
| Входящие слои max | `#switchManualForceHighLayers` | force HIGH spatial/temporal для consumers |
| Применить сейчас | `#manualQualityApplyBtn` | `rc.applyManualSessionQuality(...)` |

API: `RoomClient.applyManualSessionQuality({ preset, webcamMbps, screenMbps, forceHighLayers })`.

Не пересоздаёт камеру / OBS track. Работает на горячую.

LocalStorage: `stream_quality_preset`, `manual_webcam_mbps`, `manual_screen_mbps`, `manual_force_high_layers`.

---

## AdaptiveQualityController

Модуль: `public/js/AdaptiveQualityController.js`.

```
layout PRIORITY ≠ forced QUALITY
```

- Protected lecturer producer: layout/dialog **не** вызывают `setParameters`
- CPU: сначала режем incoming guest, потом (редко) uplink лектора
- Manual `forceHighLayers` + preset `max` — предпочитаем максимальные слои
- Debug: `?videoDebug=1` · diag: `?disableVideoAdaptive=1`

---

## Роли (кратко)

- **Гость:** без settings / leave / chat X; media отложено до диалога  
- **Модератор:** настройки, диалог, ручное качество  
- **Создатель:** + Leave + chat X (`syncCreatorOnlyChrome`)

Create room только через `/newroom`.

---

## Связанные файлы

| Файл | Роль |
|------|------|
| `RoomClient.js` | encodings, `applyManualSessionQuality`, protect lecturer |
| `AdaptiveQualityController.js` | downlink adaptive + manual flags |
| `Room.js` / `Room.html` | UI модератора |
| `LocalStorage.js` | defaults |
| `config.template.js` | server BWE caps |
| `.cursor/rules/optrf-video-quality.mdc` | правило для агентов |
