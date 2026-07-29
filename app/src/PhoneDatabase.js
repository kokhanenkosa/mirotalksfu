'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATION_LOCK_ID = 731904221;

function positiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sslConfig(value) {
    const normalized = String(value || 'false')
        .trim()
        .toLowerCase();
    if (['', '0', 'false', 'off', 'disable'].includes(normalized)) return false;
    if (['verify', 'verify-full', 'strict'].includes(normalized)) return { rejectUnauthorized: true };
    return { rejectUnauthorized: false };
}

class PhoneDatabase {
    constructor(opts = {}) {
        this.connectionString = opts.connectionString || process.env.DATABASE_URL || '';
        this.migrationsPath = opts.migrationsPath || path.join(__dirname, '../migrations');
        this.log = typeof opts.log === 'function' ? opts.log : () => {};
        if (!opts.pool && !this.connectionString) {
            throw new Error('DATABASE_URL is required');
        }
        this.pool =
            opts.pool ||
            new Pool({
                connectionString: this.connectionString,
                ssl: sslConfig(opts.ssl ?? process.env.DATABASE_SSL),
                max: positiveInteger(opts.max ?? process.env.DATABASE_POOL_MAX, 10),
                connectionTimeoutMillis: positiveInteger(
                    opts.connectionTimeoutMillis ?? process.env.DATABASE_CONNECT_TIMEOUT_MS,
                    10000
                ),
                idleTimeoutMillis: positiveInteger(
                    opts.idleTimeoutMillis ?? process.env.DATABASE_IDLE_TIMEOUT_MS,
                    30000
                ),
                application_name: 'optrf-miro',
            });

        this.pool.on?.('error', (err) => this.log('PostgreSQL pool error', err.message));
    }

    async initialize() {
        const client = await this.pool.connect();
        try {
            await client.query('SELECT 1');
            await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
            await client.query(`
                CREATE TABLE IF NOT EXISTS optrf_schema_migrations (
                    name TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            `);

            const files = fs
                .readdirSync(this.migrationsPath)
                .filter((name) => name.endsWith('.sql'))
                .sort();

            for (const name of files) {
                const applied = await client.query('SELECT 1 FROM optrf_schema_migrations WHERE name = $1', [name]);
                if (applied.rowCount) continue;

                const sql = fs.readFileSync(path.join(this.migrationsPath, name), 'utf8');
                await client.query('BEGIN');
                try {
                    await client.query(sql);
                    await client.query('INSERT INTO optrf_schema_migrations(name) VALUES($1)', [name]);
                    await client.query('COMMIT');
                    this.log('PostgreSQL migration applied', name);
                } catch (err) {
                    await client.query('ROLLBACK');
                    throw err;
                }
            }
        } finally {
            try {
                await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
            } catch {
                // Соединение всё равно будет освобождено.
            }
            client.release();
        }
    }

    query(text, params) {
        return this.pool.query(text, params);
    }

    async transaction(work) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await work(client);
            await client.query('COMMIT');
            return result;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    close() {
        return this.pool.end();
    }
}

PhoneDatabase.sslConfig = sslConfig;
module.exports = PhoneDatabase;
