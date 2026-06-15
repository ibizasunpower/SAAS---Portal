import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs-extra';
import { exec } from 'child_process';
import util from 'util';
import crypto from 'crypto';
import Dockerode from 'dockerode';
import { db } from './db';
import { logger } from './logger';

const execAsync = util.promisify(exec);

const PORT = parseInt(process.env.PORT || '5000');
const BASE_DIR = process.env.BASE_DIR || (process.platform === 'win32' ? 'd:/!ODOO/ODOO Apps/SASS - Portal' : '/home/portal');
const TEMPLATE_DIR = path.join(BASE_DIR, 'templates');
const PG_PASSWORD = process.env.PG_PASSWORD || 'Enter@123!';
const DB_CONTAINER = process.env.DB_CONTAINER || 'db';

// Dockerode setup
const isWindows = process.platform === 'win32';
const socketPath = isWindows ? '//./pipe/docker_engine' : '/var/run/docker.sock';
const docker = new Dockerode({ socketPath });

const app = express();
app.use(cors());
app.use(express.json());

// Verify and create shared network if missing
async function ensureDockerNetwork(name: string) {
    try {
        const network = docker.getNetwork(name);
        await network.inspect();
    } catch (err: any) {
        if (err.statusCode === 404) {
            logger.info('CONTAINER', `Docker network ${name} not found. Creating it...`);
            await docker.createNetwork({ Name: name });
        } else {
            throw err;
        }
    }
}

