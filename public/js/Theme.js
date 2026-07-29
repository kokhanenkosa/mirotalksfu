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
            button.title = `Тема: ${label}. Открыть список`;
            button.setAttribute('aria-label', button.title);
        });

        document.querySelectorAll('[data-optrf-theme-label]').forEach((label) => {
            label.textContent = LABELS[preference];
        });

        document.querySelectorAll('[data-optrf-theme-value]').forEach((option) => {
            const isActive = option.dataset.optrfThemeValue === preference;
            option.classList.toggle('is-active', isActive);
            option.setAttribute('aria-checked', String(isActive));
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
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');

        const menu = document.createElement('div');
        menu.className = 'optrf-theme-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Выбор темы');
        menu.hidden = true;

        VALUES.forEach((value) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'optrf-theme-menu-option';
            option.dataset.optrfThemeValue = value;
            option.setAttribute('role', 'menuitemradio');
            option.innerHTML = `<span class="optrf-theme-menu-icon" aria-hidden="true">${ICONS[value]}</span><span>${LABELS[value]}</span>`;
            option.addEventListener('click', () => {
                setPreference(value);
                menu.hidden = true;
                button.setAttribute('aria-expanded', 'false');
                button.focus();
            });
            menu.appendChild(option);
        });

        button.addEventListener('click', () => {
            const willOpen = menu.hidden;
            menu.hidden = !willOpen;
            button.setAttribute('aria-expanded', String(willOpen));
            if (willOpen) {
                menu.querySelector('.is-active')?.focus();
            }
        });
        wrapper.appendChild(button);
        wrapper.appendChild(menu);

        document.addEventListener('click', (event) => {
            if (wrapper.contains(event.target)) return;
            menu.hidden = true;
            button.setAttribute('aria-expanded', 'false');
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || menu.hidden) return;
            menu.hidden = true;
            button.setAttribute('aria-expanded', 'false');
            button.focus();
        });

        const host = document.querySelector('[data-optrf-theme-host]');
        if (host) {
            wrapper.classList.add('optrf-theme-switcher--embedded');
            host.appendChild(wrapper);
        } else {
            wrapper.classList.add('optrf-theme-switcher--floating');
            document.body.appendChild(wrapper);
        }

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
