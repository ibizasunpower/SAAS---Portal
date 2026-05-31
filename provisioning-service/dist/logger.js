"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const BASE_DIR = process.env.BASE_DIR || (process.platform === 'win32' ? 'd:/!ODOO/ODOO Apps/SASS - Portal' : '/home/portal');
const LOG_DIR = path_1.default.join(BASE_DIR, 'logs');
const LOG_FILE = path_1.default.join(LOG_DIR, 'provisioning.log');
class ProvisioningLogger {
    initialized = false;
    async ensureLogDir() {
        if (this.initialized)
            return;
        try {
            await fs_extra_1.default.ensureDir(LOG_DIR);
            this.initialized = true;
        }
        catch (err) {
            console.error('Failed to create logs directory:', err);
        }
    }
    async log(level, category, message, meta) {
        const timestamp = new Date().toISOString();
        const metaStr = meta ? ` | Meta: ${JSON.stringify(meta)}` : '';
        const logLine = `[${timestamp}] [${level}] [${category}] ${message}${metaStr}`;
        if (level === 'ERROR') {
            console.error(logLine);
        }
        else if (level === 'WARN') {
            console.warn(logLine);
        }
        else {
            console.log(logLine);
        }
        try {
            await this.ensureLogDir();
            await fs_extra_1.default.appendFile(LOG_FILE, logLine + '\n', 'utf8');
        }
        catch (err) {
            console.error('Failed to write to provisioning.log:', err);
        }
    }
    async audit(data) {
        const timestamp = new Date().toISOString();
        const { tenant, db, containerId, action, details } = data;
        // Strictly structured audit log format
        const auditLine = `[${timestamp}] [AUDIT] [${action.toUpperCase()}] tenant: ${tenant} | db: ${db} | container: ${containerId || 'N/A'} | details: ${details || 'None'}`;
        console.log(auditLine);
        try {
            await this.ensureLogDir();
            await fs_extra_1.default.appendFile(LOG_FILE, auditLine + '\n', 'utf8');
        }
        catch (err) {
            console.error('Failed to write audit log:', err);
        }
    }
    async info(category, message, meta) {
        await this.log('INFO', category, message, meta);
    }
    async warn(category, message, meta) {
        await this.log('WARN', category, message, meta);
    }
    async error(category, message, meta) {
        await this.log('ERROR', category, message, meta);
    }
}
exports.logger = new ProvisioningLogger();
