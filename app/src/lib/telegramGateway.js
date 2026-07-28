'use strict';

const axios = require('axios');
const { getAxiosProxyConfig, isProxyConfigured } = require('./proxy');

const API_URL = (process.env.TELEGRAM_GATEWAY_API_URL || 'https://gatewayapi.telegram.org/').replace(/\/$/, '');
const TOKEN = process.env.TELEGRAM_GATEWAY_TOKEN || '';

function formatPhoneE164(phoneNumber) {
    const digits = String(phoneNumber || '').replace(/\D/g, '');
    return digits ? `+${digits}` : '';
}

function translateApiError(errorCode) {
    const errorMessages = {
        ACCESS_TOKEN_INVALID: ['Ошибка авторизации: неверный токен Telegram Gateway.', true],
        PHONE_NUMBER_INVALID: ['Неверный формат номера телефона (ожидается E.164).', true],
        PHONE_NUMBER_UNOCCUPIED: ['Номер не связан с аккаунтом Telegram.', false],
        PHONE_NUMBER_NOT_AVAILABLE: ['Номер недоступен для Telegram Gateway.', false],
        REQUEST_ID_INVALID: ['Неверный или устаревший идентификатор запроса Telegram.', true],
        CODE_INVALID_FORMAT: ['Неверный формат кода подтверждения.', true],
        CODE_INVALID: ['Неверный код подтверждения Telegram.', true],
        CODE_MAX_ATTEMPTS_EXCEEDED: ['Превышено число попыток ввода кода Telegram.', true],
        EXPIRED: ['Срок действия кода или запроса Telegram истёк.', true],
        INTERNAL_ERROR: ['Внутренняя ошибка Telegram. Попробуйте позже.', false],
    };

    if (String(errorCode || '').startsWith('FLOOD_WAIT_')) {
        const seconds = String(errorCode).split('_').pop();
        return {
            message: `Слишком много запросов. Подождите ${seconds} сек.`,
            is_fatal: true,
            wait_seconds: Number(seconds) || 0,
        };
    }

    if (String(errorCode || '').startsWith('FLOOD_PREMIUM_WAIT_')) {
        const seconds = String(errorCode).split('_').pop();
        return {
            message: `Слишком много запросов. Подождите ${seconds} сек. или оформите Telegram Premium.`,
            is_fatal: true,
            wait_seconds: Number(seconds) || 0,
        };
    }

    const entry = errorMessages[errorCode];
    return {
        message: entry ? entry[0] : `Ошибка API Telegram: ${errorCode || 'UNKNOWN'}`,
        is_fatal: entry ? entry[1] : false,
        wait_seconds: 0,
    };
}

async function sendVerificationMessage(phoneNumber, code) {
    if (!TOKEN) {
        throw new Error('TELEGRAM_GATEWAY_TOKEN не задан');
    }
    if (!isProxyConfigured()) {
        throw new Error('PROXY_URL не задан — Telegram Gateway без прокси недоступен');
    }

    const formattedPhone = formatPhoneE164(phoneNumber);

    try {
        const response = await axios.post(
            `${API_URL}/sendVerificationMessage`,
            {
                phone_number: formattedPhone,
                code: String(code),
            },
            {
                headers: {
                    Authorization: `Bearer ${TOKEN}`,
                    'Content-Type': 'application/json',
                },
                timeout: 20000,
                ...getAxiosProxyConfig(),
            }
        );
        return response.data;
    } catch (error) {
        const errorData = error.response?.data;
        const errorCode = errorData?.error || (error.code === 'ECONNABORTED' ? 'INTERNAL_ERROR' : 'UNKNOWN_ERROR');
        const translation = translateApiError(errorCode);
        return {
            ok: false,
            error: translation.message,
            error_code: errorCode,
            is_fatal: translation.is_fatal,
            wait_seconds: translation.wait_seconds,
        };
    }
}

module.exports = {
    formatPhoneE164,
    translateApiError,
    sendVerificationMessage,
};
