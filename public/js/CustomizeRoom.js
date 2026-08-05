'use strict';

/**
 * Custom Room page: build /join URL from form settings.
 * Simplified UI: name + media toggles; room id auto-generated; lectorium by default.
 *
 * Query params used by Room.js:
 * - room, roomPassword, name, avatar, audio, video, screen, chat, hide, notify, duration, token, lectorium
 */

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('customizeRoomForm');
    const errorEl = document.getElementById('crError');
    const statusEl = document.getElementById('crStatus');
    const previewEl = document.getElementById('crPreviewUrl');
    const copyBtn = document.getElementById('crCopy');
    const shareBtn = document.getElementById('crShare');
    const qrWrapEl = document.getElementById('crQrWrap');
    const randomRoomBtn = document.getElementById('crRandomRoom');

    const roomEl = document.getElementById('room');
    const roomPasswordEl = document.getElementById('roomPassword');
    const nameEl = document.getElementById('name');
    const avatarEl = document.getElementById('avatar');
    const tokenEl = document.getElementById('token');
    const durationEl = document.getElementById('duration');

    const audioEl = document.getElementById('audio');
    const videoEl = document.getElementById('video');
    const screenEl = document.getElementById('screen');
    const chatEl = document.getElementById('chat');
    const hideEl = document.getElementById('hide');
    const notifyEl = document.getElementById('notify');
    const modeCallEl = document.getElementById('modeCall');
    const modeLectoriumEl = document.getElementById('modeLectorium');

    const stripCyrillic = (value) =>
        String(value || '').replace(/[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/g, '');

    const uuidv4 = () => {
        if (typeof crypto?.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    };

    const generateRoomId = () => {
        const fromGen = window.RoomNameGen?.generate?.();
        if (fromGen) return String(fromGen).replace(/[:\s]+/g, '-');
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        return `study-room-${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}-${p(d.getHours())}-${p(d.getMinutes())}`;
    };

    // —— Defaults (as on the annotated screenshot) ——
    if (roomEl) roomEl.value = generateRoomId();
    if (roomPasswordEl) roomPasswordEl.value = '';
    if (avatarEl) avatarEl.value = '';
    if (tokenEl) tokenEl.value = '';
    if (durationEl) durationEl.value = '';
    if (audioEl) audioEl.checked = true;
    if (videoEl) videoEl.checked = true;
    if (screenEl) screenEl.checked = false;
    if (chatEl) chatEl.checked = true;
    if (hideEl) hideEl.checked = false;
    if (notifyEl) notifyEl.checked = false;
    if (modeCallEl) modeCallEl.checked = false;
    if (modeLectoriumEl) modeLectoriumEl.checked = true;

    const syncModeToggleUI = () => {
        const lectLabel = document.getElementById('labelModeLectorium');
        const callLabel = document.getElementById('labelModeCall');
        const lectOn = Boolean(modeLectoriumEl?.checked);
        lectLabel?.classList.toggle('is-active', lectOn);
        callLabel?.classList.toggle('is-active', !lectOn);
    };
    modeCallEl?.addEventListener('change', syncModeToggleUI);
    modeLectoriumEl?.addEventListener('change', syncModeToggleUI);
    syncModeToggleUI();

    // Never show share / QR on this simplified page
    if (shareBtn) shareBtn.hidden = true;
    if (qrWrapEl) qrWrapEl.hidden = true;

    fetch('/phone/me', { credentials: 'same-origin' })
        .then((res) => res.json())
        .then((data) => {
            if (!data?.authenticated) return;
            if (nameEl) nameEl.value = data.displayName || '';
            if (data.displayName) {
                window.localStorage.peer_name = data.displayName;
                window.sessionStorage.phone_display_name = data.displayName;
            } else {
                window.localStorage.removeItem('peer_name');
                window.sessionStorage.removeItem('phone_display_name');
            }
            updatePreview();
        })
        .catch(() => {
            // Без серверного профиля поле остаётся пустым.
        });

    if (roomEl) {
        roomEl.setAttribute('lang', 'en');
        roomEl.setAttribute('spellcheck', 'false');
    }

    const setError = (msg) => {
        if (!errorEl) return;
        if (!msg) {
            errorEl.hidden = true;
            errorEl.textContent = '';
            return;
        }
        errorEl.hidden = false;
        errorEl.textContent = msg;
    };

    const setStatus = (msg) => {
        if (!statusEl) return;
        statusEl.textContent = msg || '';
    };

    const safe = (value) => {
        const v = (value ?? '').toString().trim();
        return typeof window.filterXSS === 'function' ? window.filterXSS(v) : v;
    };

    const boolToFlag = (checked) => (checked ? '1' : '0');

    const normalizeDuration = (raw) => {
        const value = safe(raw);
        if (!value) return 'unlimited';
        if (value.toLowerCase() === 'unlimited') return 'unlimited';
        const re = /^(\d{2}):(\d{2}):(\d{2})$/;
        if (!re.test(value)) {
            throw new Error('Продолжительность должна быть в формате ЧЧ:ММ:СС, например 00:30:00');
        }
        return value;
    };

    const ensureRoomId = () => {
        let room = stripCyrillic(safe(roomEl?.value)).replace(/[:\s]+/g, '-');
        if (!room || !/^[A-Za-z0-9._-]+$/.test(room)) {
            room = generateRoomId();
        }
        if (roomEl) roomEl.value = room;
        return room;
    };

    const buildJoinUrl = () => {
        const room = ensureRoomId();
        if (!/^[A-Za-z0-9._-]+$/.test(room)) {
            throw new Error('Не удалось создать имя комнаты');
        }

        const roomPasswordRaw = safe(roomPasswordEl?.value);
        const roomPassword = roomPasswordRaw ? roomPasswordRaw : '0';
        const name = safe(nameEl?.value) || 'random';
        const avatarRaw = safe(avatarEl?.value);
        const avatar = avatarRaw ? avatarRaw : '0';
        const token = safe(tokenEl?.value);
        const duration = normalizeDuration(durationEl?.value);

        const url = new URL('/join', window.location.origin);
        url.searchParams.set('room', room);
        url.searchParams.set('roomPassword', roomPassword);
        url.searchParams.set('name', name);
        url.searchParams.set('avatar', avatar);

        url.searchParams.set('audio', boolToFlag(!!audioEl?.checked));
        url.searchParams.set('video', boolToFlag(!!videoEl?.checked));
        url.searchParams.set('screen', boolToFlag(!!screenEl?.checked));
        url.searchParams.set('chat', boolToFlag(!!chatEl?.checked));
        url.searchParams.set('hide', boolToFlag(!!hideEl?.checked));
        url.searchParams.set('notify', boolToFlag(!!notifyEl?.checked));
        const isLectorium = Boolean(modeLectoriumEl?.checked);
        url.searchParams.set('lectorium', isLectorium ? '1' : '0');

        url.searchParams.set('duration', duration);

        if (token) url.searchParams.set('token', token);

        return url;
    };

    const updatePreview = () => {
        if (!previewEl) return;
        try {
            const joinUrl = buildJoinUrl();
            previewEl.value = joinUrl.toString();
            if (copyBtn) copyBtn.disabled = false;
        } catch {
            previewEl.value = `${window.location.origin}/join?room=...`;
            if (copyBtn) copyBtn.disabled = true;
        }
    };

    const copyToClipboard = async (text) => {
        if (navigator.clipboard?.writeText && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }
        const tmp = document.createElement('textarea');
        tmp.value = text;
        tmp.setAttribute('readonly', '');
        tmp.style.position = 'fixed';
        tmp.style.left = '-9999px';
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand('copy');
        document.body.removeChild(tmp);
    };

    if (!form) return;

    if (randomRoomBtn && roomEl) {
        randomRoomBtn.addEventListener('click', () => {
            setError('');
            setStatus('');
            roomEl.value = generateRoomId();
            updatePreview();
        });
    }

    updatePreview();

    const inputs = [nameEl, audioEl, videoEl, chatEl, hideEl];
    inputs.forEach((el) => {
        if (!el) return;
        el.addEventListener('input', updatePreview);
        el.addEventListener('change', updatePreview);
    });

    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            setError('');
            setStatus('');
            try {
                const joinUrl = buildJoinUrl();
                await copyToClipboard(joinUrl.toString());
                setStatus('Ссылка скопирована.');
            } catch (err) {
                setError(err?.message || 'Не удалось скопировать ссылку');
            }
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        setError('');
        setStatus('');
        try {
            const joinUrl = buildJoinUrl();
            const displayName = safe(nameEl?.value);
            if (displayName) {
                window.localStorage.peer_name = displayName;
                fetch('/phone/me', { credentials: 'same-origin' })
                    .then((res) => res.json().catch(() => ({})))
                    .then((me) => {
                        if (!(me?.enabled && me?.authenticated)) return null;
                        return fetch('/phone/profile', {
                            method: 'POST',
                            credentials: 'same-origin',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ displayName }),
                        });
                    })
                    .catch(() => null);
            }
            window.location.href = joinUrl.toString();
        } catch (err) {
            setError(err?.message || 'Не удалось сформировать ссылку для входа');
        }
    });
});
