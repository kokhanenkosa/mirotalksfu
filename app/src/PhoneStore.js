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
            opts.filePath || process.env.PHONE_STORE_PATH || path.join(__dirname, '../data/phone-store.json');
        this.log = typeof opts.log === 'function' ? opts.log : () => {};
        /** @type {{ profiles: Record<string, object>, history: Record<string, Array<object>>, rooms: Array<object> }} */
        this.data = { profiles: {}, history: {}, rooms: [] };
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
                rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
            };
        } catch (err) {
            this.log('PhoneStore load failed', err.message);
            this.data = { profiles: {}, history: {}, rooms: [] };
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
            ...(this.data.profiles[phone] || {}),
            displayName: name,
            updatedAt: new Date().toISOString(),
        };
        this._save();
        return { ok: true, displayName: name };
    }

    recordLogin(phone, meta = {}) {
        if (!phone) return;
        const now = new Date().toISOString();
        const current = this.data.profiles[phone] || {};
        this.data.profiles[phone] = {
            ...current,
            displayName: current.displayName || '',
            firstSeenAt: current.firstSeenAt || now,
            lastSeenAt: now,
            loginCount: (Number(current.loginCount) || 0) + 1,
            lastIp: String(meta.ip || '').slice(0, 128),
            lastUserAgent: String(meta.userAgent || '').slice(0, 500),
            updatedAt: current.updatedAt || now,
        };
        this._save();
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
        this.data.rooms.unshift({
            roomId,
            createdByPhone: phone,
            createdAt: new Date().toISOString(),
            endedAt: null,
            sessionId: sessionId || undefined,
        });
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
        for (const item of this.data.rooms) {
            if (item.roomId === roomId && item.createdByPhone === phone && !item.endedAt) {
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

    getAllUsers() {
        const roomCounts = new Map();
        this.getAllRooms().forEach((room) => {
            if (room.createdByPhone) {
                roomCounts.set(room.createdByPhone, (roomCounts.get(room.createdByPhone) || 0) + 1);
            }
        });
        const phones = new Set([
            ...Object.keys(this.data.profiles),
            ...Object.keys(this.data.history),
            ...this.data.rooms.map((room) => room.createdByPhone).filter(Boolean),
        ]);
        return [...phones]
            .map((phone) => ({
                phone,
                ...(this.data.profiles[phone] || {}),
                roomsCreated: roomCounts.get(phone) || this.getHistory(phone).length,
            }))
            .sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')));
    }

    getAllRooms() {
        // Старые установки могли иметь только историю по пользователям.
        if (this.data.rooms.length === 0) {
            return Object.entries(this.data.history)
                .flatMap(([phone, rooms]) => rooms.map((room) => ({ ...room, createdByPhone: phone })))
                .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        }
        return this.data.rooms.map((room) => ({ ...room }));
    }
}

PhoneStore.NAME_MAX = NAME_MAX;
PhoneStore.HISTORY_LIMIT = HISTORY_LIMIT;
module.exports = PhoneStore;
