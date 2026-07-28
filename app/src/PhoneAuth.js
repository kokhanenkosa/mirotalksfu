'use strict';

const jwt = require('jsonwebtoken');
const { sendVerificationMessage, formatPhoneE164, translateApiError } = require('./lib/telegramGateway');
const { sendSms } = require('./lib/smsc');
const { isProxyConfigured } = require('./lib/proxy');

const COOKIE_NAME = 'phone_auth';
const OTP_TTL_MS = 5 * 60 * 1000;
const FLOOD_MS = 60 * 1000;

class PhoneAuth {
    /**
     * @param {object} opts
     * @param {boolean} opts.enabled
     * @param {string} opts.jwtKey
     * @param {string} opts.jwtExp
     * @param {string[]} opts.creators - E.164 phones that may create rooms
     * @param {object} opts.smsc - { login, password, sender, messageTemplate }
     * @param {Function} [opts.log]
     */
    constructor(opts = {}) {
        this.enabled = Boolean(opts.enabled);
        this.jwtKey = opts.jwtKey || 'mirotalksfu_jwt_secret';
        this.jwtExp = opts.jwtExp || '7d';
        this.creators = new Set((opts.creators || []).map((p) => formatPhoneE164(p)).filter(Boolean));
        this.smsc = opts.smsc || {};
        this.log = typeof opts.log === 'function' ? opts.log : () => {};
        /** @type {Map<string, { code: string, expiresAt: number, lastSentAt: number }>} */
        this.codes = new Map();
    }

    isEnabled() {
        return this.enabled;
    }

    canCreate(phone) {
        const formatted = formatPhoneE164(phone);
        if (!formatted) return false;
        if (this.creators.size === 0) return false;
        return this.creators.has(formatted);
    }

    normalizePhone(phone) {
        return formatPhoneE164(phone);
    }

    isValidPhone(phone) {
        return /^\+\d{11,15}$/.test(formatPhoneE164(phone));
    }

    generateCode() {
        return String(Math.floor(100000 + Math.random() * 900000));
    }

    parseCookies(cookieHeader = '') {
        const out = {};
        String(cookieHeader || '')
            .split(';')
            .forEach((part) => {
                const idx = part.indexOf('=');
                if (idx === -1) return;
                const key = part.slice(0, idx).trim();
                const val = decodeURIComponent(part.slice(idx + 1).trim());
                if (key) out[key] = val;
            });
        return out;
    }

    getTokenFromRequest(req) {
        if (!req) return '';
        const cookies = this.parseCookies(req.headers?.cookie);
        if (cookies[COOKIE_NAME]) return cookies[COOKIE_NAME];
        const auth = req.headers?.authorization || '';
        if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
        if (req.query?.phone_token) return String(req.query.phone_token);
        if (req.body?.phone_token) return String(req.body.phone_token);
        return '';
    }

    getTokenFromSocket(socket, payloadToken) {
        if (payloadToken) return String(payloadToken);
        const cookies = this.parseCookies(socket?.handshake?.headers?.cookie);
        return cookies[COOKIE_NAME] || socket?.handshake?.auth?.phone_token || '';
    }

    verifyToken(token) {
        if (!token) return null;
        try {
            const decoded = jwt.verify(token, this.jwtKey);
            if (decoded?.scope !== 'phone' || !decoded?.phone) return null;
            return {
                phone: formatPhoneE164(decoded.phone),
                canCreate: Boolean(decoded.canCreate),
            };
        } catch {
            return null;
        }
    }

    getSession(req) {
        return this.verifyToken(this.getTokenFromRequest(req));
    }

    getSocketSession(socket, payloadToken) {
        return this.verifyToken(this.getTokenFromSocket(socket, payloadToken));
    }

    signSession(phone) {
        const formatted = formatPhoneE164(phone);
        const canCreate = this.canCreate(formatted);
        const token = jwt.sign(
            {
                scope: 'phone',
                phone: formatted,
                canCreate,
            },
            this.jwtKey,
            { expiresIn: this.jwtExp }
        );
        return { token, phone: formatted, canCreate };
    }

    setAuthCookie(res, token) {
        const maxAge = 7 * 24 * 60 * 60;
        const secure = process.env.NODE_ENV === 'production' || String(process.env.SERVER_HOST_URL || '').startsWith('https');
        const parts = [
            `${COOKIE_NAME}=${encodeURIComponent(token)}`,
            'Path=/',
            'HttpOnly',
            'SameSite=Lax',
            `Max-Age=${maxAge}`,
        ];
        if (secure) parts.push('Secure');
        res.setHeader('Set-Cookie', parts.join('; '));
    }

