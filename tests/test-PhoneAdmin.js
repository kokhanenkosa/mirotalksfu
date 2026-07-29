'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PhoneAuth = require('../app/src/PhoneAuth');
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

    it('keeps login metadata, all users and global room history', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-admin-'));
        const filePath = path.join(dir, 'store.json');

        try {
            const store = new PhoneStore({ filePath });
            store.recordLogin('+79001112233', { ip: '127.0.0.1', userAgent: 'test' });
            store.setDisplayName('+79001112233', 'Администратор');
            store.recordLogin('+79001112233', { ip: '127.0.0.2', userAgent: 'test-2' });
            store.recordRoomCreated('+79001112233', 'room-one', 'session-one');
            store.recordRoomEnded('+79001112233', 'room-one');

            const [user] = store.getAllUsers();
            assert.strictEqual(user.displayName, 'Администратор');
            assert.strictEqual(user.loginCount, 2);
            assert.strictEqual(user.roomsCreated, 1);
            assert.strictEqual(user.lastIp, '127.0.0.2');

            const [room] = store.getAllRooms();
            assert.strictEqual(room.roomId, 'room-one');
            assert.strictEqual(room.createdByPhone, '+79001112233');
            assert.ok(room.endedAt);
        } finally {
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
});
