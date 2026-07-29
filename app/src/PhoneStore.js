'use strict';

const fs = require('fs');
const path = require('path');

const HISTORY_LIMIT = 40;
const NAME_MAX = 32;

/**
 * Лёгкое файловое хранилище профилей телефонов и истории созданных комнат.
 * Переживает рестарт контейнера при монтировании volume на data-dir.
 */
class PhoneStore {
    /**
     * @param {object} opts
     * @param {string} [opts.filePath]
     * @param {Function} [opts.log]
     */
    constructor(opts = {}) {
        this.filePath =
            opts.filePath ||
            process.env.PHONE_STORE_PATH ||
            path.join(__dirname, '../data/phone-store.json');
        this.log = typeof opts.log === 'function' ? opts.log : () => {};
        /** @type {{ profiles: Record<string, { displayName: string, updatedAt: string }>, history: Record<string, Array<{ roomId: string, createdAt: string, endedAt: string|null, sessionId?: string }>> }} */
        this.data = { profiles: {}, history: {} };
        this._load();
    }

    _load() {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            if (!fs.existsSync(this.filePath)) {
                this._save();
                return;
            }
            const raw = fs.readFileSync(this.filePath, 'utf8');
            const parsed = JSON.parse(raw || '{}');
            this.data = {
                profiles: parsed.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : {},
                history: parsed.history && typeof parsed.history === 'object' ? parsed.history : {},
            };
        } catch (err) {
            this.log('PhoneStore load failed', err.message);
            this.data = { profiles: {}, history: {} };
        }
    }

    _save() {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (err) {
            this.log('PhoneStore save failed', err.message);
        }
    }

    getProfile(phone) {
        if (!phone) return null;
        return this.data.profiles[phone] || null;
    }

    getDisplayName(phone) {
        return this.getProfile(phone)?.displayName || '';
    }

    setDisplayName(phone, nameRaw) {
        if (!phone) return { ok: false, error: 'Нет номера' };
        let name = String(nameRaw || '')
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, NAME_MAX);
        // убрать управляющие символы
        name = name.replace(/[\u0000-\u001F\u007F]/g, '');
        if (!name) return { ok: false, error: 'Укажите имя' };
        if (name.length < 2) return { ok: false, error: 'Имя слишком короткое' };

        this.data.profiles[phone] = {
            displayName: name,
            updatedAt: new Date().toISOString(),
        };
        this._save();
        return { ok: true, displayName: name };
    }

    recordRoomCreated(phone, roomId, sessionId) {
        if (!phone || !roomId) return;
        if (!this.data.history[phone]) this.data.history[phone] = [];
        const list = this.data.history[phone];
        // не дублировать открытую запись той же комнаты
        const open = list.find((h) => h.roomId === roomId && !h.endedAt);
        if (open) return;
        list.unshift({
            roomId,
            createdAt: new Date().toISOString(),
            endedAt: null,
            sessionId: sessionId || undefined,
        });
        if (list.length > HISTORY_LIMIT) {
            this.data.history[phone] = list.slice(0, HISTORY_LIMIT);
        }
        this._save();
    }

    recordRoomEnded(phone, roomId) {
        if (!phone || !roomId) return;
        const list = this.data.history[phone];
        if (!list?.length) return;
        let changed = false;
        for (const item of list) {
            if (item.roomId === roomId && !item.endedAt) {
                item.endedAt = new Date().toISOString();
                changed = true;
            }
        }
        if (changed) this._save();
    }

    getHistory(phone) {
        if (!phone) return [];
        return Array.isArray(this.data.history[phone]) ? this.data.history[phone] : [];
    }
}

PhoneStore.NAME_MAX = NAME_MAX;
PhoneStore.HISTORY_LIMIT = HISTORY_LIMIT;

module.exports = PhoneStore;
