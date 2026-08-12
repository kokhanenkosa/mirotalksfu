# OPTRF / Uchilka — Design System for Cursor

Скорми этот файл агенту в другом проекте как единственный источник визуального стиля. Цель: воспроизвести оформление **Uchilka / OPTRF Academy** (Cursor-like dark UI), а не «типичный AI purple landing».

---

## 1. Visual identity (one sentence)

**Тёмно-серый Cursor-shell:** сплошной фон `#141414`, поверхности `#181818`, текст `#cccccc` / `#e4e4e4`, бордеры `#3c3c3c`, кнопки-«призраки» (transparent + border), без теней и без цветных градиентов. Акцент — светло-серый, не синий/фиолетовый.

---

## 2. Hard rules (do / don’t)

### Do
- Сплошные плоские фоны (`#141414` / `#181818`), без диагоналей, треугольников, skew, декоративных градиентов как главного фона.
- Кнопки: ghost — `background: transparent`, `border: 1px solid #3c3c3c|#5a5a5a`, hover → чуть светлее поверхность `#181818`/`#2a2a2a`.
- Скругления маленькие: `4px` / `6px` / `8px`. Не «пилюли» `999px` для основных CTA.
- Тени: **нет** (`box-shadow: none`), кроме редких утилитарных оверлеев.
- Типографика: UI = Inter; mono = JetBrains Mono; brand title only = NeutralFace.
- NeutralFace **только** на названии бренда/продукта (hero brand), не на обычных заголовках.
- Модалки/карточки: фон `#141414` или `#181818`, бордер `#3c3c3c`, без glow.
- Видео-тайлы / медиа-плоскости: `#141414` или `#111418`, без синих подложек.
- Один визуальный якорь на первом экране: бренд + один headline + один short supporting + одна группа CTA.

### Don’t
- Purple / indigo / violet градиенты, glow, neon.
- Warm cream `#F4F1EA` + terracotta + serif display (типичный AI-кластер).
- Newspaper / broadsheet denseness, hairline rules everywhere.
- Карточки ради карточек (тень + радиус + фон) там, где хватает бордера или ничего.
- Inter/Roboto как brand display; system-ui как единственный шрифт бренда.
- Плоский однотон без атмосферы на маркетинговых страницах — но атмосфера = solid graphite + типографика, не градиентный blob.
- Emoji в UI chrome.
- Большие multi-layer shadows, glassmorphism с цветным blur.

---

## 3. Color tokens (copy into `:root`)

```css
:root {
  /* Core graphite (Cursor-like) */
  --optrf-bg: #141414;              /* page / darkest */
  --optrf-bg-elevated: #181818;     /* elevated surfaces */
  --optrf-surface: #181818;
  --optrf-surface-2: #181818;
  --optrf-surface-3: #181818;
  --optrf-active-bg: #2a2a2a;       /* pressed / selected */
  --optrf-inactive: #252526;

  /* Text */
  --optrf-text: #cccccc;            /* primary */
  --optrf-text-bright: #e4e4e4;     /* headings / CTA text */
  --optrf-text-2: #9d9d9d;          /* secondary */
  --optrf-muted: #6e6e6e;           /* placeholders, footer, meta */

  /* Borders */
  --optrf-border: #3c3c3c;
  --optrf-border-strong: #5a5a5a;

  /* Accent = light gray (NOT brand blue) */
  --optrf-accent: #cccccc;
  --optrf-accent-hover: #e4e4e4;
  --optrf-accent-soft: rgba(255, 255, 255, 0.06);

  /* Functional (kept muted in this skin) */
  --optrf-danger: #e53935;          /* leave call / destructive only */
  --optrf-warning: #ffc107;         /* hand raise etc. */
  --optrf-success: #cccccc;

  /* Chrome */
  --optrf-input: transparent;
  --optrf-overlay: rgba(24, 24, 24, 0.94);
  --optrf-header: transparent;
  --optrf-footer: #181818;
  --optrf-footer-text: #6e6e6e;
  --optrf-video-tile: #141414;

  /* Effects */
  --optrf-shadow: none;
  --optrf-shadow-lg: none;

  /* Radii */
  --optrf-radius-sm: 4px;
  --optrf-radius: 6px;
  --optrf-radius-lg: 8px;

  /* Fonts */
  --optrf-font-brand: 'NeutralFace', 'Segoe UI', system-ui, sans-serif;
  --optrf-font-ui: 'Inter', 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
  --optrf-font-mono: 'JetBrains Mono', 'Cascadia Code', 'SF Mono', Consolas, 'Courier New', monospace;
  --optrf-font: var(--optrf-font-ui);
}
```

