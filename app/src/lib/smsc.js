'use strict';

const axios = require('axios');

/**
 * Минимальный клиент SMSC.ru (как в optrf/smsc_api.php).
 */
async function sendSms({ phones, message, login, password, sender }) {
    if (!login || !password) {
        throw new Error('SMSC_LOGIN / SMSC_PASSWORD не заданы');
    }

    const params = new URLSearchParams({
        login: String(login),
        psw: String(password),
        phones: String(phones),
        mes: String(message),
        fmt: '3',
        charset: 'utf-8',
    });

    if (sender) {
        params.set('sender', String(sender));
    }

    const { data } = await axios.get(`https://smsc.ru/sys/send.php?${params.toString()}`, {
        timeout: 20000,
    });

    // fmt=3 → JSON: { id, cnt, cost, balance } или { error, error_code }
    if (data && typeof data === 'object') {
        if (data.error || data.error_code) {
            return { ok: false, error: data.error || `SMSC error ${data.error_code}`, raw: data };
        }
        if (data.cnt > 0 || data.id) {
            return { ok: true, raw: data };
        }
    }

    return { ok: false, error: 'Неизвестный ответ SMSC', raw: data };
}

module.exports = {
    sendSms,
};
