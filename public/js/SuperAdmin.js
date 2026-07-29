'use strict';

(() => {
    const state = {
        data: null,
        pendingRoleUpdates: new Set(),
    };
    const byId = (id) => document.getElementById(id);
    const roles = [
        { value: 'participant', label: 'Участник' },
        { value: 'creator', label: 'Организатор' },
        { value: 'super_admin', label: 'Супер-администратор' },
    ];

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

    function getUserRole(user) {
        if (roles.some(({ value }) => value === user.role)) return user.role;
        if (user.isSuperAdmin) return 'super_admin';
        if (user.canCreate) return 'creator';
        return 'participant';
    }

    function replaceUser(updatedUser, phone) {
        const users = state.data?.users;
        if (!Array.isArray(users)) return;
        const index = users.findIndex((user) => user.phone === phone);
        if (index !== -1) users[index] = { ...users[index], ...updatedUser };
    }

    async function updateUserRole(user, role, controls) {
        const { select, button, status } = controls;
        const currentRole = getUserRole(user);
        if (role === currentRole || state.pendingRoleUpdates.size) return;

        const usersSearch = byId('usersSearch');
        const refresh = byId('adminRefresh');
        state.pendingRoleUpdates.add(user.phone);
        document.querySelectorAll('.admin-role-select, .admin-role-save').forEach((control) => {
            control.disabled = true;
        });
        usersSearch.disabled = true;
        refresh.disabled = true;
        status.className = 'admin-role-status';
        status.textContent = 'Сохранение…';

        try {
            const response = await fetch(`/phone/admin/users/${encodeURIComponent(user.phone)}/role`, {
                method: 'PATCH',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ role }),
            });
            const data = await response.json().catch(() => ({}));
            if (response.status === 401) {
                window.location.href = '/phone-auth?next=%2Fsuper-admin';
                return;
            }
            if (!response.ok || !data.ok || !data.user) {
                throw new Error(data.error || 'Не удалось изменить роль');
            }

            replaceUser(data.user, user.phone);
            renderUsers();
            const adminStatus = byId('adminStatus');
            adminStatus.className = 'admin-status admin-success';
            adminStatus.textContent = `Роль пользователя ${user.phone} обновлена`;
        } catch (error) {
            select.value = currentRole;
            status.className = 'admin-role-status admin-role-status--error';
            status.textContent = error.message || 'Ошибка изменения роли';
        } finally {
            state.pendingRoleUpdates.delete(user.phone);
            usersSearch.disabled = false;
            refresh.disabled = false;
            document.querySelectorAll('.admin-role-select').forEach((roleSelect) => {
                roleSelect.disabled = false;
            });
            document.querySelectorAll('.admin-role-save').forEach((roleButton) => {
                roleButton.disabled = roleButton.previousElementSibling.value === roleButton.dataset.currentRole;
            });
        }
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
            const roleCell = cell(row, '', 'admin-role-cell');
            const roleControls = document.createElement('div');
            roleControls.className = 'admin-role-controls';
            const select = document.createElement('select');
            select.className = 'admin-role-select';
            select.setAttribute('aria-label', `Роль пользователя ${user.phone}`);
            roles.forEach(({ value, label }) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                select.appendChild(option);
            });
            const currentRole = getUserRole(user);
            select.value = currentRole;

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'admin-button admin-role-save';
            button.textContent = 'Сохранить';
            button.dataset.currentRole = currentRole;
            button.disabled = true;

            const roleStatus = document.createElement('span');
            roleStatus.className = 'admin-role-status';
            roleStatus.setAttribute('aria-live', 'polite');
            select.addEventListener('change', () => {
                button.disabled = select.value === currentRole;
                roleStatus.textContent = '';
                roleStatus.className = 'admin-role-status';
            });
            button.addEventListener('click', () => {
                updateUserRole(user, select.value, {
                    select,
                    button,
                    status: roleStatus,
                });
            });
            roleControls.append(select, button);
            roleCell.append(roleControls, roleStatus);
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
        if (state.pendingRoleUpdates.size) return;
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
            byId('adminStatus').className = 'admin-status';
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