### Semantic mapping used in Uchilka
| Role | Value |
|------|--------|
| Page background | `#141414` |
| Panels / cards / dock / chat | `#181818` |
| Selected / hover fill | `#2a2a2a` or `rgba(255,255,255,0.06)` |
| Primary text | `#cccccc` |
| Bright text / titles | `#e4e4e4` |
| Secondary | `#9d9d9d` |
| Muted / meta | `#6e6e6e` |
| Border | `#3c3c3c` |
| Strong border (CTA) | `#5a5a5a` |
| Destructive | `#e53935` |
| Hand / attention | `#ffc107` |
| Legacy accent blue (avoid for chrome) | was `#00a8e8` — в UI chrome почти вытеснен серым |

---

## 4. Typography

### Stacks
1. **Brand (hero product name only):** NeutralFace  
2. **UI:** Inter 400/500/600  
3. **Mono (inputs, codes, room ids):** JetBrains Mono 400/500  

### Google Fonts (if NeutralFace unavailable, keep Inter + Mono)
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

### Scale (practical)
| Use | Size | Weight | Color |
|-----|------|--------|-------|
| Brand hero | clamp(2rem, 6vw, 3.5rem) | 400–700 NeutralFace | `#e4e4e4` |
| Page title | 1.25–1.5rem | 600 Inter | `#e4e4e4` |
| Body | 14–15px | 400–500 | `#cccccc` |
| Secondary | 13–14px | 400 | `#9d9d9d` |
| Meta / label | 11–12px | 500 | `#6e6e6e` |
| Mono input | 12px | 400–500 | `#cccccc` |

### Rules
- `text-transform: none`, `letter-spacing: 0` (не screamy caps).
- `-webkit-font-smoothing: antialiased`.
- Не смешивать NeutralFace с body copy.

---

## 5. Components

### Ghost button (primary CTA)
```css
.btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  color: var(--optrf-text-bright);
  background: transparent;
  border: 1px solid var(--optrf-border-strong);
  border-radius: var(--optrf-radius);
  font-family: var(--optrf-font-ui);
  font-size: 14px;
  font-weight: 500;
  box-shadow: none;
  cursor: pointer;
}
.btn-ghost:hover {
  color: var(--optrf-text-bright);
  background: var(--optrf-active-bg);
  border-color: var(--optrf-text-2);
}
```

### Secondary / filled quiet
```css
.btn-quiet {
  color: var(--optrf-text);
  background: var(--optrf-surface);
  border: 1px solid var(--optrf-border);
  border-radius: var(--optrf-radius);
}
.btn-quiet:hover {
  background: var(--optrf-active-bg);
  border-color: var(--optrf-border-strong);
}
```

### Destructive
```css
.btn-danger {
  color: #fff;
  background: #e53935;
  border: 0;
  border-radius: var(--optrf-radius);
  font-weight: 700;
}
.btn-danger:hover { background: #c62828; }
```

### Icon dock button (toolbar)
```css
.btn-icon {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #cccccc;
  background: transparent;
  border: 0;
  border-radius: 6px;
}
.btn-icon:hover,
.btn-icon.active {
  background: #141414;
  color: #e4e4e4;
}
```

### Panel / card
```css
.panel {
  background: var(--optrf-surface);
  color: var(--optrf-text);
  border: 1px solid var(--optrf-border);
  border-radius: var(--optrf-radius);
  box-shadow: none;
}
```

### Input
```css
.input {
  width: 100%;
  color: var(--optrf-text);
  background: transparent;
  border: 1px solid var(--optrf-border);
  border-radius: var(--optrf-radius);
  font-family: var(--optrf-font-mono);
  font-size: 12px;
  padding: 8px 10px;
}
.input::placeholder { color: var(--optrf-muted); }
.input:focus {
  outline: none;
  border-color: var(--optrf-accent);
  box-shadow: 0 0 0 3px var(--optrf-accent-soft);
}
```

### Modal (SweetAlert-like)
```css
.modal {
  background: #141414;
  color: #cccccc;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  box-shadow: none;
  font-family: Inter, system-ui, sans-serif;
}
.modal-title { color: #e4e4e4; font-weight: 600; }
```

### Bottom dock / chrome bar
```css
.dock {
  background: #181818;
  border: 1px solid #3c3c3c;
  border-radius: 6px; /* desktop pill */
  /* mobile: border-radius: 16px 16px 0 0; full-bleed bottom */
  backdrop-filter: blur(12px);
}
```

---

## 6. Layout patterns (Uchilka)

### Landing / auth
- Full-bleed solid `#141414`.
- Centered column, max-width ~440px for join forms.
- Brand name = hero signal (NeutralFace), not a tiny nav logo.
- First viewport: brand + one line + short support + CTA group. No stats strips, no promo chips.

### Room / app chrome
- Video stage graphite `#141414`.
- Chat sidebar `#181818`, border `#3c3c3c`.
- Bottom controls centered on mobile; ghost icon buttons.
- Scene / hand-raise chips: same dock language (border `#3c3c3c`, bg `#181818`).

### Spacing rhythm
Prefer 4-based: `4, 8, 12, 14, 16, 24, 40`. Landing vertical gap often `40px`; tight stacks `14px`.

