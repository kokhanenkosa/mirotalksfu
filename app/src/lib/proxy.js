'use strict';

const { ProxyAgent } = require('proxy-agent');

let cachedAgent;

function getProxyUrl() {
    const url = process.env.PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    return url && String(url).trim() ? String(url).trim() : undefined;
}

function isProxyConfigured() {
    return Boolean(getProxyUrl());
}

/**
 * Axios config for requests that must go through PROXY_URL (Telegram Gateway).
 */
function getAxiosProxyConfig() {
    const proxyUrl = getProxyUrl();
    if (!proxyUrl) {
        return {};
    }

    if (!cachedAgent) {
        cachedAgent = new ProxyAgent({
            getProxyForUrl: () => proxyUrl,
        });
    }

    return {
        httpAgent: cachedAgent,
        httpsAgent: cachedAgent,
        proxy: false,
    };
}

module.exports = {
    getProxyUrl,
    isProxyConfigured,
    getAxiosProxyConfig,
};
