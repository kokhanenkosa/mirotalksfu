/**
 * Vanilla wrapper around thinking-orbs canvas presets (no React runtime).
 * Docs: https://orbs.jakubantalik.com/
 */
import { MODE_DRAWS, resolvePreset } from 'thinking-orbs';

const LABELS = {
    working: 'Загрузка…',
    searching: 'Поиск…',
    solving: 'Обработка…',
    listening: 'Ожидание…',
    composing: 'Подготовка…',
    shaping: 'Формирование…',
};

const instances = new WeakMap();

function resolveDark(theme, el) {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    const root = el?.closest?.('[data-theme], .dark, .light') || document.documentElement;
    const attr = root.getAttribute?.('data-theme');
    if (attr === 'dark') return true;
    if (attr === 'light') return false;
    if (root.classList?.contains('dark')) return true;
    if (root.classList?.contains('light')) return false;
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}

function createInstance(host, options = {}) {
    let currentState = options.state || 'working';
    // Пресеты библиотеки только 20 | 64; displaySize — визуальный апскейл без мыла.
    const size = options.size === 20 ? 20 : 64;
    const displaySize =
        Number(options.displaySize) > 0 ? Math.round(Number(options.displaySize)) : size;
    const scale = displaySize / size;
    const theme = options.theme || 'auto';
    let currentSpeedMul = typeof options.speed === 'number' ? options.speed : 1;
    let currentPaused = Boolean(options.paused);

    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', options['aria-label'] || LABELS[currentState] || 'Загрузка…');
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize}px`;
    canvas.style.display = 'block';
    if (options.className) canvas.className = options.className;

    host.innerHTML = '';
    host.appendChild(canvas);

    const dpr = Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1);
    canvas.width = Math.round(displaySize * dpr);
    canvas.height = Math.round(displaySize * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    let dark = resolveDark(theme, host);
    let raf = 0;
    let running = false;
    let visible = true;

    const reduced =
        typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    const paintAt = (t) => {
        const { mode, opts } = resolvePreset(currentState, size);
        const painter = MODE_DRAWS[mode];
        ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
        ctx.clearRect(0, 0, size, size);
        painter(ctx, size, t, dark, opts);
    };

    const paintStatic = () => paintAt(0.6);

    const frame = () => {
        const { speed } = resolvePreset(currentState, size);
        paintAt((performance.now() / 1000) * speed * currentSpeedMul);
        if (running) raf = requestAnimationFrame(frame);
    };

    const start = () => {
        if (reduced || currentPaused || running) return;
        running = true;
        raf = requestAnimationFrame(frame);
    };

    const stop = () => {
        running = false;
        cancelAnimationFrame(raf);
    };

    paintStatic();

    const io =
        typeof IntersectionObserver !== 'undefined'
            ? new IntersectionObserver(([entry]) => {
                  visible = entry.isIntersecting;
                  if (visible && document.visibilityState !== 'hidden' && !currentPaused && !reduced) start();
                  else stop();
              })
            : null;
    io?.observe(canvas);

    const onVis = () => {
        if (document.visibilityState === 'hidden') stop();
        else if (visible && !currentPaused && !reduced) start();
    };
    document.addEventListener('visibilitychange', onVis);

    if (!reduced && !currentPaused) {
        if (io) {
            // wait for IO callback
        } else {
            start();
        }
    }

    return {
        canvas,
        setState(next) {
            currentState = next || 'working';
            canvas.setAttribute('aria-label', LABELS[currentState] || 'Загрузка…');
            if (reduced || currentPaused || !running) paintStatic();
        },
        setSpeed(next) {
            currentSpeedMul = typeof next === 'number' ? next : 1;
        },
        setPaused(next) {
            currentPaused = Boolean(next);
            if (currentPaused || reduced) {
                stop();
                paintStatic();
            } else if (visible) start();
        },
        setTheme(nextTheme) {
            dark = resolveDark(nextTheme || theme, host);
            if (!running) paintStatic();
        },
        destroy() {
            stop();
            io?.disconnect();
            document.removeEventListener('visibilitychange', onVis);
            host.innerHTML = '';
        },
    };
}

function mount(target, options) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return null;
    const prev = instances.get(el);
    prev?.destroy();
    const inst = createInstance(el, options || {});
    if (inst) instances.set(el, inst);
    return inst;
}

function update(target, patch = {}) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    const inst = el && instances.get(el);
    if (!inst) return null;
    if (patch.state) inst.setState(patch.state);
    if (patch.speed != null) inst.setSpeed(patch.speed);
    if (patch.paused != null) inst.setPaused(patch.paused);
    if (patch.theme) inst.setTheme(patch.theme);
    return inst;
}

function destroy(target) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    const inst = el && instances.get(el);
    if (!inst) return;
    inst.destroy();
    instances.delete(el);
}

function enhance(root = document) {
    root.querySelectorAll('[data-thinking-orb]').forEach((el) => {
        if (instances.has(el)) return;
        mount(el, {
            state: el.dataset.orbState || 'working',
            size: Number(el.dataset.orbSize || 64) === 20 ? 20 : 64,
            displaySize: el.dataset.orbDisplay ? Number(el.dataset.orbDisplay) : undefined,
            theme: el.dataset.orbTheme || 'auto',
            speed: el.dataset.orbSpeed ? Number(el.dataset.orbSpeed) : 1,
        });
    });
}

const ThinkingOrbs = { mount, update, destroy, enhance, LABELS };

if (typeof window !== 'undefined') {
    window.ThinkingOrbs = ThinkingOrbs;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => enhance());
    } else {
        enhance();
    }
}

export default ThinkingOrbs;
