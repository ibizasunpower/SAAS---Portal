import fs from 'fs-extra';
import path from 'path';

const BASE_DIR = process.env.BASE_DIR || (process.platform === 'win32' ? 'd:/!ODOO/ODOO Apps/SASS - Portal' : '/home/portal');
const LOG_DIR = path.join(BASE_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'provisioning.log');

export interface AuditLogData {
    tenant: string;
    db: string;
    containerId?: string;
    action: 'create' | 'delete' | 'scan' | 'failed_create' | 'failed_delete';
    details?: string;
}

class ProvisioningLogger {
    private initialized = false;

    private async ensureLogDir() {
        if (this.initialized) return;
        try {
            await fs.ensureDir(LOG_DIR);
            this.initialized = true;
        } catch (err) {
            console.error('Failed to create logs directory:', err);
        }
    }

    async log(level: 'INFO' | 'WARN' | 'ERROR', category: string, message: string, meta?: any) {
        const timestamp = new Date().toISOString();
        const metaStr = meta ? ` | Meta: ${JSON.stringify(meta)}` : '';
        const logLine = `[${timestamp}] [${level}] [${category}] ${message}${metaStr}`;
        
        if (level === 'ERROR') {
            console.error(logLine);
        } else if (level === 'WARN') {
            console.warn(logLine);
        } else {
            console.log(logLine);
        }

        try {
            await this.ensureLogDir();
            await fs.appendFile(LOG_FILE, logLine + '\n', 'utf8');
        } catch (err) {
            console.error('Failed to write to provisioning.log:', err);
        }
    }

    async audit(data: AuditLogData) {
        const timestamp = new Date().toISOString();
        const { tenant, db, containerId, action, details } = data;
        
        // Strictly structured audit log format
        const auditLine = `[${timestamp}] [AUDIT] [${action.toUpperCase()}] tenant: ${tenant} | db: ${db} | container: ${containerId || 'N/A'} | details: ${details || 'None'}`;
        
        console.log(auditLine);

        try {
            await this.ensureLogDir();
            await fs.appendFile(LOG_FILE, auditLine + '\n', 'utf8');
        } catch (err) {
            console.error('Failed to write audit log:', err);
        }
    }

    async info(category: string, message: string, meta?: any) {
        await this.log('INFO', category, message, meta);
    }

    async warn(category: string, message: string, meta?: any) {
        await this.log('WARN', category, message, meta);
    }

    async error(category: string, message: string, meta?: any) {
        await this.log('ERROR', category, message, meta);
    }
}

export const logger = new ProvisioningLogger();
