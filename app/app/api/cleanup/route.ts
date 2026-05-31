/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { docker } from '@/lib/docker';
import { registry } from '@/lib/registry';
import { logger } from '@/lib/logger';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

// PostgreSQL connection details
const PG_PASSWORD = process.env.PG_PASSWORD || 'Enter@123!';
const DB_CONTAINER = process.env.DB_CONTAINER || 'db';

export async function GET() {
    try {
        await logger.info('CLEANUP', 'Starting orphan resource scan...');

        // 1. Get all registry records
        const records = await registry.getRegistry();
        const registryDbs = new Set(records.map(r => r.database_name));
        const registryContainers = new Set(records.map(r => r.container_name));

        // 2. Get all databases from PostgreSQL container
        let allDatabases: string[] = [];
        try {
            const { stdout: dbListOutput } = await execAsync(
                `docker exec -e PGPASSWORD=${PG_PASSWORD} ${DB_CONTAINER} psql -U odoo postgres -t -c "SELECT datname FROM pg_database WHERE datname NOT IN ('postgres', 'template0', 'template1') ORDER BY datname;"`
            );
            allDatabases = dbListOutput
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean);
        } catch (dbErr: any) {
            await logger.error('CLEANUP', 'Failed to scan PostgreSQL databases', { error: dbErr.message });
            // continue with scan, database list will be empty
        }

        // 3. Get all Odoo/Tenant containers
        let odooContainers: any[] = [];
        try {
            const containers = await docker.listContainers({ all: true });
            odooContainers = containers.filter(c =>
                c.Image.includes('odoo') ||
                c.Image.startsWith('root-') || 
                c.Names.some(n => n.toLowerCase().includes('odoo') || n.toLowerCase().includes('tenant_'))
            );
        } catch (dockerErr: any) {
            await logger.error('CLEANUP', 'Failed to scan Docker containers', { error: dockerErr.message });
        }

        // 4. Find orphaned databases (databases starting with tenant_ or any database not in registry)
        const orphanedDatabases = allDatabases.filter(db => {
            // Keep system databases safe, flag others if not in registry
            return !registryDbs.has(db);
        });

        // 5. Get database sizes and modification dates
        const databasesWithSize = await Promise.all(
            orphanedDatabases.map(async (dbName) => {
                try {
                    const { stdout: sizeOut } = await execAsync(
                        `docker exec -e PGPASSWORD=${PG_PASSWORD} ${DB_CONTAINER} psql -U odoo postgres -t -c "SELECT pg_size_pretty(pg_database_size('${dbName}'));"`
                    );
                    const { stdout: dateOut } = await execAsync(
                        `docker exec -e PGPASSWORD=${PG_PASSWORD} ${DB_CONTAINER} psql -U odoo postgres -t -c "SELECT (pg_stat_file('base/'||oid||'/PG_VERSION')).modification FROM pg_database WHERE datname='${dbName}';"`
                    );
                    const { stdout: sizeBytes } = await execAsync(
                        `docker exec -e PGPASSWORD=${PG_PASSWORD} ${DB_CONTAINER} psql -U odoo postgres -t -c "SELECT pg_database_size('${dbName}');"`
                    );
                    return {
                        name: dbName,
                        size: sizeOut.trim(),
                        sizeBytes: parseInt(sizeBytes.trim()) || 0,
                        createdAt: dateOut.trim() || 'Unknown',
                        inUse: false
                    };
                } catch {
                    return {
                        name: dbName,
                        size: 'Unknown',
                        sizeBytes: 0,
                        createdAt: 'Unknown',
                        inUse: false
                    };
                }
            })
        );

        // 6. Find orphaned containers (Odoo containers not tracked in registry)
        const orphanedContainers = odooContainers.filter(c => {
            const containerName = c.Names[0]?.replace('/', '') || '';
            return !registryContainers.has(containerName);
        });

        // 7. Get Docker volumes
        let allVolumes: any[] = [];
        let orphanedVolumes: any[] = [];
        try {
            const volumes = await docker.listVolumes();
            allVolumes = volumes.Volumes || [];

            // Get active volumes from registry containers
            const activeVolumes = new Set<string>();
            for (const container of odooContainers) {
                const name = container.Names[0]?.replace('/', '') || '';
                if (registryContainers.has(name) && container.State === 'running') {
                    container.Mounts?.forEach((mount: any) => {
                        if (mount.Type === 'volume') {
                            activeVolumes.add(mount.Name);
                        }
                    });
                }
            }

            orphanedVolumes = allVolumes
                .filter(v => v.Name.includes('odoo') && !activeVolumes.has(v.Name))
                .map(v => ({
                    name: v.Name,
                    driver: v.Driver,
                    mountpoint: v.Mountpoint
                }));
        } catch (volErr: any) {
            await logger.error('CLEANUP', 'Failed to scan Docker volumes', { error: volErr.message });
        }

        await logger.info('CLEANUP', `Scan complete. Found ${databasesWithSize.length} orphan DBs, ${orphanedContainers.length} orphan containers.`);

        return NextResponse.json({
            orphanedDatabases: databasesWithSize,
            // Map orphaned containers to "stoppedContainers" key expected by the frontend UI
            stoppedContainers: orphanedContainers.map(c => ({
                id: c.Id,
                name: c.Names[0]?.replace('/', ''),
                image: c.Image,
                state: c.State,
                status: c.Status,
                created: c.Created
            })),
            orphanedVolumes,
            activeContainers: odooContainers.filter(c => c.State === 'running' && registryContainers.has(c.Names[0]?.replace('/', ''))).length,
            totalDatabases: allDatabases.length,
            activeDatabases: records.length
        });

    } catch (error: any) {
        await logger.error('CLEANUP', 'Cleanup scan failed', { error: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    let type: string | undefined;
    let name: string | undefined;
    try {
        const body = await request.json() || {};
        type = body.type;
        name = body.name;

        if (!type || !name) {
            return NextResponse.json({ error: 'Missing type or name' }, { status: 400 });
        }

        await logger.warn('CLEANUP', `User requested manual deletion of orphaned resource. Type: ${type}, Name: ${name}`);

        switch (type) {
            case 'database':
                // Enforce safety: do not allow dropping system databases
                if (['postgres', 'template0', 'template1'].includes(name)) {
                    throw new Error('Cannot delete system database');
                }
                // Terminate connections first for safety
                await execAsync(
                    `docker exec -e PGPASSWORD=${PG_PASSWORD} ${DB_CONTAINER} psql -U odoo postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid();"`
                );
                await execAsync(
                    `docker exec -e PGPASSWORD=${PG_PASSWORD} ${DB_CONTAINER} psql -U odoo postgres -c "DROP DATABASE IF EXISTS \\"${name}\\";"`
                );
                await logger.info('CLEANUP', `Successfully dropped orphaned database: ${name}`);
                return NextResponse.json({ success: true, message: `Database ${name} deleted` });

            case 'container':
                const container = docker.getContainer(name);
                try {
                    const info = await container.inspect();
                    if (info.State.Running) {
                        await container.stop();
                    }
                } catch {
                    // container might be already stopped
                }
                await container.remove({ force: true });
                await logger.info('CLEANUP', `Successfully removed orphaned container: ${name}`);
                return NextResponse.json({ success: true, message: `Container ${name} deleted` });

            case 'volume':
                const volume = docker.getVolume(name);
                await volume.remove();
                await logger.info('CLEANUP', `Successfully removed orphaned volume: ${name}`);
                return NextResponse.json({ success: true, message: `Volume ${name} deleted` });

            default:
                return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
        }

    } catch (error: any) {
        await logger.error('CLEANUP', `Manual orphan deletion failed for ${name}`, { error: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
