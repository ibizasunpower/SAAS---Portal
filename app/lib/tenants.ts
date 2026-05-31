import { Pool } from 'pg';
import crypto from 'crypto';

const PG_HOST = process.env.PG_HOST || '127.0.0.1';
const PG_PORT = parseInt(process.env.PG_PORT || '5432');
const PG_USER = process.env.PG_USER || 'odoo';
const PG_PASSWORD = process.env.PG_PASSWORD || 'Enter@123!';
const PG_DATABASE = process.env.PG_DATABASE || 'postgres';

export interface Tenant {
    company: string;
    domain: string;
    dbName: string;
    plan: '18' | '19';
    createdAt: string;
}

export class TenantStore {
    private pool: Pool;
    private initialized = false;

    constructor() {
        this.pool = new Pool({
            host: PG_HOST,
            port: PG_PORT,
            user: PG_USER,
            password: PG_PASSWORD,
            database: PG_DATABASE,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
    }

    async initTable(): Promise<void> {
        if (this.initialized) return;
        try {
            // Establish target table structure
            await this.pool.query(`
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

            // Check and update dynamic columns for SaaS Dashboard metadata
            await this.pool.query(`
                ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company VARCHAR(255);
            `);

            // Ensure templates are locked as is_template = TRUE in PostgreSQL
            try {
                await this.pool.query('ALTER DATABASE template18 WITH is_template = TRUE;');
            } catch (template18Err) {
                // Ignore if not present or permission issue
            }
            try {
                await this.pool.query('ALTER DATABASE template19 WITH is_template = TRUE;');
            } catch (template19Err) {
                // Ignore if not present or permission issue
            }

            this.initialized = true;
        } catch (err: any) {
            console.error("Failed to initialize tenants table in Postgres:", err.message);
        }
    }

    async getTenants(): Promise<Tenant[]> {
        await this.initTable();
        try {
            const res = await this.pool.query('SELECT * FROM tenants ORDER BY created_at DESC');
            return res.rows.map(row => ({
                company: row.company || row.name,
                domain: row.name,
                dbName: row.db_name,
                plan: row.container_name.includes('18') || row.db_name.includes('18') ? '18' : '19',
                createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
            }));
        } catch (error) {
            console.error('Failed to get tenants from Postgres', error);
            return [];
        }
    }

    async addTenant(tenant: Tenant): Promise<void> {
        await this.initTable();
        
        // Double check duplication in the database
        const check = await this.pool.query(
            'SELECT 1 FROM tenants WHERE name = $1 OR db_name = $2',
            [tenant.domain, tenant.dbName]
        );
        if (check.rows.length > 0) {
            throw new Error(`Tenant with domain '${tenant.domain}' or database '${tenant.dbName}' already exists.`);
        }

        // Bypassing container_name uniqueness constraint using name suffix
        const containerName = `shared_odoo_${tenant.plan}_${tenant.domain}`;
        const id = crypto.randomUUID();
        
        await this.pool.query(
            `INSERT INTO tenants (id, name, db_name, container_name, domain, odoo_port, status, company) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                id,
                tenant.domain,
                tenant.dbName,
                containerName,
                `${tenant.domain}.odoo.saas`,
                8069,
                'active',
                tenant.company
            ]
        );
    }
}

export const tenantStore = new TenantStore();
