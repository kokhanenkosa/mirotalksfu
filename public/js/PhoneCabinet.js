'use strict';

(() => {
    const gate = document.getElementById('phoneGate');
    const cabinet = document.getElementById('phoneCabinet');
    const createPanel = document.getElementById('createRoomPanel');
    if (!gate && !cabinet && !createPanel) return;

    const phoneNumberEl = document.getElementById('phoneCabinetNumber');
    const displayNameEl = document.getElementById('phoneDisplayName');
    const saveNameBtn = document.getElementById('phoneSaveNameBtn');
    const nameStatusEl = document.getElementById('phoneNameStatus');
    const logoutBtn = document.getElementById('phoneLogoutBtn');
    const roomsBlock = document.getElementById('phoneRoomsBlock');
    const activeList = document.getElementById('phoneActiveRooms');
    const historyList = document.getElementById('phoneHistoryRooms');
    const activeEmpty = document.getElementById('phoneActiveEmpty');
    const historyEmpty = document.getElementById('phoneHistoryEmpty');
    const guestHint = document.getElementById('phoneGuestHint');

    const gateStepPhone = document.getElementById('gateStepPhone');
    const gateStepCode = document.getElementById('gateStepCode');
    const gatePhoneInput = document.getElementById('gatePhoneInput');
    const gateCodeInput = document.getElementById('gateCodeInput');
    const gateSendCodeBtn = document.getElementById('gateSendCodeBtn');
    const gateVerifyCodeBtn = document.getElementById('gateVerifyCodeBtn');
    const gateResendBtn = document.getElementById('gateResendBtn');
    const gateChangePhoneBtn = document.getElementById('gateChangePhoneBtn');
    const gateCodeHint = document.getElementById('gateCodeHint');
    const gateAuthError = document.getElementById('gateAuthError');

    function show(el, on) {
        if (!el) return;
        el.hidden = !on;
    }

    function setNameStatus(msg, isError) {
        if (!nameStatusEl) return;
        nameStatusEl.textContent = msg || '';
        nameStatusEl.classList.toggle('is-error', Boolean(isError));
    }

    function setGateError(msg) {
        if (!gateAuthError) return;
        if (!msg) {
            gateAuthError.hidden = true;
            gateAuthError.textContent = '';
            return;
        }
        gateAuthError.hidden = false;
        gateAuthError.textContent = msg;
    }

    function digitsOnly(value) {
        return String(value || '').replace(/\D/g, '');
    }

    function normalizePhone(value) {
        let digits = digitsOnly(value);
        if (!digits) return '';
        if (digits.startsWith('8') && digits.length === 11) digits = `7${digits.slice(1)}`;
        if (digits.length === 10) digits = `7${digits}`;
        if (!digits.startsWith('7') && digits.length >= 11) return `+${digits}`;
        if (digits.startsWith('7')) return `+${digits}`;
        return `+7${digits}`;
    }

    function formatNational(digits) {
        const d = digitsOnly(digits).replace(/^7/, '').replace(/^8/, '').slice(0, 10);
        const p1 = d.slice(0, 3);
        const p2 = d.slice(3, 6);
        const p3 = d.slice(6, 8);
        const p4 = d.slice(8, 10);
        let out = p1;
        if (p2) out += ` ${p2}`;
        if (p3) out += `-${p3}`;
        if (p4) out += `-${p4}`;
        return out;
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

    function setBusy(btn, busy) {
        if (!btn) return;
        btn.disabled = Boolean(busy);
    }

    async function postJson(url, body) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        return { res, data };
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
        const name = (displayNameEl?.value || '').trim();
        setNameStatus('');
        if (!name) {
            setNameStatus('Укажите имя', true);
            return;
        }
        setBusy(saveNameBtn, true);
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
                return;
            }
            window.localStorage.peer_name = data.displayName;
            window.sessionStorage.phone_display_name = data.displayName;
            setNameStatus('Сохранено');
        } catch {
            setNameStatus('Ошибка сети', true);
        } finally {
            setBusy(saveNameBtn, false);
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
        } catch {
            /* ignore */
        }
        window.location.href = '/';
    }

    function resetGateForm() {
        setGateError('');
        show(gateStepPhone, true);
        show(gateStepCode, false);
        if (gateCodeInput) gateCodeInput.value = '';
        if (gatePhoneInput) gatePhoneInput.focus();
    }

    async function sendCode() {
        setGateError('');
        const phone = normalizePhone(gatePhoneInput?.value);
        if (!/^\+7\d{10}$/.test(phone) && !/^\+\d{11,15}$/.test(phone)) {
            setGateError('Введите корректный номер телефона');
            gatePhoneInput?.focus();
            return;
        }

        setBusy(gateSendCodeBtn, true);
        setBusy(gateResendBtn, true);
        try {
            const { res, data } = await postJson('/phone/send-code', { phone });
            if (!res.ok || !data.ok) {
                setGateError(data.error || 'Не удалось отправить код');
                return;
            }
            if (gatePhoneInput) gatePhoneInput.value = formatNational(phone);
            if (gateCodeHint) gateCodeHint.textContent = data.message || 'Код отправлен';
            show(gateStepPhone, false);
            show(gateStepCode, true);
            gateCodeInput?.focus();
        } catch {
            setGateError('Ошибка сети. Попробуйте ещё раз.');
        } finally {
            setBusy(gateSendCodeBtn, false);
            setBusy(gateResendBtn, false);
        }
    }

    async function verifyCode() {
        setGateError('');
        const phone = normalizePhone(gatePhoneInput?.value);
        const code = digitsOnly(gateCodeInput?.value).slice(0, 8);
        if (code.length < 4) {
            setGateError('Введите код из сообщения');
            gateCodeInput?.focus();
            return;
        }

        setBusy(gateVerifyCodeBtn, true);
        try {
            const { res, data } = await postJson('/phone/verify', { phone, code });
            if (!res.ok || !data.ok) {
                setGateError(data.error || 'Неверный код');
                gateCodeInput?.focus();
                return;
            }

            if (data.token) {
                window.sessionStorage.peer_token = data.token;
                window.sessionStorage.phone_auth = data.token;
                window.sessionStorage.phone_number = data.phone || phone;
                window.sessionStorage.phone_can_create = data.canCreate ? '1' : '0';
            }

            // подтянуть профиль/кабинет без перезагрузки
            const meRes = await fetch('/phone/me', { credentials: 'same-origin' });
            const me = await meRes.json().catch(() => ({}));
            applySession(me?.ok ? me : { enabled: true, authenticated: true, phone, canCreate: data.canCreate });
        } catch {
            setGateError('Ошибка сети. Попробуйте ещё раз.');
        } finally {
            setBusy(gateVerifyCodeBtn, false);
        }
    }

    function applySession(data) {
        if (!data?.enabled) {
            show(gate, false);
            show(cabinet, false);
            show(createPanel, true);
            return;
        }

        if (!data.authenticated) {
            show(gate, true);
            show(cabinet, false);
            show(createPanel, false);
            resetGateForm();
            return;
        }

        show(gate, false);
        show(cabinet, true);

        if (phoneNumberEl) phoneNumberEl.textContent = formatPhone(data.phone);
        window.sessionStorage.phone_number = data.phone || '';
        window.sessionStorage.phone_can_create = data.canCreate ? '1' : '0';

        const displayName = data.displayName || window.localStorage.peer_name || '';
        if (displayNameEl) displayNameEl.value = displayName;
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

    gatePhoneInput?.addEventListener('input', () => {
        const caretEnd = gatePhoneInput.selectionStart === gatePhoneInput.value.length;
        gatePhoneInput.value = formatNational(gatePhoneInput.value);
        if (caretEnd) {
            gatePhoneInput.setSelectionRange(gatePhoneInput.value.length, gatePhoneInput.value.length);
        }
    });

    gateCodeInput?.addEventListener('input', () => {
        gateCodeInput.value = digitsOnly(gateCodeInput.value).slice(0, 6);
        if (gateCodeInput.value.length === 6) verifyCode();
    });

    gateSendCodeBtn?.addEventListener('click', sendCode);
    gateResendBtn?.addEventListener('click', sendCode);
    gateVerifyCodeBtn?.addEventListener('click', verifyCode);
    gateChangePhoneBtn?.addEventListener('click', () => {
        if (gateCodeInput) gateCodeInput.value = '';
        show(gateStepCode, false);
        show(gateStepPhone, true);
        setGateError('');
        gatePhoneInput?.focus();
    });

    gatePhoneInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendCode();
    });
    gateCodeInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') verifyCode();
    });

    saveNameBtn?.addEventListener('click', saveDisplayName);
    displayNameEl?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveDisplayName();
        }
    });
    logoutBtn?.addEventListener('click', logout);

    show(gate, false);
    show(cabinet, false);
    show(createPanel, false);

    fetch('/phone/me', { credentials: 'same-origin' })
        .then((r) => r.json())
        .then(applySession)
        .catch(() => {
            show(gate, true);
            show(cabinet, false);
            show(createPanel, false);
            resetGateForm();
        });
})();
