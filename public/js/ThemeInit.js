(() => {
    'use strict';

    const KEY = 'optrf_color_scheme';

    // Forced dark theme for all users (theme picker removed)
    let preference = 'dark';
    try {
        window.localStorage.setItem(KEY, 'dark');
    } catch {
        /* ignore */
    }

    const root = document.documentElement;
    root.dataset.theme = 'dark';
    root.dataset.themePreference = 'dark';
    root.style.colorScheme = 'dark';
})();
