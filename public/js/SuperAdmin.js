'use strict';

(() => {
    const state = { data: null };
    const byId = (id) => document.getElementById(id);

    function formatDate(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return new Intl.DateTimeFormat('ru-RU', {
            dateStyle: 'short',
            timeStyle: 'short',
        }).format(date);
    }

    function setText(id, value) {
        const element = byId(id);
        if (element) element.textContent = String(value ?? '—');
    }

    function cell(row, text, className = '') {
        const td = document.createElement('td');
        td.textContent = text == null || text === '' ? '—' : String(text);
        if (className) td.className = className;
        row.appendChild(td);
        return td;
    }

    function badge(parent, text, accent = false) {
        const element = document.createElement('span');
        element.className = `admin-badge${accent ? ' admin-badge--accent' : ''}`;
        element.textContent = text;
        parent.appendChild(element);
    }

    function renderActiveRooms() {
        const body = byId('activeRoomsBody');
        const empty = byId('activeRoomsEmpty');
        const rooms = state.data?.activeRooms || [];
        body.replaceChildren();
        empty.hidden = rooms.length > 0;
        setText('activeRoomsCount', rooms.length);

        rooms.forEach((room) => {
            const row = document.createElement('tr');
            cell(row, room.id, 'admin-room-name');

            const creator = cell(row, '');
            const creatorName = document.createElement('div');
            creatorName.textContent = room.createdByName || 'Без имени';
            const creatorPhone = document.createElement('div');
            creatorPhone.className = 'admin-muted';
            creatorPhone.textContent = room.createdByPhone || '—';
            creator.append(creatorName, creatorPhone);

            cell(row, formatDate(room.createdAt));

            const peers = cell(row, '');
            if (room.peers?.length) {
                room.peers.forEach((peer) => {
                    const line = document.createElement('div');
                    line.textContent = `${peer.name || 'Без имени'}${peer.phone ? ` · ${peer.phone}` : ''}`;
                    peers.appendChild(line);
                });
            } else {
                peers.textContent = 'Нет участников';
                peers.className = 'admin-muted';
            }

            const flags = cell(row, '');
            badge(flags, `${room.peersCount} уч.`, true);
            if (room.locked) badge(flags, 'закрыта');
            if (room.lobby) badge(flags, 'лобби');
            if (room.recording) badge(flags, 'запись');
            if (room.broadcasting) badge(flags, 'трансляция');
            if (room.observersCount) badge(flags, `${room.observersCount} набл.`);

            const actions = cell(row, '');
            const observe = document.createElement('button');
            observe.type = 'button';
            observe.className = 'admin-button admin-button--accent';
            observe.textContent = 'Наблюдать';
            observe.addEventListener('click', () => {
                window.open(`/phone/admin/observe/${encodeURIComponent(room.id)}`, '_blank', 'noopener');
            });
            actions.appendChild(observe);
            body.appendChild(row);
        });
    }

    function renderUsers() {
        const body = byId('usersBody');
        const query = (byId('usersSearch').value || '').trim().toLocaleLowerCase('ru');
        const users = (state.data?.users || []).filter((user) =>
            `${user.phone} ${user.displayName || ''}`.toLocaleLowerCase('ru').includes(query)
        );
        body.replaceChildren();
        setText('usersCount', users.length);

        users.forEach((user) => {
            const row = document.createElement('tr');
            cell(row, user.phone, 'admin-phone');
            cell(row, user.displayName || 'Без имени');
            const role = cell(row, '');
            if (user.isSuperAdmin) badge(role, 'супер-админ', true);
            else if (user.canCreate) badge(role, 'организатор', true);
            else badge(role, 'участник');
            cell(row, formatDate(user.firstSeenAt));
            cell(row, formatDate(user.lastSeenAt));
            cell(row, Number(user.loginCount) || 0);
            cell(row, Number(user.roomsCreated) || 0);
            cell(row, user.lastIp || '—', 'admin-muted');
            body.appendChild(row);
        });
    }

    function renderHistory() {
        const body = byId('historyBody');
        const query = (byId('historySearch').value || '').trim().toLocaleLowerCase('ru');
        const history = (state.data?.history || []).filter((room) =>
            `${room.roomId} ${room.createdByPhone || ''} ${room.createdByName || ''}`
                .toLocaleLowerCase('ru')
                .includes(query)
        );
        body.replaceChildren();
        setText('historyCount', history.length);

        history.forEach((room) => {
            const row = document.createElement('tr');
            cell(row, room.roomId, 'admin-room-name');
            const creator = cell(row, '');
            const name = document.createElement('div');
            name.textContent = room.createdByName || 'Без имени';
            const phone = document.createElement('div');
            phone.className = 'admin-muted';
            phone.textContent = room.createdByPhone || '—';
            creator.append(name, phone);
            cell(row, formatDate(room.createdAt));
            cell(row, formatDate(room.endedAt));
            const status = cell(row, '');
            badge(status, room.isActive ? 'активна' : 'завершена', room.isActive);
            body.appendChild(row);
        });
    }

    function render() {
        const stats = state.data?.stats || {};
        setText('statUsers', stats.users || 0);
        setText('statLogins', stats.logins || 0);
        setText('statActiveRooms', stats.activeRooms || 0);
        setText('statParticipants', stats.activeParticipants || 0);
        setText('statRoomsTotal', stats.roomsTotal || 0);
        renderActiveRooms();
        renderUsers();
        renderHistory();
        setText('adminStatus', `Обновлено ${formatDate(state.data?.generatedAt)}`);
    }

    async function load() {
        const refresh = byId('adminRefresh');
        refresh.disabled = true;
        try {
            const response = await fetch('/phone/admin/overview', {
                credentials: 'same-origin',
                cache: 'no-store',
            });
            const data = await response.json().catch(() => ({}));
            if (response.status === 401) {
                window.location.href = '/phone-auth?next=%2Fsuper-admin';
                return;
            }
            if (!response.ok || !data.ok) throw new Error(data.error || 'Не удалось загрузить данные');
            state.data = data;
            render();
        } catch (error) {
            const status = byId('adminStatus');
            status.className = 'admin-status admin-error';
            status.textContent = error.message || 'Ошибка загрузки';
        } finally {
            refresh.disabled = false;
        }
    }

    byId('adminRefresh').addEventListener('click', load);
    byId('usersSearch').addEventListener('input', renderUsers);
    byId('historySearch').addEventListener('input', renderHistory);
    load();
    window.setInterval(() => {
        if (document.visibilityState === 'visible') load();
    }, 15000);
})();
