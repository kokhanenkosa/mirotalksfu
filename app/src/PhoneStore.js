'use strict';

const fs = require('fs');
const path = require('path');

const HISTORY_LIMIT = 40;
const NAME_MAX = 32;
const ROLES = new Set(['participant', 'creator', 'super_admin']);
const LEGACY_IMPORT_NAME = 'phone-store-json-v1';
const ROLE_BOOTSTRAP_NAME = 'phone-role-bootstrap-v1';

function iso(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapUser(row) {
    if (!row) return null;
    return {
        phone: row.phone,
        displayName: row.display_name || '',
        role: row.role || 'participant',
        firstSeenAt: iso(row.first_seen_at),
        lastSeenAt: iso(row.last_seen_at),
        loginCount: Number(row.login_count) || 0,
        lastIp: row.last_ip || '',
        lastUserAgent: row.last_user_agent || '',
        updatedAt: iso(row.updated_at),
        roomsCreated: Number(row.rooms_created) || 0,
    };
}

function mapRoom(row) {
    return {
        roomId: row.room_id,
        createdByPhone: row.created_by_phone,
        createdAt: iso(row.created_at),
        endedAt: iso(row.ended_at),
        sessionId: row.session_id,
    };
}

class PhoneStore {
    constructor(opts = {}) {
        if (!opts.database) throw new Error('PhoneStore requires a PostgreSQL database');
        this.database = opts.database;
        this.filePath =
            opts.filePath || process.env.PHONE_STORE_PATH || path.join(__dirname, '../data/phone-store.json');
        this.log = typeof opts.log === 'function' ? opts.log : () => {};
        this.roleCache = new Map();
    }

    async initialize({ creators = [], superAdmins = [] } = {}) {
        await this._importLegacyJson();
        await this.database.query('UPDATE phone_room_sessions SET ended_at = NOW() WHERE ended_at IS NULL');
        await this._bootstrapRoles(creators, superAdmins);
        await this.refreshRoleCache();
    }

    async _ensureUser(queryable, phone) {
        await queryable.query('INSERT INTO phone_users(phone) VALUES($1) ON CONFLICT (phone) DO NOTHING', [phone]);
    }

    async _importLegacyJson() {
        const marker = await this.database.query('SELECT 1 FROM optrf_data_migrations WHERE name = $1', [
            LEGACY_IMPORT_NAME,
        ]);
        if (marker.rowCount) return;

        let parsed = { profiles: {}, history: {}, rooms: [] };
        if (fs.existsSync(this.filePath)) {
            const raw = fs.readFileSync(this.filePath, 'utf8');
            parsed = JSON.parse(raw || '{}');
        }

        const profiles = parsed.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : {};
        const history = parsed.history && typeof parsed.history === 'object' ? parsed.history : {};
        const rooms =
            Array.isArray(parsed.rooms) && parsed.rooms.length
                ? parsed.rooms
                : Object.entries(history).flatMap(([phone, items]) =>
                      (Array.isArray(items) ? items : []).map((room) => ({ ...room, createdByPhone: phone }))
                  );

        await this.database.transaction(async (client) => {
            for (const [phone, profile] of Object.entries(profiles)) {
                await client.query(
                    `INSERT INTO phone_users(
                        phone, display_name, first_seen_at, last_seen_at, login_count,
                        last_ip, last_user_agent, created_at, updated_at
                    ) VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($3,NOW()),COALESCE($8,NOW()))
                    ON CONFLICT (phone) DO UPDATE SET
                        display_name = CASE WHEN phone_users.display_name = '' THEN EXCLUDED.display_name ELSE phone_users.display_name END,
                        first_seen_at = COALESCE(phone_users.first_seen_at, EXCLUDED.first_seen_at),
                        last_seen_at = CASE
                            WHEN phone_users.last_seen_at IS NULL THEN EXCLUDED.last_seen_at
                            WHEN EXCLUDED.last_seen_at IS NULL THEN phone_users.last_seen_at
                            WHEN phone_users.last_seen_at < EXCLUDED.last_seen_at THEN EXCLUDED.last_seen_at
                            ELSE phone_users.last_seen_at
                        END,
                        login_count = CASE
                            WHEN phone_users.login_count < EXCLUDED.login_count THEN EXCLUDED.login_count
                            ELSE phone_users.login_count
                        END,
                        last_ip = CASE WHEN phone_users.last_ip = '' THEN EXCLUDED.last_ip ELSE phone_users.last_ip END,
                        last_user_agent = CASE WHEN phone_users.last_user_agent = '' THEN EXCLUDED.last_user_agent ELSE phone_users.last_user_agent END`,
                    [
                        phone,
                        String(profile?.displayName || '').slice(0, NAME_MAX),
                        iso(profile?.firstSeenAt),
                        iso(profile?.lastSeenAt),
                        Number(profile?.loginCount) || 0,
                        String(profile?.lastIp || '').slice(0, 128),
                        String(profile?.lastUserAgent || '').slice(0, 500),
                        iso(profile?.updatedAt),
                    ]
                );
            }

            let importedRooms = 0;
            for (const room of rooms) {
                const phone = String(room?.createdByPhone || '');
                const roomId = String(room?.roomId || '');
                if (!phone || !roomId) continue;
                await this._ensureUser(client, phone);
                const createdAt = iso(room.createdAt) || new Date().toISOString();
                const sessionId =
                    String(room.sessionId || '') || `legacy:${phone}:${roomId}:${createdAt.replace(/[^0-9]/g, '')}`;
                const result = await client.query(
                    `INSERT INTO phone_room_sessions(
                        session_id, room_id, created_by_phone, created_at, ended_at
                    ) VALUES($1,$2,$3,$4,$5)
                    ON CONFLICT DO NOTHING`,
                    [sessionId, roomId, phone, createdAt, iso(room.endedAt)]
                );
                importedRooms += result.rowCount;
            }

            await client.query(
                `INSERT INTO optrf_data_migrations(name, details)
                 VALUES($1, $2::jsonb)`,
                [
                    LEGACY_IMPORT_NAME,
                    JSON.stringify({
                        source: this.filePath,
                        profiles: Object.keys(profiles).length,
                        rooms: importedRooms,
                    }),
                ]
            );
        });
    }

    async _bootstrapRoles(creators, superAdmins) {
        const marker = await this.database.query('SELECT 1 FROM optrf_data_migrations WHERE name = $1', [
            ROLE_BOOTSTRAP_NAME,
        ]);
        if (marker.rowCount) return;

        await this.database.transaction(async (client) => {
            for (const phone of creators) {
                if (!phone) continue;
                await this._ensureUser(client, phone);
                await client.query(
                    `UPDATE phone_users
                     SET role = CASE WHEN role = 'super_admin' THEN role ELSE 'creator' END, updated_at = NOW()
                     WHERE phone = $1`,
                    [phone]
                );
            }
            for (const phone of superAdmins) {
                if (!phone) continue;
                await this._ensureUser(client, phone);
                await client.query(`UPDATE phone_users SET role = 'super_admin', updated_at = NOW() WHERE phone = $1`, [
                    phone,
                ]);
            }
            await client.query(
                `INSERT INTO optrf_data_migrations(name, details)
                 VALUES($1, $2::jsonb)`,
                [
                    ROLE_BOOTSTRAP_NAME,
                    JSON.stringify({
                        creators: creators.length,
                        superAdmins: superAdmins.length,
                    }),
                ]
            );
        });
    }

    async refreshRoleCache() {
        const result = await this.database.query('SELECT phone, role FROM phone_users');
        this.roleCache = new Map(result.rows.map((row) => [row.phone, row.role]));
        return this.roleCache;
    }

    getRole(phone) {
        return this.roleCache.get(phone) || 'participant';
    }

    canCreate(phone) {
        return ['creator', 'super_admin'].includes(this.getRole(phone));
    }

    isSuperAdmin(phone) {
        return this.getRole(phone) === 'super_admin';
    }

    async getProfile(phone) {
        if (!phone) return null;
        const result = await this.database.query('SELECT * FROM phone_users WHERE phone = $1', [phone]);
        return mapUser(result.rows[0]);
    }

    async getDisplayName(phone) {
        return (await this.getProfile(phone))?.displayName || '';
    }

    async setDisplayName(phone, nameRaw) {
        if (!phone) return { ok: false, error: 'Нет номера' };
        let name = String(nameRaw || '')
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, NAME_MAX)
            .replace(/[\u0000-\u001F\u007F]/g, '');
        if (!name) return { ok: false, error: 'Укажите имя' };
        if (name.length < 2) return { ok: false, error: 'Имя слишком короткое' };

        const result = await this.database.query(
            `INSERT INTO phone_users(phone, display_name, updated_at)
             VALUES($1,$2,NOW())
             ON CONFLICT (phone) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()
             RETURNING display_name`,
            [phone, name]
        );
        return { ok: true, displayName: result.rows[0].display_name };
    }

    async recordLogin(phone, meta = {}) {
        if (!phone) return null;
        const result = await this.database.query(
            `INSERT INTO phone_users(
                phone, first_seen_at, last_seen_at, login_count, last_ip, last_user_agent, updated_at
             ) VALUES($1,NOW(),NOW(),1,$2,$3,NOW())
             ON CONFLICT (phone) DO UPDATE SET
                first_seen_at = COALESCE(phone_users.first_seen_at, NOW()),
                last_seen_at = NOW(),
                login_count = phone_users.login_count + 1,
                last_ip = EXCLUDED.last_ip,
                last_user_agent = EXCLUDED.last_user_agent,
                updated_at = NOW()
             RETURNING *`,
            [phone, String(meta.ip || '').slice(0, 128), String(meta.userAgent || '').slice(0, 500)]
        );
        if (!this.roleCache.has(phone)) this.roleCache.set(phone, result.rows[0].role || 'participant');
        return mapUser(result.rows[0]);
    }

    async recordRoomCreated(phone, roomId, sessionId) {
        if (!phone || !roomId) return false;
        await this._ensureUser(this.database, phone);
        const safeSessionId = String(sessionId || `${phone}:${roomId}:${Date.now()}`);
        const result = await this.database.query(
            `INSERT INTO phone_room_sessions(session_id, room_id, created_by_phone)
             VALUES($1,$2,$3)
             ON CONFLICT DO NOTHING`,
            [safeSessionId, roomId, phone]
        );
        return result.rowCount > 0;
    }

    async recordRoomEnded(phone, roomId) {
        if (!phone || !roomId) return false;
        const result = await this.database.query(
            `UPDATE phone_room_sessions SET ended_at = NOW()
             WHERE created_by_phone = $1 AND room_id = $2 AND ended_at IS NULL`,
            [phone, roomId]
        );
        return result.rowCount > 0;
    }

    async getHistory(phone) {
        if (!phone) return [];
        const result = await this.database.query(
            `SELECT * FROM phone_room_sessions
             WHERE created_by_phone = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [phone, HISTORY_LIMIT]
        );
        return result.rows.map(mapRoom);
    }

    async getAllUsers() {
        const [users, counts] = await Promise.all([
            this.database.query('SELECT * FROM phone_users ORDER BY last_seen_at DESC NULLS LAST, created_at DESC'),
            this.database.query(
                'SELECT created_by_phone, COUNT(*)::integer AS rooms_created FROM phone_room_sessions GROUP BY created_by_phone'
            ),
        ]);
        const roomCounts = new Map(counts.rows.map((row) => [row.created_by_phone, Number(row.rooms_created) || 0]));
        return users.rows.map((row) => mapUser({ ...row, rooms_created: roomCounts.get(row.phone) || 0 }));
    }

    async getAllRooms() {
        const result = await this.database.query('SELECT * FROM phone_room_sessions ORDER BY created_at DESC');
        return result.rows.map(mapRoom);
    }

    async setRole(phone, role) {
        if (!phone) return { ok: false, error: 'Нет номера' };
        if (!ROLES.has(role)) return { ok: false, error: 'Неизвестная роль' };

        const user = await this.database.transaction(async (client) => {
            await this._ensureUser(client, phone);
            const current = await client.query('SELECT role FROM phone_users WHERE phone = $1 FOR UPDATE', [phone]);
            if (current.rows[0]?.role === 'super_admin' && role !== 'super_admin') {
                const admins = await client.query(
                    `SELECT phone FROM phone_users WHERE role = 'super_admin' FOR UPDATE`
                );
                if (admins.rowCount <= 1) {
                    const error = new Error('Нельзя снять роль у последнего супер-администратора');
                    error.code = 'LAST_SUPER_ADMIN';
                    throw error;
                }
            }
            const updated = await client.query(
                `UPDATE phone_users SET role = $2, updated_at = NOW() WHERE phone = $1 RETURNING *`,
                [phone, role]
            );
            return mapUser(updated.rows[0]);
        });
        this.roleCache.set(phone, role);
        return { ok: true, user };
    }
}

PhoneStore.NAME_MAX = NAME_MAX;
PhoneStore.HISTORY_LIMIT = HISTORY_LIMIT;
PhoneStore.ROLES = ROLES;
module.exports = PhoneStore;