---

## 7. Motion

- Мало и по делу: `fadeInDown` / `fadeOutUp` на модалках (~200–300ms).
- Hover scale на иконках до `1.05`, без bounce.
- Не добавлять постоянный glow-pulse на весь UI (допустим лёгкий pulse только на hand-raise alert).

---

## 8. Starter stylesheet (drop-in)

Сохрани как `optrf-tokens.css` в новом проекте:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --optrf-bg: #141414;
  --optrf-bg-elevated: #181818;
  --optrf-surface: #181818;
  --optrf-active-bg: #2a2a2a;
  --optrf-text: #cccccc;
  --optrf-text-bright: #e4e4e4;
  --optrf-text-2: #9d9d9d;
  --optrf-muted: #6e6e6e;
  --optrf-border: #3c3c3c;
  --optrf-border-strong: #5a5a5a;
  --optrf-accent: #cccccc;
  --optrf-accent-hover: #e4e4e4;
  --optrf-accent-soft: rgba(255, 255, 255, 0.06);
  --optrf-danger: #e53935;
  --optrf-warning: #ffc107;
  --optrf-radius-sm: 4px;
  --optrf-radius: 6px;
  --optrf-radius-lg: 8px;
  --optrf-font-ui: 'Inter', 'Segoe UI', system-ui, sans-serif;
  --optrf-font-mono: 'JetBrains Mono', Consolas, monospace;
  --optrf-font-brand: 'NeutralFace', 'Inter', system-ui, sans-serif;
  --optrf-shadow: none;
}

*,
*::before,
*::after { box-sizing: border-box; }

html, body {
  margin: 0;
  min-height: 100%;
  background: var(--optrf-bg);
  color: var(--optrf-text);
  font-family: var(--optrf-font-ui);
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, h4 {
  color: var(--optrf-text-bright);
  font-weight: 600;
  letter-spacing: 0;
}

.brand-title {
  font-family: var(--optrf-font-brand);
  font-weight: 400;
  color: var(--optrf-text-bright);
}

a { color: var(--optrf-text-bright); text-decoration: none; }
a:hover { color: #fff; }

.panel, .card {
  background: var(--optrf-surface);
  border: 1px solid var(--optrf-border);
  border-radius: var(--optrf-radius);
  box-shadow: var(--optrf-shadow);
}

.btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  color: var(--optrf-text-bright);
  background: transparent;
  border: 1px solid var(--optrf-border-strong);
  border-radius: var(--optrf-radius);
  font: 500 14px/1.2 var(--optrf-font-ui);
  cursor: pointer;
  box-shadow: none;
}
.btn-ghost:hover {
  background: var(--optrf-active-bg);
  border-color: var(--optrf-text-2);
}

.btn-danger {
  color: #fff;
  background: var(--optrf-danger);
  border: 0;
  border-radius: var(--optrf-radius);
  font: 700 13px/1.2 var(--optrf-font-ui);
  padding: 8px 14px;
  cursor: pointer;
}

input, textarea, select {
  width: 100%;
  color: var(--optrf-text);
  background: transparent;
  border: 1px solid var(--optrf-border);
  border-radius: var(--optrf-radius);
  font: 400 12px/1.4 var(--optrf-font-mono);
  padding: 8px 10px;
}
input::placeholder, textarea::placeholder { color: var(--optrf-muted); }
input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: var(--optrf-accent);
  box-shadow: 0 0 0 3px var(--optrf-accent-soft);
}

.dock {
  background: #181818;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
}

.muted { color: var(--optrf-muted); }
.secondary { color: var(--optrf-text-2); }
```

---

## 9. Prompt snippet for Cursor (paste into new project)

```text
Use docs/OPTRF-DESIGN-SYSTEM.md as the only visual source of truth.
Build UI in the Uchilka/OPTRF Cursor-like graphite style:
- backgrounds #141414 / surfaces #181818
- text #cccccc / #e4e4e4, muted #6e6e6e, borders #3c3c3c
- ghost buttons (transparent + gray border), radius 6px, no shadows
- Inter for UI, JetBrains Mono for inputs, NeutralFace only for brand title
- no purple gradients, no cream/terracotta, no glowing neon, no card spam
Match component patterns from that file. Prefer CSS variables listed there.
```

---

## 10. Source files in Uchilka (for reference)

| File | Role |
|------|------|
| `public/css/fonts.css` | NeutralFace + font tokens |
| `public/css/optrf-theme.css` | Global theme tokens + controls |
| `public/css/optrf-academy.css` | Landing / academy shell |
| `public/css/optrf-room.css` | In-room chrome, dock, modals |
| `public/css/optrf-brand.css` | Brand overrides |
| `public/js/Brand.js` | Product strings / hero copy |

Если в новом проекте нет NeutralFace — оставь Inter для UI и используй сильный вес/размер для brand; не подменяй бренд на Inter Thin с цветным градиентом.
