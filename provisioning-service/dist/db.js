"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.ControlDatabase = void 0;
const pg_1 = require("pg");
const logger_1 = require("./logger");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const PG_HOST = process.env.PG_HOST || '127.0.0.1';
const PG_PORT = parseInt(process.env.PG_PORT || '5432');
const PG_USER = process.env.PG_USER || 'odoo';
const PG_PASSWORD = process.env.PG_PASSWORD || 'Enter@123!';
const PG_DATABASE = process.env.PG_DATABASE || 'postgres';
class ControlDatabase {
    pool;
    constructor() {
        this.pool = new pg_1.Pool({
            host: PG_HOST,
            port: PG_PORT,
            user: PG_USER,
            password: PG_PASSWORD,
            database: PG_DATABASE,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
        this.pool.on('error', (err) => {
            logger_1.logger.error('DATABASE', 'Unexpected error on idle database client', { error: err.message });
        });
    }
    async getPool() {
        return this.pool;
    }
    async init() {
        const client = await this.pool.connect();
        try {
            logger_1.logger.info('DATABASE', 'Initializing control database connection...');
            // Create tenants table
            await client.query(`
                CREATE TABLE IF NOT EXISTS tenants (
                    id VARCHAR(36) PRIMARY KEY,
                    name VARCHAR(255) UNIQUE NOT NULL,
                    db_name VARCHAR(255) UNIQUE NOT NULL,
                    container_name VARCHAR(255) UNIQUE NOT NULL,
                    domain VARCHAR(255),
                    odoo_port INTEGER NOT NULL,
                    status VARCHAR(50) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);
            logger_1.logger.info('DATABASE', 'Control database tables verified successfully.');
        }
        catch (err) {
            logger_1.logger.error('DATABASE', 'Failed to initialize database tables', { error: err.message });
            throw err;
        }
        finally {
            client.release();
        }
    }
    async getTenants() {
        const result = await this.pool.query('SELECT * FROM tenants ORDER BY created_at DESC');
        return result.rows;
    }
    async getTenant(idOrName) {
        const result = await this.pool.query('SELECT * FROM tenants WHERE id = $1 OR name = $1 OR container_name = $1 OR db_name = $1', [idOrName]);
        return result.rows[0] || null;
    }
    async insertTenant(record) {
        await this.pool.query(`INSERT INTO tenants (id, name, db_name, container_name, domain, odoo_port, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            record.id,
            record.name,
            record.db_name,
            record.container_name,
            record.domain,
            record.odoo_port,
            record.status
        ]);
    }
    async updateTenantStatus(id, status) {
        await this.pool.query('UPDATE tenants SET status = $1 WHERE id = $2', [status, id]);
    }
    async deleteTenantRecord(id) {
        await this.pool.query('DELETE FROM tenants WHERE id = $1', [id]);
    }
}
exports.ControlDatabase = ControlDatabase;
exports.db = new ControlDatabase();
