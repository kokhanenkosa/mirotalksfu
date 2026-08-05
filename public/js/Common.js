'use strict';

// Fallback if xss library failed to load (CDN blocked/unreachable)
if (typeof filterXSS === 'undefined') {
    var filterXSS = function (str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    };
}

// ####################################################################
// NEW ROOM
// ####################################################################

function makeRoomName() {
    if (window.RoomNameGen?.generate) return window.RoomNameGen.generate();
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `hookah-${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}-${p(d.getHours())}-${p(d.getMinutes())}`;
}

/** Safe room id for URLs/proxies: no spaces/colons (colon caused Coolify/Traefik 502 quirks). */
function sanitizeRoomName(value) {
    return String(value || '')
        .trim()
        .replace(/[:\s]+/g, '-')
        .replace(/[^a-zA-Z0-9._-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 64);
}

let txt = makeRoomName();

// ####################################################################
// Shuffle Text Effect
// ####################################################################

/**
 * Shuffle text effect for input fields
 * @param {HTMLInputElement} input
 * @param {string} finalValue
 * @param {number} duration
 */
function shuffleText(input, finalValue, duration = 600) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const steps = 10;
    const interval = duration / steps;
    let step = 0;

    input.classList.add('shuffle-active');

    const timer = setInterval(() => {
        step++;
        const progress = step / steps;
        let display = '';
        for (let i = 0; i < finalValue.length; i++) {
            if (i < finalValue.length * progress) {
                display += finalValue[i];
            } else {
                display += chars[Math.floor(Math.random() * chars.length)];
            }
        }
        input.value = display;

        if (step >= steps) {
            clearInterval(timer);
            input.value = finalValue;
            setTimeout(() => input.classList.remove('shuffle-active'), 300);
        }
    }, interval);
}

const CYRILLIC_CHARS = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/g;

function stripCyrillic(value) {
    return String(value || '').replace(CYRILLIC_CHARS, '');
}

function hasCyrillic(value) {
    return /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/.test(String(value || ''));
}

const roomName = document.getElementById('roomName');

if (roomName) {
    roomName.value = '';
    roomName.setAttribute('lang', 'en');
    roomName.setAttribute('inputmode', 'latin');
    roomName.setAttribute('spellcheck', 'false');
    roomName.setAttribute('autocomplete', 'off');
    roomName.setAttribute(
        'title',
        'Только латиница, цифры и символы - _ . (без двоеточия и пробелов)'
    );

    if (window.sessionStorage.roomID) {
        roomName.value = stripCyrillic(window.sessionStorage.roomID);
        window.sessionStorage.roomID = false;
        joinRoom();
    } else {
        shuffleText(roomName, txt);
    }

    roomName.addEventListener('input', () => {
        const cleaned = stripCyrillic(roomName.value);
        if (cleaned !== roomName.value) {
            const pos = roomName.selectionStart;
            const removed = roomName.value.length - cleaned.length;
            roomName.value = cleaned;
            const next = Math.max(0, (pos || 0) - removed);
            roomName.setSelectionRange(next, next);
        }
    });

    roomName.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = stripCyrillic(e.clipboardData?.getData('text') || '');
        const start = roomName.selectionStart || 0;
        const end = roomName.selectionEnd || 0;
        const value = roomName.value;
        roomName.value = value.slice(0, start) + text + value.slice(end);
        const caret = start + text.length;
        roomName.setSelectionRange(caret, caret);
        roomName.dispatchEvent(new Event('input', { bubbles: true }));
    });

    roomName.onkeyup = (e) => {
        if (e.keyCode === 13) {
            e.preventDefault();
            joinRoom();
        }
    };
}

// ####################################################################
// LANDING | NEW ROOM
// ####################################################################

const lastRoomContainer = document.getElementById('lastRoomContainer');
const lastRoom = document.getElementById('lastRoom');
const lastRoomName = window.localStorage.lastRoom ? window.localStorage.lastRoom : '';

if (lastRoomContainer && lastRoom && lastRoomName) {
    lastRoomContainer.style.display = 'inline-flex';
    lastRoom.setAttribute('href', '/join/?room=' + encodeURIComponent(lastRoomName));
    lastRoom.innerText = lastRoomName;
}

