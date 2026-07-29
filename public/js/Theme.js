(() => {
    'use strict';

    const KEY = 'optrf_color_scheme';
    const VALUES = ['system', 'dark', 'light'];
    const LABELS = {
        system: 'Системная',
        dark: 'Тёмная',
        light: 'Светлая',
    };
    const ICONS = {
        system: '◐',
        dark: '●',
        light: '☀',
    };
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');

    function normalize(value) {
        return VALUES.includes(value) ? value : 'system';
    }

    function getPreference() {
        try {
            return normalize(window.localStorage.getItem(KEY));
        } catch {
            return 'system';
        }
    }

    function resolve(preference = getPreference()) {
        return preference === 'system' ? (media?.matches ? 'dark' : 'light') : preference;
    }

    function updateOrbs(resolved) {
        document.querySelectorAll('[data-thinking-orb]').forEach((element) => {
            element.dataset.orbTheme = resolved;
            window.ThinkingOrbs?.update?.(element, { theme: resolved });
        });
    }

    function updateControls(preference) {
        document.querySelectorAll('[data-optrf-theme-toggle]').forEach((button) => {
            const label = LABELS[preference];
            const icon = button.querySelector('.optrf-theme-icon');
            if (icon) icon.textContent = ICONS[preference];
            button.title = `Тема: ${label}. Нажмите для переключения`;
            button.setAttribute('aria-label', button.title);
        });

        document.querySelectorAll('[data-optrf-theme-label]').forEach((label) => {
            label.textContent = LABELS[preference];
        });
    }

    function apply(preference = getPreference(), emit = true) {
        preference = normalize(preference);
        const resolved = resolve(preference);
        const root = document.documentElement;

        root.dataset.theme = resolved;
        root.dataset.themePreference = preference;
        root.style.colorScheme = resolved;
        updateControls(preference);
        updateOrbs(resolved);

        if (emit) {
            window.dispatchEvent(
                new CustomEvent('optrf-theme-change', {
                    detail: { preference, resolved },
                })
            );
        }

        return resolved;
    }

    function setPreference(preference) {
        preference = normalize(preference);
        try {
            window.localStorage.setItem(KEY, preference);
        } catch {
            // Тема всё равно применяется в текущей вкладке.
        }
        return apply(preference);
    }

    function createSwitcher() {
        if (document.querySelector('[data-optrf-theme-switcher]')) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'optrf-theme-switcher';
        wrapper.dataset.optrfThemeSwitcher = '';
        wrapper.setAttribute('aria-label', 'Тема оформления');

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'optrf-theme-option';
        button.dataset.optrfThemeToggle = '';
        button.innerHTML = '<b class="optrf-theme-icon" aria-hidden="true"></b>';
        button.addEventListener('click', () => {
            const current = getPreference();
            const next = VALUES[(VALUES.indexOf(current) + 1) % VALUES.length];
            setPreference(next);
        });
        wrapper.appendChild(button);

        wrapper.classList.add('optrf-theme-switcher--floating');
        document.body.appendChild(wrapper);

        updateControls(getPreference());
    }

    function init() {
        apply(getPreference(), false);
        createSwitcher();
    }

    window.addEventListener('storage', (event) => {
        if (event.key === KEY) apply(event.newValue || 'system');
    });

    media?.addEventListener?.('change', () => {
        if (getPreference() === 'system') apply('system');
    });

    window.OPTRFTheme = {
        KEY,
        getPreference,
        getResolved: () => resolve(getPreference()),
        setPreference,
        apply,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
