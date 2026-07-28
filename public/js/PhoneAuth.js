'use strict';

(() => {
    const phoneInput = document.getElementById('phoneInput');
    const codeInput = document.getElementById('codeInput');
    const sendCodeBtn = document.getElementById('sendCodeBtn');
    const verifyCodeBtn = document.getElementById('verifyCodeBtn');
    const resendBtn = document.getElementById('resendBtn');
    const changePhoneBtn = document.getElementById('changePhoneBtn');
    const stepPhone = document.getElementById('stepPhone');
    const stepCode = document.getElementById('stepCode');
    const stepSuccess = document.getElementById('stepSuccess');
    const codeHint = document.getElementById('codeHint');
    const errorBox = document.getElementById('phoneAuthError');
    const errorText = document.getElementById('phoneAuthErrorText');
    const otpBoxes = document.getElementById('otpBoxes');
    const paTitle = document.getElementById('paTitle');
    const paSub = document.getElementById('paSub');
    const paStepLine = document.getElementById('paStepLine');
    const paStep2 = document.getElementById('paStep2');
    const paIcon = document.getElementById('paIcon');

    const params = new URLSearchParams(window.location.search);
    const nextUrl = params.get('next') || '/';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function showError(msg) {
        if (!msg) {
            errorBox.hidden = true;
            errorText.textContent = '';
            return;
        }
        errorText.textContent = msg;
        errorBox.hidden = false;
        errorBox.style.animation = 'none';
        // restart shake
        void errorBox.offsetWidth;
        errorBox.style.animation = '';
    }

    function digitsOnly(value) {
        return String(value || '').replace(/\D/g, '');
    }

    function normalizePhone(value) {
        let digits = digitsOnly(value);
        if (!digits) return '';
        if (digits.startsWith('8') && digits.length === 11) digits = `7${digits.slice(1)}`;
        if (digits.length === 10) digits = `7${digits}`;
        if (!digits.startsWith('7') && digits.length >= 11) {
            return `+${digits}`;
        }
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

    function setBusy(btn, busy) {
        if (!btn) return;
        btn.disabled = Boolean(busy);
        btn.classList.toggle('is-loading', Boolean(busy));
    }

    function syncOtpBoxes(value) {
        if (!otpBoxes) return;
        const digits = digitsOnly(value).slice(0, 6).split('');
        const spans = otpBoxes.querySelectorAll('span');
        spans.forEach((span, i) => {
            span.textContent = digits[i] || '';
            span.classList.toggle('is-filled', Boolean(digits[i]));
            span.classList.toggle('is-active', i === digits.length && digits.length < 6);
        });
    }

    function setProgress(step) {
        const first = document.querySelector('.pa-step[data-step="1"]');
        if (step >= 2) {
            first?.classList.add('is-done');
            first?.classList.remove('is-active');
            paStepLine?.classList.add('is-on');
            paStep2?.classList.add('is-active');
        } else {
            first?.classList.add('is-active');
            first?.classList.remove('is-done');
            paStepLine?.classList.remove('is-on');
            paStep2?.classList.remove('is-active', 'is-done');
        }
    }

    function setCopy(step) {
        if (step === 'code') {
            paTitle.textContent = 'Введите код';
            paSub.textContent = 'Мы отправили 6‑значный код в Telegram или по SMS.';
            window.ThinkingOrbs?.update(paIcon, { state: 'solving' });
        } else if (step === 'success') {
            paTitle.textContent = 'Номер подтверждён';
            paSub.textContent = '';
            window.ThinkingOrbs?.update(paIcon, { state: 'shaping', paused: true });
        } else {
            paTitle.textContent = 'Подтвердите номер';
            paSub.textContent =
                'Чтобы создать комнату или войти на встречу, нужен код из Telegram или SMS.';
            window.ThinkingOrbs?.update(paIcon, { state: 'composing', paused: false });
        }
    }

    function switchStep(fromEl, toEl, nextStep) {
        showError('');
        const finish = () => {
            if (fromEl) {
                fromEl.hidden = true;
                fromEl.classList.remove('is-leaving', 'is-active');
            }
            if (toEl) {
                toEl.hidden = false;
                toEl.classList.add('is-active');
            }
            setCopy(nextStep);
            setProgress(nextStep === 'phone' ? 1 : 2);
        };

        if (!fromEl || reduceMotion) {
            finish();
            return;
        }

        fromEl.classList.add('is-leaving');
        window.setTimeout(finish, 240);
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

    async function sendCode() {
        showError('');
        const phone = normalizePhone(phoneInput.value);
        if (!/^\+7\d{10}$/.test(phone) && !/^\+\d{11,15}$/.test(phone)) {
            showError('Введите корректный номер телефона');
            phoneInput.focus();
            return;
        }

        setBusy(sendCodeBtn, true);
        setBusy(resendBtn, true);
        try {
            const { res, data } = await postJson('/phone/send-code', { phone });
            if (!res.ok || !data.ok) {
                showError(data.error || 'Не удалось отправить код');
                return;
            }
            phoneInput.value = formatNational(phone);
            codeHint.textContent = data.message || 'Код отправлен';
            switchStep(stepPhone, stepCode, 'code');
            window.setTimeout(() => codeInput?.focus(), reduceMotion ? 0 : 280);
        } catch {
            showError('Ошибка сети. Попробуйте ещё раз.');
        } finally {
            setBusy(sendCodeBtn, false);
            setBusy(resendBtn, false);
        }
    }

    async function verifyCode() {
        showError('');
        const phone = normalizePhone(phoneInput.value);
        const code = digitsOnly(codeInput.value).slice(0, 8);
        if (code.length < 4) {
            showError('Введите код из сообщения');
            codeInput.focus();
            return;
        }

        setBusy(verifyCodeBtn, true);
        try {
            const { res, data } = await postJson('/phone/verify', { phone, code });
            if (!res.ok || !data.ok) {
                showError(data.error || 'Неверный код');
                codeInput.focus();
                return;
            }

            if (data.token) {
                window.sessionStorage.peer_token = data.token;
                window.sessionStorage.phone_auth = data.token;
                window.sessionStorage.phone_number = data.phone || phone;
                window.sessionStorage.phone_can_create = data.canCreate ? '1' : '0';
            }

            paStep2?.classList.add('is-done');
            switchStep(stepCode, stepSuccess, 'success');
            const safeNext = nextUrl.startsWith('/') ? nextUrl : '/';
            window.setTimeout(
                () => {
                    window.location.href = safeNext;
                },
                reduceMotion ? 150 : 900
            );
        } catch {
            showError('Ошибка сети. Попробуйте ещё раз.');
        } finally {
            setBusy(verifyCodeBtn, false);
        }
    }

    phoneInput?.addEventListener('input', () => {
        const caretEnd = phoneInput.selectionStart === phoneInput.value.length;
        phoneInput.value = formatNational(phoneInput.value);
        if (caretEnd) phoneInput.setSelectionRange(phoneInput.value.length, phoneInput.value.length);
    });

    codeInput?.addEventListener('input', () => {
        codeInput.value = digitsOnly(codeInput.value).slice(0, 6);
        syncOtpBoxes(codeInput.value);
        if (codeInput.value.length === 6) verifyCode();
    });

    sendCodeBtn?.addEventListener('click', sendCode);
    resendBtn?.addEventListener('click', sendCode);
    verifyCodeBtn?.addEventListener('click', verifyCode);
    changePhoneBtn?.addEventListener('click', () => {
        codeInput.value = '';
        syncOtpBoxes('');
        switchStep(stepCode, stepPhone, 'phone');
        window.setTimeout(() => phoneInput?.focus(), reduceMotion ? 0 : 280);
    });

    phoneInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendCode();
    });
    codeInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') verifyCode();
    });

    codeInput?.addEventListener('focus', () => syncOtpBoxes(codeInput.value));
    codeInput?.addEventListener('blur', () => {
        otpBoxes?.querySelectorAll('span').forEach((s) => s.classList.remove('is-active'));
    });

    fetch('/phone/me', { credentials: 'same-origin' })
        .then((r) => r.json())
        .then((data) => {
            if (data?.ok && data.authenticated) {
                const safeNext = nextUrl.startsWith('/') ? nextUrl : '/';
                window.location.href = safeNext;
            }
        })
        .catch(() => {});

    phoneInput?.focus();
})();
