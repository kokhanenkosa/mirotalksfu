CREATE TABLE IF NOT EXISTS optrf_schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS phone_users (
    phone TEXT PRIMARY KEY,
    display_name VARCHAR(32) NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'participant'
        CHECK (role IN ('participant', 'creator', 'super_admin')),
    first_seen_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    login_count INTEGER NOT NULL DEFAULT 0 CHECK (login_count >= 0),
    last_ip VARCHAR(128) NOT NULL DEFAULT '',
    last_user_agent VARCHAR(500) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS phone_users_last_seen_idx
    ON phone_users (last_seen_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS phone_users_role_idx
    ON phone_users (role);

CREATE TABLE IF NOT EXISTS phone_room_sessions (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL UNIQUE,
    room_id TEXT NOT NULL,
    created_by_phone TEXT NOT NULL REFERENCES phone_users(phone) ON UPDATE CASCADE ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS phone_room_sessions_creator_created_idx
    ON phone_room_sessions (created_by_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS phone_room_sessions_room_created_idx
    ON phone_room_sessions (room_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS phone_room_sessions_open_unique_idx
    ON phone_room_sessions (created_by_phone, room_id)
    WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS optrf_data_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details JSONB NOT NULL DEFAULT '{}'::jsonb
);
