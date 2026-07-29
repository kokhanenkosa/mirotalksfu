(() => {
    'use strict';

    const KEY = 'optrf_color_scheme';
    const VALID = new Set(['system', 'dark', 'light']);

    let preference = 'system';
    try {
        const saved = window.localStorage.getItem(KEY);
        if (VALID.has(saved)) preference = saved;

        // Однократная миграция прежней настройки видеокомнаты.
        if (!saved) {
            const legacy = JSON.parse(window.localStorage.getItem('SFU_SETTINGS') || 'null');
            if (legacy && Number.isFinite(Number(legacy.theme))) {
                // Все прежние палитры Room были тёмными.
                preference = 'dark';
                window.localStorage.setItem(KEY, preference);
            }
        }
    } catch {
        preference = 'system';
    }

    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
    const root = document.documentElement;

    root.dataset.theme = resolved;
    root.dataset.themePreference = preference;
    root.style.colorScheme = resolved;
})();
