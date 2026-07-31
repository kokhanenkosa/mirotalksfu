(() => {
    'use strict';

    const KEY = 'optrf_color_scheme';

    function apply() {
        const root = document.documentElement;
        root.dataset.theme = 'dark';
        root.dataset.themePreference = 'dark';
        root.style.colorScheme = 'dark';

        document.querySelectorAll('[data-thinking-orb]').forEach((element) => {
            element.dataset.orbTheme = 'dark';
            window.ThinkingOrbs?.update?.(element, { theme: 'dark' });
        });

        // Remove any leftover theme switcher UI
        document.querySelectorAll('[data-optrf-theme-switcher], [data-optrf-theme-host]').forEach((el) => {
            el.classList.add('hidden');
            el.style.display = 'none';
        });
        const compactThemeBtn = document.getElementById('compactThemeBtn');
        if (compactThemeBtn) {
            compactThemeBtn.classList.add('hidden');
            compactThemeBtn.style.display = 'none';
        }

        return 'dark';
    }

    function setPreference() {
        try {
            window.localStorage.setItem(KEY, 'dark');
        } catch {
            /* ignore */
        }
        return apply();
    }

    function init() {
        setPreference();
    }

    window.OPTRFTheme = {
        KEY,
        getPreference: () => 'dark',
        getResolved: () => 'dark',
        setPreference,
        apply,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
