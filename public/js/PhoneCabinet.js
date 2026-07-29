'use strict';

(() => {
    const gate = document.getElementById('phoneGate');
    const cabinet = document.getElementById('phoneCabinet');
    const createPanel = document.getElementById('createRoomPanel');
    if (!gate && !cabinet && !createPanel) return;

    const phoneNumberEl = document.getElementById('phoneCabinetNumber');
    const displayNameEl = document.getElementById('phoneDisplayName');
    const displayNameTextEl = document.getElementById('phoneDisplayNameText');
    const editNameBtn = document.getElementById('phoneEditNameBtn');
    const nameStatusEl = document.getElementById('phoneNameStatus');
    const logoutBtn = document.getElementById('phoneLogoutBtn');
    const superAdminBtn = document.getElementById('superAdminBtn');
    const roomsBlock = document.getElementById('phoneRoomsBlock');
    const activeList = document.getElementById('phoneActiveRooms');
    const historyList = document.getElementById('phoneHistoryRooms');
    const activeEmpty = document.getElementById('phoneActiveEmpty');
    const historyEmpty = document.getElementById('phoneHistoryEmpty');
    const guestHint = document.getElementById('phoneGuestHint');
    let displayNameBeforeEdit = '';
    let isSavingDisplayName = false;

    function show(el, on) {
        if (!el) return;
        el.hidden = !on;
    }

    function setLandingMode(mode) {
        document.body.classList.remove('phone-session-pending', 'is-phone-authenticated', 'is-phone-guest');
        document.body.classList.add(mode === 'authenticated' ? 'is-phone-authenticated' : 'is-phone-guest');
    }

    function setNameStatus(msg, isError) {
        if (!nameStatusEl) return;
        nameStatusEl.textContent = msg || '';
        nameStatusEl.classList.toggle('is-error', Boolean(isError));
    }

    function setDisplayNameEditing(editing) {
        show(displayNameTextEl, !editing);
        show(displayNameEl, editing);
        show(editNameBtn, !editing);
        if (editing) {
            window.requestAnimationFrame(() => {
                displayNameEl?.focus();
                displayNameEl?.select();
            });
        }
    }

    function formatPhone(phone) {
        const d = String(phone || '').replace(/\D/g, '');
        if (d.length === 11 && d.startsWith('7')) {
            return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
        }
        return phone || '';
    }

    function formatWhen(isoOrMs) {
        if (!isoOrMs) return '';
        const d = new Date(isoOrMs);
        if (Number.isNaN(d.getTime())) return '';
        const p = (n) => String(n).padStart(2, '0');
        return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    function roomJoinUrl(roomId) {
        return `/join/?room=${encodeURIComponent(roomId)}`;
    }

    function renderRoomItem(item, { active }) {
        const li = document.createElement('li');
        li.className = 'phone-rooms-item';

        const main = document.createElement('div');
        main.className = 'phone-rooms-item-main';

        const title = document.createElement('a');
        title.className = 'phone-rooms-item-name';
        title.href = roomJoinUrl(item.id || item.roomId);
        title.textContent = item.id || item.roomId;

        const meta = document.createElement('span');
        meta.className = 'phone-rooms-item-meta';
        if (active) {
            const peers = Number(item.peers) || 0;
            meta.textContent = `${peers} уч. · ${formatWhen(item.createdAt)}`;
        } else {
            const ended = item.endedAt ? ` · завершена ${formatWhen(item.endedAt)}` : '';
            meta.textContent = `${formatWhen(item.createdAt)}${ended}`;
            if (item.isActive) {
                const badge = document.createElement('span');
                badge.className = 'phone-rooms-badge';
                badge.textContent = 'активна';
                meta.appendChild(document.createTextNode(' · '));
                meta.appendChild(badge);
            }
        }

        main.appendChild(title);
        main.appendChild(meta);

        const joinBtn = document.createElement('a');
        joinBtn.className = 'button button-primary br-6 phone-rooms-join';
        joinBtn.href = roomJoinUrl(item.id || item.roomId);
        joinBtn.textContent = 'Войти';

        li.appendChild(main);
        li.appendChild(joinBtn);
        return li;
    }

    async function loadRooms() {
        if (!roomsBlock) return;
        try {
            const res = await fetch('/phone/rooms', { credentials: 'same-origin' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) return;

            const active = Array.isArray(data.active) ? data.active : [];
            const history = Array.isArray(data.history) ? data.history : [];

            if (activeList) {
                activeList.innerHTML = '';
                active.forEach((item) => activeList.appendChild(renderRoomItem(item, { active: true })));
            }
            show(activeEmpty, active.length === 0);

            if (historyList) {
                historyList.innerHTML = '';
                history.forEach((item) => historyList.appendChild(renderRoomItem(item, { active: false })));
            }
            show(historyEmpty, history.length === 0);
        } catch {
            /* ignore */
        }
    }

    async function saveDisplayName() {
        if (isSavingDisplayName) return false;
        const name = (displayNameEl?.value || '').trim();
        setNameStatus('');
        if (!name) {
            setNameStatus('Укажите имя', true);
            displayNameEl?.focus();
            return false;
        }
        if (name === displayNameBeforeEdit) {
            setDisplayNameEditing(false);
            return true;
        }
        isSavingDisplayName = true;
        try {
            const res = await fetch('/phone/profile', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: name }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) {
                setNameStatus(data.error || 'Не удалось сохранить', true);
                displayNameEl?.focus();
                return false;
            }
            window.localStorage.peer_name = data.displayName;
            window.sessionStorage.phone_display_name = data.displayName;
            if (displayNameEl) displayNameEl.value = data.displayName;
            if (displayNameTextEl) displayNameTextEl.textContent = data.displayName;
            displayNameBeforeEdit = data.displayName;
            setNameStatus('Сохранено');
            setDisplayNameEditing(false);
            return true;
        } catch {
            setNameStatus('Ошибка сети', true);
            displayNameEl?.focus();
            return false;
        } finally {
            isSavingDisplayName = false;
        }
    }

    async function logout() {
        try {
            await fetch('/phone/logout', { method: 'POST', credentials: 'same-origin' });
        } catch {
            /* ignore */
        }
        try {
            delete window.sessionStorage.phone_auth;
            delete window.sessionStorage.peer_token;
            delete window.sessionStorage.phone_number;
            delete window.sessionStorage.phone_can_create;
            delete window.sessionStorage.phone_display_name;
            delete window.sessionStorage.phone_is_superadmin;
        } catch {
            /* ignore */
        }
        window.location.href = '/';
    }

    function enhanceOrbs() {
        try {
            window.ThinkingOrbs?.enhance?.(gate || document);
        } catch {
            /* ignore */
        }
    }

    function applySession(data) {
        if (!data?.enabled) {
            setLandingMode('guest');
            show(gate, false);
            show(cabinet, false);
            show(createPanel, true);
            return;
        }

        if (!data.authenticated) {
            setLandingMode('guest');
            show(gate, true);
            show(cabinet, false);
            show(createPanel, false);
            // orbs после показа гейта
            window.requestAnimationFrame(() => {
                enhanceOrbs();
                document.getElementById('phoneInput')?.focus();
            });
            return;
        }

        setLandingMode('authenticated');
        show(gate, false);
        show(cabinet, true);

        if (phoneNumberEl) phoneNumberEl.textContent = formatPhone(data.phone);
        window.sessionStorage.phone_number = data.phone || '';
        window.sessionStorage.phone_can_create = data.canCreate ? '1' : '0';
        window.sessionStorage.phone_is_superadmin = data.isSuperAdmin ? '1' : '0';
        show(superAdminBtn, Boolean(data.isSuperAdmin));

        const displayName = data.displayName || window.localStorage.peer_name || '';
        if (displayNameEl) displayNameEl.value = displayName;
        if (displayNameTextEl) displayNameTextEl.textContent = displayName || 'Не указано';
        displayNameBeforeEdit = displayName;
        setDisplayNameEditing(false);
        if (displayName) {
            window.localStorage.peer_name = displayName;
            window.sessionStorage.phone_display_name = displayName;
        }

        if (data.canCreate) {
            show(guestHint, false);
            show(roomsBlock, true);
            show(createPanel, true);
            loadRooms();
        } else {
            show(guestHint, true);
            show(roomsBlock, false);
            show(createPanel, false);
        }
    }

    async function refreshSession() {
        try {
            const res = await fetch('/phone/me', { credentials: 'same-origin' });
            const data = await res.json();
            applySession(data);
        } catch {
            setLandingMode('guest');
            show(gate, true);
            show(cabinet, false);
            show(createPanel, false);
            enhanceOrbs();
        }
    }

    editNameBtn?.addEventListener('click', () => {
        displayNameBeforeEdit = (displayNameEl?.value || '').trim();
        setNameStatus('');
        setDisplayNameEditing(true);
    });
    displayNameEl?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            displayNameEl.blur();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            displayNameEl.value = displayNameBeforeEdit;
            setNameStatus('');
            setDisplayNameEditing(false);
        }
    });
    displayNameEl?.addEventListener('blur', () => {
        if (!displayNameEl.hidden) saveDisplayName();
    });
    logoutBtn?.addEventListener('click', logout);

    window.addEventListener('phone-auth:success', () => {
        refreshSession();
    });

    show(gate, false);
    show(cabinet, false);
    show(createPanel, false);

    refreshSession();
})();
