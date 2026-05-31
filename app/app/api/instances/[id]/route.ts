/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { docker } from '@/lib/docker';
import { npmClient } from '@/lib/npm';
import { registry } from '@/lib/registry';
import { logger } from '@/lib/logger';
import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

// Configuration (Must match deploy/route.ts)
const BASE_DIR = process.env.BASE_DIR || (process.platform === 'win32' ? 'd:/!ODOO/ODOO Apps/SASS - Portal' : '/home/portal');
const PG_PASSWORD = process.env.PG_PASSWORD || 'Enter@123!';
const DB_CONTAINER = process.env.DB_CONTAINER || 'db';

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    
    if (!id) {
        return NextResponse.json({ error: 'Missing instance ID' }, { status: 400 });
    }

    await logger.info('DELETION', `Received deletion request for instance ID: ${id}`);

    // 1. Fetch instance from registry
    const record = await registry.getInstance(id);
    if (!record) {
        await logger.warn('DELETION', `Instance ID ${id} not found in registry. Rejecting request.`, { id });
        return NextResponse.json({ error: 'Instance not found in registry' }, { status: 404 });
    }

    const { container_name, database_name, domain } = record;
    const clientDir = path.join(BASE_DIR, 'clients', container_name);

    try {
        // 2. Stop and Remove Odoo Container
        await logger.info('CONTAINER', `Stopping and removing Docker container: ${container_name}`, { id });
        try {
            const container = docker.getContainer(container_name);
            const info = await container.inspect();
            if (info.State.Running) {
                await container.stop();
                await logger.info('CONTAINER', `Stopped container: ${container_name}`, { id });
            }
            await container.remove();
            await logger.info('CONTAINER', `Removed container: ${container_name}`, { id });
        } catch (dockerErr: any) {
            if (dockerErr.statusCode === 404) {
                await logger.warn('CONTAINER', `Container ${container_name} not found in Docker. Skipping container removal.`, { id });
            } else {
                await logger.error('CONTAINER', `Failed to remove Docker container ${container_name}`, { error: dockerErr.message, id });
                throw dockerErr;
            }
        }

        // 3. Drop PostgreSQL Database
        await logger.info('DATABASE', `Terminating active connections and dropping database: ${database_name}`, { id });
        try {
            // Terminate open connection pools to prevent "database is being accessed by other users" error
            await execAsync(
                `docker exec -e PGPASSWORD=${PG_PASSWORD} ${DB_CONTAINER} psql -U odoo postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${database_name}' AND pid <> pg_backend_pid();"`
            );
            // Drop database
            await execAsync(
                `docker exec -e PGPASSWORD=${PG_PASSWORD} ${DB_CONTAINER} psql -U odoo postgres -c "DROP DATABASE IF EXISTS \\"${database_name}\\";"`
            );
            await logger.info('DATABASE', `Successfully dropped database: ${database_name}`, { id });
        } catch (dbErr: any) {
            await logger.error('DATABASE', `Failed to drop database ${database_name}`, { error: dbErr.message, id });
            throw dbErr;
        }

        // 4. Remove Configuration and Addons Files
        await logger.info('DELETION', `Removing directory for client: ${clientDir}`, { id });
        if (await fs.pathExists(clientDir)) {
            try {
                await fs.remove(clientDir);
                await logger.info('DELETION', `Successfully removed directory: ${clientDir}`, { id });
            } catch (fsErr: any) {
                await logger.warn('DELETION', `Standard directory remove failed. Attempting force remove.`, { id, error: fsErr.message });
                if (process.platform !== 'win32') {
                    try {
                        await execAsync(`rm -rf "${clientDir}"`);
                        await logger.info('DELETION', `Force removed directory: ${clientDir}`, { id });
                    } catch (forceErr: any) {
                        await logger.error('DELETION', `Failed to force remove directory: ${clientDir}`, { error: forceErr.message, id });
                        throw forceErr;
                    }
                } else {
                    throw fsErr;
                }
            }
        } else {
            await logger.warn('DELETION', `Directory ${clientDir} does not exist. Skipping file cleanup.`, { id });
        }

        // 5. Remove NPM Proxy Host (production only)
        if (process.platform !== 'win32' && domain) {
            try {
                await logger.info('CONTAINER', `Removing NPM Proxy Host for domain: ${domain}`, { id });
                const hostId = await npmClient.getProxyHostIdByDomain(domain);
                if (hostId) {
                    await npmClient.deleteProxyHost(hostId);
                    await logger.info('CONTAINER', `Removed NPM Proxy Host ID: ${hostId}`, { id });
                } else {
                    await logger.warn('CONTAINER', `No NPM Proxy Host found for domain: ${domain}`, { id });
                }
            } catch (npmErr: any) {
                await logger.error('CONTAINER', `Failed to clean up NPM proxy host`, { error: npmErr.message, id });
            }
        }

        // 6. Delete Registry Entry
        await registry.deleteInstanceRecord(id);
        await logger.info('DELETION', `Instance ${container_name} completely deleted.`, { id });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        await logger.error('DELETION', `Deletion workflow failed for instance ID: ${id}. Marking status as FAILED_DELETE.`, { error: error.message, id });
        
        try {
            await registry.updateInstance(id, { status: 'failed_delete' });
        } catch (regErr: any) {
            await logger.error('REGISTRY', `Failed to update registry status to FAILED_DELETE`, { error: regErr.message, id });
        }

        return NextResponse.json({ error: `Deletion failed: ${error.message}` }, { status: 500 });
    }
}