const genRoomButton = document.getElementById('genRoomButton');
const joinRoomButton = document.getElementById('joinRoomButton');
const customizeRoomButton = document.getElementById('customizeRoomButton');
const adultCnt = document.getElementById('adultCnt');

if (genRoomButton) {
    genRoomButton.onclick = () => {
        genRoom();
    };
}

async function ensureCanCreateOrGo(targetUrl) {
    try {
        const res = await fetch('/phone/me', { credentials: 'same-origin' });
        const data = await res.json().catch(() => ({}));
        if (data?.ok && data.authenticated && data.canCreate === false) {
            window.location.href = '/no-create-access';
            return;
        }
    } catch {
        // сеть упала — пусть сервер сам разрулит
    }
    window.location.href = targetUrl;
}

if (joinRoomButton) {
    joinRoomButton.onclick = () => {
        joinRoom();
    };
}

if (customizeRoomButton) {
    customizeRoomButton.onclick = () => {
        ensureCanCreateOrGo('/customizeRoom');
    };
}

if (adultCnt) {
    adultCnt.onclick = () => {
        adultContent();
    };
}

// Academy room-type toggle (Лекция / Конференция)
(() => {
    const toggle = document.getElementById('roomTypeToggle');
    const hidden = document.getElementById('roomType');
    if (!toggle || !hidden) return;

    toggle.addEventListener('click', (e) => {
        const btn = e.target.closest('.academy-type');
        if (!btn) return;
        const type = btn.getAttribute('data-room-type') || 'lectorium';
        hidden.value = type;
        toggle.querySelectorAll('.academy-type').forEach((el) => {
            const on = el === btn;
            el.classList.toggle('is-active', on);
            el.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    });
})();

function genRoom() {
    const input = document.getElementById('roomName');
    txt = makeRoomName();
    shuffleText(input, txt);
}

function getSelectedRoomType() {
    const hidden = document.getElementById('roomType');
    const v = (hidden && hidden.value) || 'lectorium';
    return v === 'conference' ? 'conference' : 'lectorium';
}

function joinRoom() {
    const inputEl = document.getElementById('roomName');
    const cleaned = sanitizeRoomName(stripCyrillic(filterXSS(inputEl.value)));
    if (inputEl.value !== cleaned) inputEl.value = cleaned;
    const roomValid = isValidRoomName(cleaned);

    if (!roomValid) {
        txt = makeRoomName();
        shuffleText(inputEl, txt);
        return;
    }

    const type = getSelectedRoomType();
    const lectorium = type === 'lectorium' ? '1' : '0';
    window.location.href =
        '/join/?room=' + encodeURIComponent(cleaned) + '&lectorium=' + encodeURIComponent(lectorium);
    window.localStorage.lastRoom = cleaned;
}

function isValidRoomName(input) {
    if (!input || typeof input !== 'string') {
        return false;
    }

    if (['false', 'undefined', ''].includes(input.trim().toLowerCase())) {
        return false;
    }

    if (hasCyrillic(input)) {
        return false;
    }

    // Латиница / цифры / безопасные символы URL (без «:» — ломает Traefik/Coolify)
    if (!/^[A-Za-z0-9._-]+$/.test(input)) {
        return false;
    }

    const pathTraversalPattern = /(\.\.(\/|\\))+/;
    return !pathTraversalPattern.test(input);
}

function adultContent() {
    if (
        confirm(
            '18+ WARNING! ADULTS ONLY!\n\nExplicit material for viewing by adults 18 years of age or older. You must be at least 18 years old to access to this site!\n\nProceeding you are agree and confirm to have 18+ year.'
        )
    ) {
        window.open('https://luvlounge.ca', '_blank');
    }
}

// #########################################################
// PERMISSIONS
// #########################################################

const qs = new URLSearchParams(window.location.search);
const room_id = filterXSS(qs.get('room_id'));
const message = filterXSS(qs.get('message'));
const showMessage = document.getElementById('message');
console.log('Allow Camera or Audio', {
    room_id: room_id,
    message: message,
});
if (showMessage) showMessage.innerHTML = message;
