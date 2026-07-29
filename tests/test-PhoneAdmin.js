'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DataType, newDb } = require('pg-mem');
const PhoneAuth = require('../app/src/PhoneAuth');
const PhoneDatabase = require('../app/src/PhoneDatabase');
const PhoneStore = require('../app/src/PhoneStore');
const Room = require('../app/src/Room');

describe('test-PhoneAdmin', () => {
    it('grants super-admin role by normalized phone and revokes it immediately', () => {
        const auth = new PhoneAuth({
            enabled: true,
            jwtKey: 'test-secret',
            creators: [],
            superAdmins: ['+7 (900) 111-22-33'],
        });

        const session = auth.signSession('+79001112233');
        assert.strictEqual(session.canCreate, true);
        assert.strictEqual(session.isSuperAdmin, true);
        assert.strictEqual(auth.verifyToken(session.token).isSuperAdmin, true);

        auth.superAdmins.clear();
        const revoked = auth.verifyToken(session.token);
        assert.strictEqual(revoked.isSuperAdmin, false);
        assert.strictEqual(revoked.canCreate, false);
    });

    it('uses the centralized role provider instead of JWT role claims', () => {
        const roles = new Map([['+79001112233', 'super_admin']]);
        const auth = new PhoneAuth({
            enabled: true,
            jwtKey: 'test-secret',
            roleProvider: {
                canCreate: (phone) => ['creator', 'super_admin'].includes(roles.get(phone)),
                isSuperAdmin: (phone) => roles.get(phone) === 'super_admin',
            },
        });

        const session = auth.signSession('+79001112233');
        assert.strictEqual(auth.verifyToken(session.token).isSuperAdmin, true);

        roles.set('+79001112233', 'participant');
        const revoked = auth.verifyToken(session.token);
        assert.strictEqual(revoked.isSuperAdmin, false);
        assert.strictEqual(revoked.canCreate, false);
    });

    it('migrates JSON and keeps users, roles and room history in PostgreSQL', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-admin-'));
        const filePath = path.join(dir, 'store.json');
        const memory = newDb({ noAstCoverageCheck: true });
        memory.public.registerFunction({
            name: 'pg_advisory_lock',
            args: [DataType.integer],
            returns: DataType.bool,
            implementation: () => true,
        });
        memory.public.registerFunction({
            name: 'pg_advisory_unlock',
            args: [DataType.integer],
            returns: DataType.bool,
            implementation: () => true,
        });
        const adapter = memory.adapters.createPg();
        const pool = new adapter.Pool();
        const database = new PhoneDatabase({
            pool,
            connectionString: 'postgres://test',
            migrationsPath: path.join(__dirname, '../app/migrations'),
        });

        try {
            fs.writeFileSync(
                filePath,
                JSON.stringify({
                    profiles: {
                        '+79001112233': {
                            displayName: 'Старое имя',
                            firstSeenAt: '2026-01-01T00:00:00.000Z',
                            lastSeenAt: '2026-01-02T00:00:00.000Z',
                            loginCount: 2,
                        },
                    },
                    rooms: [],
                })
            );
            await database.initialize();
            const store = new PhoneStore({ database, filePath });
            await store.initialize({ superAdmins: ['+79001112233'] });
            await store.recordLogin('+79001112233', { ip: '127.0.0.1', userAgent: 'test' });
            await store.setDisplayName('+79001112233', 'Администратор');
            await store.recordLogin('+79001112233', { ip: '127.0.0.2', userAgent: 'test-2' });
            await store.recordRoomCreated('+79001112233', 'room-one', 'session-one');
            await store.recordRoomEnded('+79001112233', 'room-one');

            const [user] = await store.getAllUsers();
            assert.strictEqual(user.displayName, 'Администратор');
            assert.strictEqual(user.loginCount, 4);
            assert.strictEqual(user.roomsCreated, 1);
            assert.strictEqual(user.lastIp, '127.0.0.2');
            assert.strictEqual(user.role, 'super_admin');
            assert.strictEqual(store.isSuperAdmin(user.phone), true);

            const [room] = await store.getAllRooms();
            assert.strictEqual(room.roomId, 'room-one');
            assert.strictEqual(room.createdByPhone, '+79001112233');
            assert.ok(room.endedAt);

            await assert.rejects(() => store.setRole('+79001112233', 'participant'), /последнего супер-администратора/);

            await store.recordLogin('+79002223344');
            await store.setRole('+79002223344', 'super_admin');
            const demoted = await store.setRole('+79001112233', 'creator');
            assert.strictEqual(demoted.ok, true);
            assert.strictEqual(store.canCreate('+79001112233'), true);

            await store.recordRoomCreated('+79001112233', 'room-after-restart', 'session-after-restart');

            // Повторная инициализация не импортирует JSON и роли второй раз,
            // а незакрытые комнаты прошлого процесса помечает завершёнными.
            await store.initialize({ superAdmins: ['+79001112233'] });
            const users = await store.getAllUsers();
            assert.strictEqual(users.length, 2);
            assert.strictEqual(store.getRole('+79001112233'), 'creator');
            const restartedRoom = (await store.getAllRooms()).find(
                (item) => item.sessionId === 'session-after-restart'
            );
            assert.ok(restartedRoom.endedAt);

            await database.initialize();
            const migrations = await database.query('SELECT COUNT(*)::integer AS count FROM optrf_schema_migrations');
            assert.strictEqual(Number(migrations.rows[0].count), 1);
        } finally {
            await database.close();
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('does not count hidden observers as visible participants', () => {
        const room = Object.create(Room.prototype);
        room.peers = new Map([
            ['user', { peer_info: { peer_observer: false } }],
            ['observer', { peer_info: { peer_observer: true } }],
        ]);

        assert.strictEqual(room.getPeersCount(), 2);
        assert.strictEqual(room.getVisiblePeersCount(), 1);
    });

    it('grants presenter only to room creator or super-admin', () => {
        const auth = new PhoneAuth({
            enabled: true,
            jwtKey: 'test-secret',
            creators: ['+79001112233'],
            superAdmins: ['+79009998877'],
        });

        assert.strictEqual(auth.canPresent('+79001112233', '+79001112233'), true);
        assert.strictEqual(auth.canPresent('+79009998877', '+79001112233'), true);
        assert.strictEqual(auth.canPresent('+79002223344', '+79001112233'), false);
        assert.strictEqual(auth.canPresent('+79002223344', null), false);
        assert.strictEqual(auth.canPresent('+79001112233', '+79000000000'), false);
    });

    it('falls back to cookie auth when socket payload is a cookie marker', () => {
        const auth = new PhoneAuth({
            enabled: true,
            jwtKey: 'test-secret',
            creators: [],
            superAdmins: ['+79001112233'],
        });
        const { token } = auth.signSession('+79001112233');
        const socket = {
            handshake: {
                headers: {
                    cookie: `phone_auth=${encodeURIComponent(token)}`,
                },
            },
        };

        assert.strictEqual(auth.getSocketSession(socket, 'cookie')?.phone, '+79001112233');
        assert.strictEqual(auth.getSocketSession(socket, '1')?.phone, '+79001112233');
        assert.strictEqual(auth.getSocketSession(socket, '')?.phone, '+79001112233');
        assert.strictEqual(auth.getSocketSession(socket, token)?.phone, '+79001112233');
    });
});
