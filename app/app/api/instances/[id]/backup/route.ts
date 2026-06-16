import { NextResponse } from 'next/server';
import { registry } from '@/lib/registry';
import { logger } from '@/lib/logger';
import { docker } from '@/lib/docker';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';

const BASE_DIR = process.env.BASE_DIR || (process.platform === 'win32' ? 'd:/!ODOO/ODOO Apps/SASS - Portal' : '/home/portal');

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    if (!id) {
        return NextResponse.json({ error: 'Missing instance ID' }, { status: 400 });
    }

    try {
        const record = await registry.getInstance(id);
        if (!record) {
            await logger.warn('DATABASE', `Instance ID ${id} not found for backup.`, { id });
            return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
        }

        const databaseName = record.database_name;
        const containerName = record.container_name;
        const port = record.odoo_port;

        if (!databaseName) {
            await logger.warn('DATABASE', `Instance ID ${id} has no database name.`, { id });
            return NextResponse.json({ error: 'Database name not found' }, { status: 404 });
        }

        await logger.info('DATABASE', `Starting zip backup for database: ${databaseName}`, { id });

        // Retrieve admin_passwd from config
        const clientDir = path.join(BASE_DIR, 'clients', containerName);
        const confPath = path.join(clientDir, 'config', 'odoo.conf');
        let adminPasswd = 'Enter@123!'; // fallback default

        if (await fs.pathExists(confPath)) {
            const confContent = await fs.readFile(confPath, 'utf8');
            const match = confContent.match(/admin_passwd\s*=\s*(.*)/);
            if (match && match[1]) {
                adminPasswd = match[1].trim();
            }
        }

        // Check container state and start if stopped
        let wasRunning = true;
        let containerRef: any = null;
        try {
            containerRef = docker.getContainer(containerName);
            const info = await containerRef.inspect();
            wasRunning = info.State.Running;
        } catch (err: any) {
            await logger.warn('DATABASE', `Could not inspect container ${containerName}, proceeding anyway`, { error: err.message, id });
        }

        if (containerRef && !wasRunning) {
            await logger.info('DATABASE', `Odoo container ${containerName} is stopped. Starting container temporarily for backup...`, { id });
            await containerRef.start();
            // Wait for Odoo server to start up and listen (6 seconds is typical for a basic setup)
            await new Promise((resolve) => setTimeout(resolve, 6000));
        }

        let response;
        try {
            const backupUrl = `http://127.0.0.1:${port}/web/database/backup`;
            const formData = new URLSearchParams();
            formData.append('master_pwd', adminPasswd);
            formData.append('name', databaseName);
            formData.append('backup_format', 'zip');

            response = await axios.post(backupUrl, formData, {
                responseType: 'arraybuffer',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                timeout: 120000, // 2 minutes timeout for larger databases
            });
        } finally {
            if (containerRef && !wasRunning) {
                await logger.info('DATABASE', `Stopping container ${containerName} after backup completion...`, { id });
                try {
                    await containerRef.stop();
                } catch (stopErr: any) {
                    await logger.error('DATABASE', `Failed to stop container ${containerName}`, { error: stopErr.message, id });
                }
            }
        }

        // Check if response is zip or error html page
        const contentType = response.headers['content-type'] ? String(response.headers['content-type']) : '';
        if (contentType.includes('text/html') || response.status !== 200) {
            const errorText = Buffer.from(response.data).toString('utf8');
            await logger.error('DATABASE', `Odoo native backup failed. Response: ${errorText.substring(0, 500)}`, { id });
            return NextResponse.json({ error: 'Odoo backup failed. Verify master password or database state.' }, { status: 500 });
        }

        const safeDate = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${databaseName}_${safeDate}.zip`;
        const backupTimestamp = new Date().toISOString();

        // Stamp last_backup on the registry record
        try {
            await registry.updateInstance(id, { last_backup: backupTimestamp });
        } catch (regErr: any) {
            await logger.warn('DATABASE', `Failed to update last_backup timestamp in registry`, { error: regErr.message, id });
        }

        await logger.info('DATABASE', `Backup completed successfully for database: ${databaseName} as zip`, { id });

        return new Response(response.data, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            }
        });

    } catch (error: any) {
        await logger.error('DATABASE', `Backup failed for instance ID: ${id}`, { error: error.message, id });
        return NextResponse.json({ error: `Backup failed: ${error.message}` }, { status: 500 });
    }
}
