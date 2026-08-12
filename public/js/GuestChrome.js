'use strict';

/**
 * Force guest dock chrome: no settings/chat/hear-only, always show share-link.
 * Does not rely on CSS body.is-guest alone (that class can lag behind role changes).
 */
function enforceGuestChrome(forceGuest) {
    const guest =
        typeof forceGuest === 'boolean'
            ? forceGuest
            : typeof isPresenter !== 'undefined'
              ? !isPresenter
              : document.documentElement.getAttribute('data-peer-role') === 'guest';

    try {
        document.documentElement.setAttribute('data-peer-role', guest ? 'guest' : 'presenter');
        document.body?.classList?.toggle?.('is-guest', guest);
        document.body?.classList?.toggle?.('is-presenter', !guest);
    } catch {
        /* ignore */
    }

    const hideIds = [
        'settingsSplit',
        'settingsButton',
        'settingsExtraDropdown',
        'settingsExtraToggle',
        'settingsExtraMenu',
        'chatButton',
        'hearOnlyPresenterButton',
        'compactHearOnlyBtn',
        'participantsButton',
        'inviteAllDiscussionButton',
    ];

    if (guest) {
        hideIds.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.add('hidden');
            el.style.setProperty('display', 'none', 'important');
            el.setAttribute('data-guest-hidden', '1');
        });
        // Leave meeting — only room creator (never guests)
        ['exitDropdown', 'exitButton', 'exitMenu', 'chatCloseButton'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.add('hidden');
            el.style.setProperty('display', 'none', 'important');
            el.setAttribute('data-guest-hidden', '1');
        });
        if (typeof BUTTONS !== 'undefined') {
            BUTTONS.main.settingsButton = false;
            BUTTONS.main.chatButton = false;
            BUTTONS.main.participantsButton = false;
            BUTTONS.main.exitButton = false;
        }
    } else {
        hideIds.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.getAttribute('data-guest-hidden') === '1') {
                el.removeAttribute('data-guest-hidden');
                el.style.removeProperty('display');
                el.classList.remove('hidden');
            }
        });
        if (typeof BUTTONS !== 'undefined') {
            BUTTONS.main.settingsButton = true;
            BUTTONS.main.chatButton = true;
            BUTTONS.main.participantsButton = true;
            // exitButton restored only for creator via syncCreatorOnlyChrome
            BUTTONS.main.exitButton = false;
        }
        // Ensure moderator can open participants / chat
        const pBtn = document.getElementById('participantsButton');
        if (pBtn) {
            pBtn.classList.remove('hidden');
            pBtn.style.removeProperty('display');
            pBtn.removeAttribute('data-guest-hidden');
        }
        const chatBtn = document.getElementById('chatButton');
        if (chatBtn) {
            chatBtn.classList.remove('hidden');
            chatBtn.style.removeProperty('display');
            chatBtn.removeAttribute('data-guest-hidden');
        }
        // Leave + chat X: creator only — do not restore for moderators
        try {
            if (typeof rc !== 'undefined' && rc?.syncCreatorOnlyChrome) {
                rc.syncCreatorOnlyChrome();
            } else {
                ['exitDropdown', 'exitButton', 'exitMenu', 'chatCloseButton'].forEach((id) => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    el.classList.add('hidden');
                    el.style.setProperty('display', 'none', 'important');
                    el.setAttribute('data-guest-hidden', '1');
                });
            }
        } catch {
            /* ignore */
        }
    }

    // Share / copy room link — everyone, all devices
    const copyBtn = document.getElementById('copyRoomLinkButton');
    if (copyBtn) {
        copyBtn.classList.remove('hidden');
        copyBtn.style.setProperty('display', 'inline-flex', 'important');
        copyBtn.setAttribute('aria-label', 'Поделиться ссылкой');
        copyBtn.setAttribute('title', 'Поделиться ссылкой');
        copyBtn.removeAttribute('data-guest-hidden');
    }
}

/** Keep mic dock toggle visible for dialog / spotlit guests after mute. */
function enforceGuestMicVisible(micOn) {
    const startBtn = document.getElementById('startAudioButton');
    const stopBtn = document.getElementById('stopAudioButton');
    const split = document.getElementById('startAudioSplit');
    if (!startBtn || !stopBtn) return;

    const inDialog =
        typeof rc !== 'undefined' &&
        !!(
            rc._broadcastSpotlit ||
            rc._dialogSplitActive ||
            (rc._dialogGuestIds || []).includes(rc.peer_id) ||
            document.body?.classList?.contains?.('dialog-participant') ||
            document.body?.classList?.contains?.('dialog-split-active')
        );

    // Only dialog / spotlit participants keep a persistent mic toggle
    if (!inDialog) return;

    if (typeof BUTTONS !== 'undefined') BUTTONS.main.startAudioButton = true;
    split?.style?.setProperty?.('display', 'inline-flex', 'important');
    document.body?.classList?.add?.('dialog-participant');

    if (micOn) {
        startBtn.classList.add('hidden');
        startBtn.classList.remove('optrf-mic-visible');
        startBtn.style.setProperty('display', 'none', 'important');
        stopBtn.classList.remove('hidden');
        stopBtn.style.setProperty('display', 'inline-flex', 'important');
    } else {
        stopBtn.classList.add('hidden');
        stopBtn.style.setProperty('display', 'none', 'important');
        startBtn.classList.remove('hidden');
        startBtn.classList.add('optrf-mic-visible');
        startBtn.style.setProperty('display', 'inline-flex', 'important');
        startBtn.disabled = false;
    }
}

if (typeof window !== 'undefined') {
    window.enforceGuestChrome = enforceGuestChrome;
    window.enforceGuestMicVisible = enforceGuestMicVisible;
}
