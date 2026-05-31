import fs from 'fs-extra';
import path from 'path';

const BASE_DIR = process.env.BASE_DIR || (process.platform === 'win32' ? 'd:/!ODOO/ODOO Apps/SASS - Portal' : '/home/portal');
const LOG_DIR = path.join(BASE_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'saas.log');

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';
export type LogCategory = 'CREATION' | 'DELETION' | 'DATABASE' | 'CONTAINER' | 'REGISTRY' | 'HEALTH' | 'CLEANUP' | 'PROVISION';

class SaasLogger {
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

    private formatMessage(level: LogLevel, category: LogCategory, message: string, details?: any): string {
        const timestamp = new Date().toISOString();
        const detailsStr = details ? ` | Details: ${typeof details === 'object' ? JSON.stringify(details) : details}` : '';
        return `[${timestamp}] [${level}] [${category}] ${message}${detailsStr}`;
    }

    async log(level: LogLevel, category: LogCategory, message: string, details?: any) {
        const logLine = this.formatMessage(level, category, message, details);
        
        // Always write to console
        if (level === 'ERROR') {
            console.error(logLine);
        } else if (level === 'WARN') {
            console.warn(logLine);
        } else {
            console.log(logLine);
        }

        // Write to log file
        try {
            await this.ensureLogDir();
            await fs.appendFile(LOG_FILE, logLine + '\n', 'utf8');
        } catch (err) {
            console.error('Failed to write to log file:', err);
        }
    }

    async info(category: LogCategory, message: string, details?: any) {
        await this.log('INFO', category, message, details);
    }

    async warn(category: LogCategory, message: string, details?: any) {
        await this.log('WARN', category, message, details);
    }

    async error(category: LogCategory, message: string, details?: any) {
        await this.log('ERROR', category, message, details);
    }
}

export const logger = new SaasLogger();