    clearAuthCookie(res) {
        res.setHeader(
            'Set-Cookie',
            `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
        );
    }

    async sendCode(phoneRaw) {
        const phone = formatPhoneE164(phoneRaw);
        if (!this.isValidPhone(phone)) {
            return { ok: false, error: 'Укажите номер в формате +79001234567' };
        }

        const existing = this.codes.get(phone);
        if (existing && Date.now() - existing.lastSentAt < FLOOD_MS) {
            const wait = Math.ceil((FLOOD_MS - (Date.now() - existing.lastSentAt)) / 1000);
            return { ok: false, error: `Подождите ${wait} сек. перед повторной отправкой`, wait_seconds: wait };
        }

        const code = this.generateCode();
        this.codes.set(phone, {
            code,
            expiresAt: Date.now() + OTP_TTL_MS,
            lastSentAt: Date.now(),
        });

        this.log('PhoneAuth sendCode', { phone, proxy: isProxyConfigured() });

        let channel = 'telegram';
        let tgResult;

        try {
            tgResult = await sendVerificationMessage(phone, code);
        } catch (err) {
            this.log('PhoneAuth TG exception', err.message);
            tgResult = {
                ok: false,
                error: err.message,
                error_code: 'INTERNAL_ERROR',
                is_fatal: false,
            };
        }

        if (tgResult?.ok) {
            return {
                ok: true,
                channel: 'telegram',
                message: `Код отправлен в Telegram на ${phone}`,
                requestId: tgResult.result?.request_id,
            };
        }

        const errorCode = tgResult?.error_code || 'UNKNOWN_ERROR';
        const info = translateApiError(errorCode);
        const isFatal = tgResult?.is_fatal ?? info.is_fatal;

        if (isFatal) {
            this.codes.delete(phone);
            return {
                ok: false,
                error: tgResult?.error || info.message,
                wait_seconds: tgResult?.wait_seconds || info.wait_seconds || 0,
            };
        }

        // SMS fallback (SMSC)
        if (!this.smsc.login || !this.smsc.password) {
            this.codes.delete(phone);
            return {
                ok: false,
                error: tgResult?.error || info.message || 'Telegram недоступен, SMS не настроен',
            };
        }

        const template = this.smsc.messageTemplate || 'Код входа в видеоконференции ОПТ РФ: %CODE%';
        const message = template.replace(/%CODE%/g, code);

        try {
            const sms = await sendSms({
                phones: phone,
                message,
                login: this.smsc.login,
                password: this.smsc.password,
                sender: this.smsc.sender || undefined,
            });

            if (!sms.ok) {
                this.codes.delete(phone);
                this.log('PhoneAuth SMSC error', sms);
                return { ok: false, error: 'Не удалось отправить SMS. Попробуйте позже.' };
            }

            channel = 'sms';
            return {
                ok: true,
                channel,
                message: `Код отправлен по SMS на ${phone}`,
            };
        } catch (err) {
            this.codes.delete(phone);
            this.log('PhoneAuth SMSC exception', err.message);
            return { ok: false, error: 'Ошибка отправки SMS' };
        }
    }

    verifyCode(phoneRaw, codeRaw) {
        const phone = formatPhoneE164(phoneRaw);
        const code = String(codeRaw || '').trim();

        if (!this.isValidPhone(phone)) {
            return { ok: false, error: 'Неверный номер телефона' };
        }
        if (!/^\d{4,8}$/.test(code)) {
            return { ok: false, error: 'Неверный код' };
        }

        const entry = this.codes.get(phone);
        if (!entry) {
            return { ok: false, error: 'Код не найден или истёк. Запросите новый.' };
        }
        if (Date.now() > entry.expiresAt) {
            this.codes.delete(phone);
            return { ok: false, error: 'Код истёк. Запросите новый.' };
        }
        if (entry.code !== code) {
            return { ok: false, error: 'Неверный код' };
        }

        this.codes.delete(phone);
        const session = this.signSession(phone);
        return {
            ok: true,
            ...session,
        };
    }

    buildAuthRedirect(req, nextPath) {
        const next = nextPath || req.originalUrl || '/';
        return `/phone-auth?next=${encodeURIComponent(next)}`;
    }
}

PhoneAuth.COOKIE_NAME = COOKIE_NAME;

module.exports = PhoneAuth;
