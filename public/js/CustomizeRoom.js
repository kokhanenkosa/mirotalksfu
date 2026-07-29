'use strict';

/**
 * Custom Room page: build /join URL from form settings.
 *
 * Query params used by client.js:
 * - room, roomPassword, name, avatar, audio, video, screen, chat, hide, notify, duration, token
 */

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('customizeRoomForm');
    const errorEl = document.getElementById('crError');
    const statusEl = document.getElementById('crStatus');
    const previewEl = document.getElementById('crPreviewUrl');
    const copyBtn = document.getElementById('crCopy');
    const shareBtn = document.getElementById('crShare');
    const qrWrapEl = document.getElementById('crQrWrap');
    const qrEl = document.getElementById('crQr');
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

    const stripCyrillic = (value) =>
        String(value || '').replace(/[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/g, '');

    fetch('/phone/me', { credentials: 'same-origin' })
        .then((res) => res.json())
        .then((data) => {
            if (!data?.authenticated) return;
            // Серверный профиль — источник истины.
            if (nameEl) nameEl.value = data.displayName || '';
            if (data.displayName) {
                window.localStorage.peer_name = data.displayName;
                window.sessionStorage.phone_display_name = data.displayName;
            } else {
                window.localStorage.removeItem('peer_name');
                window.sessionStorage.removeItem('phone_display_name');
            }
        })
        .catch(() => {
            // Без серверного профиля поле остаётся пустым.
        });

    if (roomEl) {
        roomEl.setAttribute('lang', 'en');
        roomEl.setAttribute('spellcheck', 'false');
        roomEl.setAttribute('title', 'Только латиница. Русские буквы запрещены');
        roomEl.addEventListener('input', () => {
            const cleaned = stripCyrillic(roomEl.value);
            if (cleaned !== roomEl.value) roomEl.value = cleaned;
        });
        roomEl.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = stripCyrillic(e.clipboardData?.getData('text') || '');
            const start = roomEl.selectionStart || 0;
            const end = roomEl.selectionEnd || 0;
            roomEl.value = roomEl.value.slice(0, start) + text + roomEl.value.slice(end);
            roomEl.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    // Reasonable defaults (matches the screenshot: audio/video on, others off)
    if (audioEl) audioEl.checked = true;
    if (videoEl) videoEl.checked = true;

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

    const canWebShare = typeof navigator?.share === 'function';
    if (shareBtn) {
        shareBtn.hidden = !canWebShare;
    }

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

    const normalizeDuration = (raw) => {
        const value = safe(raw);
        if (!value) return 'unlimited';
        if (value.toLowerCase() === 'unlimited') return 'unlimited';
        // Validate HH:MM:SS format only
        const re = /^(\d{2}):(\d{2}):(\d{2})$/;
        if (!re.test(value)) {
            throw new Error('Продолжительность должна быть в формате ЧЧ:ММ:СС, например 00:30:00');
        }
        return value;
    };

    const buildJoinUrl = () => {
        const room = stripCyrillic(safe(roomEl?.value));
        if (roomEl && roomEl.value !== room) roomEl.value = room;
        if (!room) {
            throw new Error('Укажите название комнаты');
        }
        if (!/^[A-Za-z0-9._:-]+$/.test(room)) {
            throw new Error('Название комнаты: только латиница, цифры и символы - _ : .');
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

        url.searchParams.set('duration', duration);

        if (token) url.searchParams.set('token', token);

        return url;
    };

    const buildJoinUrlForPreview = () => {
        // For preview we do not hard-fail on empty room.
        const room = safe(roomEl?.value) || 'random';
        const url = new URL('/join', window.location.origin);
        if (!room) return url;
        try {
            return buildJoinUrl();
        } catch {
            return url;
        }
    };

    let qrCode = null;

    const ensureQrCode = () => {
        if (!qrEl) return null;
        if (qrCode) return qrCode;
        if (typeof window.QRCode !== 'function') return null;

        const correctLevel = window.QRCode.CorrectLevel?.M;

        const options = {
            width: 180,
            height: 180,
            // QR всегда контрастный: CSS-переменные с var(...) qrcodejs не умеет разрешать.
            colorDark: '#111827',
            colorLight: '#ffffff',
        };

        if (correctLevel !== undefined) {
            options.correctLevel = correctLevel;
        }

        qrCode = new window.QRCode(qrEl, options);

        return qrCode;
    };

    const updateShareAndQr = (joinUrl) => {
        const hasValidUrl = !!joinUrl;

        if (shareBtn) {
            shareBtn.disabled = !hasValidUrl;
        }

        if (!hasValidUrl) {
            if (qrWrapEl) qrWrapEl.hidden = true;
            return;
        }
        const qr = ensureQrCode();
        if (qrWrapEl) {
            qrWrapEl.hidden = !qr;
        }
        if (!qr) return;

        try {
            qr.clear();
            qr.makeCode(joinUrl.toString());
        } catch {
            // No-op: QR generation failure should not block the form.
        }
    };

    const updatePreview = () => {
        if (!previewEl) return;
        const url = buildJoinUrlForPreview();
        const room = safe(roomEl?.value);
        previewEl.value = room ? url.toString() : `${window.location.origin}/join?room=...`;
        if (copyBtn) copyBtn.disabled = !room;

        let joinUrl = null;
        try {
            joinUrl = buildJoinUrl();
        } catch {
            joinUrl = null;
        }
        updateShareAndQr(joinUrl);
    };

    const copyToClipboard = async (text) => {
        if (navigator.clipboard?.writeText && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }
        // Fallback
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
            roomEl.value = window.RoomNameGen?.generate?.() || uuidv4();
            updatePreview();
            roomEl.focus();
        });
    }

    // Live preview
    updatePreview();

    const inputs = [roomEl, nameEl, avatarEl, tokenEl, audioEl, videoEl, screenEl, chatEl, hideEl, notifyEl];
    inputs.push(roomPasswordEl, durationEl);
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

    if (shareBtn && canWebShare) {
        shareBtn.addEventListener('click', async () => {
            setError('');
            setStatus('');
            try {
                const joinUrl = buildJoinUrl();
                await navigator.share({
                    title: document.title || 'Комната OPTRF',
                    url: joinUrl.toString(),
                });
            } catch (err) {
                // Ignore user cancellation; surface other errors.
                const msg = err && err.name === 'AbortError' ? '' : err?.message;
                if (msg) setError(msg);
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
                const profileResponse = await fetch('/phone/profile', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ displayName }),
                });
                const profile = await profileResponse.json().catch(() => ({}));
                if (!profileResponse.ok || !profile.ok) {
                    throw new Error(profile.error || 'Не удалось сохранить имя');
                }
                window.localStorage.peer_name = profile.displayName;
                window.sessionStorage.phone_display_name = profile.displayName;
            }
            window.location.href = joinUrl.toString();
        } catch (err) {
            setError(err?.message || 'Не удалось сформировать ссылку для входа');
        }
    });
});