// Health check endpoint for control plane itself
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// GET /api/tenants - list all tracked tenants from control database
app.get('/api/tenants', async (req, res) => {
    try {
        const tenants = await db.getTenants();
        res.json(tenants);
    } catch (error: any) {
        logger.error('SERVER', 'Failed to get tenants', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// POST /api/provision - create Odoo container and database
app.post('/api/provision', async (req, res) => {
    const instanceId = crypto.randomUUID();
    let tenantName = '';
    let dbName = '';
    let containerName = '';

    try {
        const { tenant, clientName, domain, plan, version } = req.body;
        
        // Support both UI and system names
        const rawTenantName = tenant || clientName;
        const planVersion = plan || version || '18';
        const domainName = domain || `${rawTenantName}.local`;

        if (!rawTenantName) {
            return res.status(400).json({ error: 'Missing tenant/clientName field' });
        }

        tenantName = rawTenantName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!tenantName) {
            return res.status(400).json({ error: 'Tenant name must contain alphanumeric characters' });
        }

        dbName = tenantName; // Strict Naming Rule: tenant = db_name
        containerName = `odoo_${tenantName}`; // Strict Naming Rule: container suffix = tenant name

        await logger.audit({
            tenant: tenantName,
            db: dbName,
            action: 'create',
            details: `Starting provisioning for plan v${planVersion} on domain ${domainName}`
        });

        // 1. Collision Checks
        const existingRecord = await db.getTenant(tenantName);
        if (existingRecord) {
            await logger.audit({ tenant: tenantName, db: dbName, action: 'failed_create', details: 'Tenant name already exists in control table' });
            return res.status(409).json({ error: `Tenant '${tenantName}' is already registered.` });
        }

        // Docker container exists check
        const containers = await docker.listContainers({ all: true });
        const containerCollision = containers.some(c => 
            c.Names.some(n => n.replace('/', '') === containerName)
        );
        if (containerCollision) {
            await logger.audit({ tenant: tenantName, db: dbName, action: 'failed_create', details: `Container name ${containerName} already exists in Docker` });
            return res.status(409).json({ error: `Docker container '${containerName}' already exists. Clean it up first.` });
        }

        // 2. Select Port
        const usedPorts = new Set<number>();
        containers.forEach(c => {
            c.Ports?.forEach(p => {
                if (p.PublicPort) usedPorts.add(p.PublicPort);
            });
        });

        let port = 8005;
        const MAX_PORT = 8500;
        while (usedPorts.has(port)) {
            port++;
            if (port > MAX_PORT) {
                throw new Error('No available host ports in range 8005-8500.');
            }
        }

        // 3. Pre-create PostgreSQL Database
        const pool = await db.getPool();
        logger.info('DATABASE', `Pre-creating database ${dbName} in PostgreSQL...`);
        try {
            await pool.query(`CREATE DATABASE "${dbName}"`);
            logger.info('DATABASE', `PostgreSQL database ${dbName} created successfully.`);
        } catch (dbErr: any) {
            if (dbErr.message.includes('already exists')) {
                logger.warn('DATABASE', `Database ${dbName} already exists in cluster. Reusing database.`);
            } else {
                throw dbErr;
            }
        }

        // 4. Copy configuration template
        const templatePath = path.join(TEMPLATE_DIR, `odoo${planVersion}`);
        if (!fs.existsSync(templatePath)) {
            return res.status(404).json({ error: `Template for Odoo version ${planVersion} not found.` });
        }

        const clientDir = path.join(BASE_DIR, 'clients', containerName);
        await fs.ensureDir(path.dirname(clientDir));
        await fs.copy(templatePath, clientDir);

        // Customize config
        const confPath = path.join(clientDir, 'config', 'odoo.conf');
        if (fs.existsSync(confPath)) {
            let confContent = await fs.readFile(confPath, 'utf8');
            // Enforce explicit db_name and strict dbfilter
            confContent = confContent.replace(/dbfilter = .*/, `dbfilter = ^${dbName}$`);
            if (!confContent.includes('db_name =')) {
                confContent += `\ndb_name = ${dbName}\n`;
            } else {
                confContent = confContent.replace(/db_name = .*/, `db_name = ${dbName}`);
            }

            if (!confContent.includes('db_host =')) {
                confContent += `\ndb_host = db\n`;
            } else {
                confContent = confContent.replace(/db_host = .*/, `db_host = db`);
            }

            if (!confContent.includes('proxy_mode =')) {
                confContent += `\nproxy_mode = True\n`;
            } else {
                confContent = confContent.replace(/proxy_mode = .*/, `proxy_mode = True`);
            }

            const systemAddons = '/usr/lib/python3/dist-packages/odoo/addons';
            if (confContent.includes('addons_path =')) {
                if (!confContent.includes(systemAddons)) {
                    confContent = confContent.replace('addons_path =', `addons_path = ${systemAddons},`);
                }
            } else {
                confContent += `\naddons_path = ${systemAddons},/mnt/extra-addons\n`;
            }
            await fs.writeFile(confPath, confContent);
        }

        // 5. Insert Control Registry Entry (Safety Rule - must exist before container launch)
        const newRecord = {
            id: instanceId,
            name: tenantName,
            db_name: dbName,
            container_name: containerName,
            domain: domainName,
            odoo_port: port,
            status: 'failed' as const // start in failed status, promote after health check
        };
        await db.insertTenant(newRecord);

        // 6. Ensure Docker Network exists
        await ensureDockerNetwork('odoo-network');

        // 7. Create Odoo Container via Dockerode
        logger.info('CONTAINER', `Creating Docker container: ${containerName}`);
        
        const container = await docker.createContainer({
            Image: planVersion === '19' ? 'odoo:19.0' : 'odoo:18.0',
            name: containerName,
            Env: [
                'HOST=db',
                'USER=odoo',
                'PASSWORD=Enter@123!',
                'DB_NAME=' + dbName
            ],
            ExposedPorts: {
                '8069/tcp': {}
            },
            HostConfig: {
                Binds: [
                    `${clientDir}/addons:/mnt/extra-addons`,
                    `${clientDir}/config:/etc/odoo`,
                    `odoo-web-data-${containerName}:/var/lib/odoo`
                ],
                PortBindings: {
                    '8069/tcp': [{ HostPort: port.toString() }]
                },
                RestartPolicy: {
                    Name: 'unless-stopped'
                }
            },
            NetworkingConfig: {
                EndpointsConfig: {
                    'odoo-network': {}
                }
            }
        });

        // Start container
        await container.start();
        logger.info('CONTAINER', `Started container: ${containerName} (ID: ${container.id})`);

        // 8. Odoo Database Schema Initialization
        logger.info('DATABASE', `Running schema CLI initialization inside ${containerName}...`);
        try {
            const exec = await container.exec({
                Cmd: ['odoo', '-d', dbName, '-i', 'base,web', '--stop-after-init', '--no-http', '--without-demo=all'],
                AttachStdout: true,
                AttachStderr: true
            });
            const stream = await exec.start({ Detach: false });
            await new Promise((resolve, reject) => {
                docker.modem.demuxStream(stream, process.stdout, process.stderr);
                stream.on('end', resolve);
                stream.on('error', reject);
            });
            logger.info('DATABASE', `CLI initialization completed inside ${containerName}.`);
        } catch (initErr: any) {
            logger.warn('DATABASE', `Odoo initialization command had a warning: ${initErr.message}`);
        }

        // Restart Odoo to clean registers
        await container.restart();

        // 9. Health Check Loop
        logger.info('HEALTH', `Starting health check validation on port ${port}...`);
        let isHealthy = false;
        let attempts = 0;
        const maxAttempts = 15;
        const hostIp = process.env.NPM_FORWARD_HOST || '172.17.0.1';

        while (attempts < maxAttempts && !isHealthy) {
            attempts++;
            await new Promise(r => setTimeout(r, 3000));
            try {
                const urls = [
                    `http://127.0.0.1:${port}/web/health`,
                    `http://127.0.0.1:${port}/`,
                    `http://${hostIp}:${port}/web/health`,
                    `http://${hostIp}:${port}/`
                ];
                for (const url of urls) {
                    try {
                        const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(2000) });
                        if (res.ok || res.status === 303 || res.status === 302) {
                            isHealthy = true;
                            break;
                        }
                    } catch {
                        // try next url
                    }
                }
            } catch (err) {
                // ignore
            }
        }

        if (isHealthy) {
            await db.updateTenantStatus(instanceId, 'active');
            await logger.audit({
                tenant: tenantName,
                db: dbName,
                containerId: container.id,
                action: 'create',
                details: `Tenant active and healthy on port ${port}`
            });
            
            // Configure NPM Proxy Host (production only)
            if (process.platform !== 'win32') {
                try {
                    const NPM_HOST = process.env.NPM_HOST;
                    const NPM_EMAIL = process.env.NPM_EMAIL;
                    const NPM_PASSWORD = process.env.NPM_PASSWORD;
                    if (NPM_HOST && NPM_EMAIL && NPM_PASSWORD) {
                        const { npmClient } = require('./npm'); // Import dynamically if NPM integration exists
                        await npmClient.createProxyHost(domainName, hostIp, port);
                        logger.info('CONTAINER', `NPM Proxy Host configured for ${domainName}`);
                    }
                } catch (npmErr: any) {
                    logger.error('CONTAINER', `Failed to configure NPM Proxy Host: ${npmErr.message}`);
                }
            }

            return res.json({
                success: true,
                container_id: container.id,
                db_name: dbName,
                status: 'active',
                url: `http://${domainName}`
            });
        } else {
            await logger.audit({
                tenant: tenantName,
                db: dbName,
                containerId: container.id,
                action: 'failed_create',
                details: 'Provision completed but health checks failed.'
            });
            return res.status(500).json({ error: 'Tenant provisioning completed but health check verification timed out.' });
        }

    } catch (error: any) {
        await logger.error('SERVER', 'Provisioning crashed', { error: error.message, tenant: tenantName });
        await logger.audit({
            tenant: tenantName,
            db: dbName,
            action: 'failed_create',
            details: `Crashed: ${error.message}`
        });
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/tenant/:name - safely remove container and database
app.delete('/api/tenant/:id_or_name', async (req, res) => {
    const { id_or_name } = req.params;
    let tenantName = '';
    let dbName = '';
    let containerName = '';

    try {
        // 1. Fetch tenant from control database
        const record = await db.getTenant(id_or_name);
        if (!record) {
            return res.status(404).json({ error: `Tenant '${id_or_name}' not found in registry.` });
        }

        tenantName = record.name;
        dbName = record.db_name;
        containerName = record.container_name;

        await logger.audit({
            tenant: tenantName,
            db: dbName,
            action: 'delete',
            details: 'Starting deletion workflow'
        });

        // 2. Safely Stop and Remove Container
        logger.info('CONTAINER', `Stopping and removing Docker container ${containerName}`);
        try {
            const container = docker.getContainer(containerName);
            const inspect = await container.inspect();
            if (inspect.State.Running) {
                await container.stop();
                logger.info('CONTAINER', `Stopped container ${containerName}`);
            }
            await container.remove();
            logger.info('CONTAINER', `Removed container ${containerName}`);
        } catch (dockerErr: any) {
            if (dockerErr.statusCode === 404) {
                logger.warn('CONTAINER', `Docker container ${containerName} not found. Skipping.`);
            } else {
                throw dockerErr;
            }
        }

        // 3. Connection Safety: Check pg_stat_activity before dropping
        const pool = await db.getPool();
        logger.info('DATABASE', `Checking active connections to database ${dbName}...`);
        
        const connCheck = await pool.query(
            `SELECT COUNT(*) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
            [dbName]
        );
        const activeConnections = parseInt(connCheck.rows[0].count);

        if (activeConnections > 0) {
            logger.warn('DATABASE', `Found ${activeConnections} active connections to ${dbName}. Terminating...`);
            await pool.query(
                `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
                [dbName]
            );
            
            // Re-verify connection count is zero
            const connCheckVerify = await pool.query(
                `SELECT COUNT(*) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
                [dbName]
            );
            if (parseInt(connCheckVerify.rows[0].count) > 0) {
                throw new Error(`Cannot drop database ${dbName} because active sessions could not be terminated.`);
            }
        }

        // 4. Drop PostgreSQL database
        logger.info('DATABASE', `Dropping database ${dbName}...`);
        await pool.query(`DROP DATABASE IF EXISTS "${dbName}"`);
        logger.info('DATABASE', `Database ${dbName} dropped successfully.`);

        // 5. Cleanup client files
        const clientDir = path.join(BASE_DIR, 'clients', containerName);
        if (await fs.pathExists(clientDir)) {
            await fs.remove(clientDir);
            logger.info('DELETION', `Removed configuration files in ${clientDir}`);
        }

        // 6. Backup placeholder hook (Safety requirement)
        logger.info('DELETION', `Triggering backup placeholder hook for tenant: ${tenantName}`);
        // TODO: Implement actual backup storage hook here in the future
        
        // 7. Clean Nginx Proxy Manager mapping (production only)
        if (process.platform !== 'win32' && record.domain) {
            try {
                const { npmClient } = require('./npm');
                const hostId = await npmClient.getProxyHostIdByDomain(record.domain);
                if (hostId) {
                    await npmClient.deleteProxyHost(hostId);
                }
            } catch (npmErr: any) {
                logger.error('CONTAINER', `Failed to remove NPM host mapping: ${npmErr.message}`);
            }
        }

        // 8. Delete Registry Entry
        await db.deleteTenantRecord(record.id);

        await logger.audit({
            tenant: tenantName,
            db: dbName,
            action: 'delete',
            details: 'Deletion and cleanup workflow completed successfully.'
        });

        res.json({
            success: true,
            message: `Tenant ${tenantName} removed successfully.`,
            cleanupStatus: {
                containerRemoved: true,
                databaseDropped: true,
                filesRemoved: true
            }
        });

    } catch (error: any) {
        await logger.error('SERVER', `Deletion workflow failed for tenant ${tenantName}`, { error: error.message });
        await logger.audit({
            tenant: tenantName || id_or_name,
            db: dbName,
            action: 'failed_delete',
            details: `Crashed during deletion: ${error.message}`
        });

        try {
            const record = await db.getTenant(id_or_name);
            if (record) {
                await db.updateTenantStatus(record.id, 'failed_delete');
            }
        } catch {}

        res.status(500).json({ error: error.message });
    }
});

// GET /api/cleanup - orphan resource scanner
app.get('/api/cleanup', async (req, res) => {
    try {
        const records = await db.getTenants();
        const registryDbs = new Set(records.map(r => r.db_name));
        const registryContainers = new Set(records.map(r => r.container_name));

        // 1. Scan PostgreSQL
        const pool = await db.getPool();
        const { stdout: dbListOutput } = await execAsync(
            `docker exec -e PGPASSWORD=${PG_PASSWORD} ${DB_CONTAINER} psql -U odoo postgres -t -c "SELECT datname FROM pg_database WHERE datname NOT IN ('postgres', 'template0', 'template1') ORDER BY datname;"`
        );
        const allDatabases = dbListOutput
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);

        const orphanedDatabases = allDatabases.filter(db => !registryDbs.has(db));

        // Get DB details
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

        // 2. Scan Docker
        const containers = await docker.listContainers({ all: true });
        const odooContainers = containers.filter(c =>
            c.Image.includes('odoo') ||
            c.Names.some(n => n.toLowerCase().includes('odoo') || n.toLowerCase().includes('tenant_'))
        );

        const orphanedContainers = odooContainers.filter(c => {
            const containerName = c.Names[0]?.replace('/', '') || '';
            return !registryContainers.has(containerName);
        });

        // 3. Scan volumes
        const volumes = await docker.listVolumes();
        const allVolumes = volumes.Volumes || [];
        
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

        const orphanedVolumes = allVolumes
            .filter(v => v.Name.includes('odoo') && !activeVolumes.has(v.Name))
            .map(v => ({
                name: v.Name,
                driver: v.Driver,
                mountpoint: v.Mountpoint
            }));

        res.json({
            orphanedDatabases: databasesWithSize,
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
        logger.error('CLEANUP', 'Cleanup scan failed', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/cleanup - manual deletion of individual orphan resource
app.delete('/api/cleanup', async (req, res) => {
    const { type, name } = req.body || {};
    try {
        if (!type || !name) {
            return res.status(400).json({ error: 'Missing type or name' });
        }

        logger.warn('CLEANUP', `Manual cleanup requested for orphan ${type}: ${name}`);

        switch (type) {
            case 'database':
                if (['postgres', 'template0', 'template1'].includes(name)) {
                    return res.status(400).json({ error: 'Cannot delete system database' });
                }
                const pool = await db.getPool();
                await pool.query(
                    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
                    [name]
                );
                await pool.query(`DROP DATABASE IF EXISTS "${name}"`);
                return res.json({ success: true, message: `Database ${name} dropped` });

            case 'container':
                const container = docker.getContainer(name);
                try {
                    const info = await container.inspect();
                    if (info.State.Running) {
                        await container.stop();
                    }
                } catch {}
                await container.remove({ force: true });
                return res.json({ success: true, message: `Container ${name} deleted` });

            case 'volume':
                const volume = docker.getVolume(name);
                await volume.remove();
                return res.json({ success: true, message: `Volume ${name} deleted` });

            default:
                return res.status(400).json({ error: 'Invalid resource type' });
        }

    } catch (error: any) {
        logger.error('CLEANUP', `Orphan deletion failed for ${name}`, { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Start initialization and server
async function startServer() {
    try {
        await db.init();
        app.listen(PORT, '0.0.0.0', () => {
            logger.info('SERVER', `Provisioning Control Plane listening on port ${PORT}`);
        });
    } catch (err: any) {
        console.error('Failed to initialize server:', err.message);
        process.exit(1);
    }
}

startServer();
