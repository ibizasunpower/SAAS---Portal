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
import crypto from 'crypto';

const execAsync = util.promisify(exec);

// Configuration
const BASE_DIR = process.env.BASE_DIR || (process.platform === 'win32' ? 'd:/!ODOO/ODOO Apps/SASS - Portal' : '/home/portal');
const TEMPLATE_DIR = path.join(BASE_DIR, 'templates');
const PG_PASSWORD = process.env.PG_PASSWORD || 'Enter@123!';
const DB_CONTAINER = process.env.DB_CONTAINER || 'db';

export async function POST(request: Request) {
    const instanceId = crypto.randomUUID();
    let containerName = '';
    let dbName = '';
    
    try {
        const body = await request.json();
        const { clientName, version, domain, selected_modules } = body;

        if (!clientName || !version || !domain) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const slug = clientName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!slug) {
            return NextResponse.json({ error: 'Client name must contain alphanumeric characters' }, { status: 400 });
        }

        containerName = `tenant_${slug}`;
        dbName = `tenant_${slug}`;

        await logger.info('CREATION', `Starting deployment for client: ${clientName} (${containerName})`, { instanceId, slug, version, domain });

        // Parse selected modules list
        let modulesToInstallSet = new Set<string>(['base', 'web']);
        if (Array.isArray(selected_modules) && selected_modules.length > 0) {
            selected_modules.forEach((mod: string) => {
                if (mod && typeof mod === 'string') {
                    modulesToInstallSet.add(mod.trim());
                }
            });
        }
        const modulesList = Array.from(modulesToInstallSet).join(',');

        // 1. Collision Checks
        const registryRecord = await registry.getInstance(containerName);
        if (registryRecord) {
            await logger.warn('CREATION', `Collision detected: Instance ${containerName} already in registry`, { instanceId });
            return NextResponse.json({ error: `Client or database with name '${slug}' already exists` }, { status: 409 });
        }

        // Verify with docker list
        const containers = await docker.listContainers({ all: true });
        const nameCollision = containers.some(c => 
            c.Names.some(n => n.replace('/', '') === containerName)
        );
        if (nameCollision) {
            await logger.warn('CREATION', `Collision detected: Container ${containerName} exists in Docker but not registry`, { instanceId });
            return NextResponse.json({ error: `Docker container '${containerName}' already exists. Please run cleanup first.` }, { status: 409 });
        }

        // 2. Find Available Port
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
                await logger.error('CREATION', 'No ports available in 8005-8500 range', { instanceId });
                return NextResponse.json({ error: 'No available ports in range 8005-8500' }, { status: 503 });
            }
        }

        // 3. Create PostgreSQL Database directly
        await logger.info('DATABASE', `Pre-creating database ${dbName} in PostgreSQL...`, { instanceId });
        try {
            await execAsync(
                `docker exec -e PGPASSWORD=${PG_PASSWORD} ${DB_CONTAINER} psql -U odoo postgres -c "CREATE DATABASE \\"${dbName}\\";"`
            );
            await logger.info('DATABASE', `Database ${dbName} created successfully in Postgres`, { instanceId });
        } catch (dbErr: any) {
            if (dbErr.message.includes('already exists')) {
                await logger.warn('DATABASE', `Database ${dbName} already exists in Postgres, reuse database`, { instanceId });
            } else {
                await logger.error('DATABASE', `Failed to create database ${dbName}`, { error: dbErr.message, instanceId });
                throw new Error(`Database creation failed: ${dbErr.message}`);
            }
        }

        // 4. Copy Template
        const templatePath = path.join(TEMPLATE_DIR, `odoo${version}`);
        if (!fs.existsSync(templatePath)) {
            return NextResponse.json({ error: `Template for version ${version} not found at ${templatePath}` }, { status: 404 });
        }

        const clientDir = path.join(BASE_DIR, 'clients', containerName);
        if (fs.existsSync(clientDir)) {
            return NextResponse.json({ error: `Client directory ${containerName} already exists on disk` }, { status: 409 });
        }

        await logger.info('CONTAINER', `Copying templates to ${clientDir}`, { instanceId });
        await fs.copy(templatePath, clientDir);

        // 5. Customize configuration files
        await logger.info('CONTAINER', `Customizing configuration files for ${containerName}`, { instanceId });
        
        // docker-compose.yml
        const composePath = path.join(clientDir, 'docker-compose.yml');
        let composeContent = await fs.readFile(composePath, 'utf8');
        composeContent = composeContent.replace(/container_name: .*/, `container_name: ${containerName}`);
        composeContent = composeContent.replace(/"\d+:(\d+)"/, `"${port}:$1"`);
        
        const volumeName = `odoo-web-data-${port}`;
        composeContent = composeContent.replace(/odoo-web-data-\d+/g, volumeName);

        if (!composeContent.includes('labels:')) {
            composeContent = composeContent.replace('environment:', `labels:\n      - "com.odoo.domain=${domain}"\n    environment:`);
        } else {
            composeContent = composeContent.replace('labels:', `labels:\n      - "com.odoo.domain=${domain}"`);
        }
        await fs.writeFile(composePath, composeContent);

        // odoo.conf
        const confPath = path.join(clientDir, 'config', 'odoo.conf');
        if (fs.existsSync(confPath)) {
            let confContent = await fs.readFile(confPath, 'utf8');
            
            // Set explicit db_name and dbfilter to enforce tenant isolation
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

        // 6. Write registry entry BEFORE starting container (Safety rule)
        const addonsPath = path.join(clientDir, 'addons');
        const configPath = path.join(clientDir, 'config');
        const newRecord = {
            instance_id: instanceId,
            container_name: containerName,
            database_name: dbName,
            odoo_port: port,
            addons_path: addonsPath,
            config_path: configPath,
            status: 'failed' as const, // starts with failed until health check verifies
            created_at: new Date().toISOString(),
            last_health_check: new Date().toISOString(),
            client_name: clientName,
            domain: domain,
            version: version
        };
        await registry.addInstance(newRecord);

        // 7. Start Container
        await logger.info('CONTAINER', `Launching docker container for ${containerName}...`, { instanceId });
        await execAsync(`docker compose up -d --build`, { cwd: clientDir });

        // 8. Initialize Odoo Database via CLI
        await logger.info('DATABASE', `Initializing database tables for ${dbName}...`, { instanceId });
        try {
            await execAsync(`docker exec ${containerName} odoo -d ${dbName} -i ${modulesList} --stop-after-init --no-http --without-demo=all`);
            await logger.info('DATABASE', `Database tables successfully initialized for ${dbName}.`, { instanceId });
        } catch (initErr: any) {
            await logger.warn('DATABASE', `Database initialization CLI warning: ${initErr.message}`, { instanceId });
        }

        // Restart container to refresh registry and assets cache
        await logger.info('CONTAINER', `Restarting container ${containerName} after initialization...`, { instanceId });
        await execAsync(`docker restart ${containerName}`);

        // 9. Health Check Verification Loop
        await logger.info('HEALTH', `Starting health verification loop for ${containerName} on port ${port}`, { instanceId });
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
            } catch (healthErr) {
                // ignore
            }
        }

        if (isHealthy) {
            await registry.updateInstance(instanceId, {
                status: 'active',
                last_health_check: new Date().toISOString()
            });
            await logger.info('CREATION', `Instance ${containerName} is healthy. Marked status as ACTIVE.`, { instanceId });
        } else {
            await logger.error('CREATION', `Instance ${containerName} failed health check. Left status as FAILED.`, { instanceId });
            return NextResponse.json({
                error: 'Instance deployed but failed health check. Check logs.',
                containerName,
                port
            }, { status: 500 });
        }

        // 10. Configure Nginx Proxy Manager (production only)
        if (process.platform !== 'win32') {
            try {
                const forwardHost = process.env.NPM_FORWARD_HOST || '172.17.0.1';
                await logger.info('CONTAINER', `Creating NPM Proxy Host: ${domain} -> ${forwardHost}:${port}`, { instanceId });
                await npmClient.createProxyHost(domain, forwardHost, port);
            } catch (npmErr: any) {
                await logger.error('CONTAINER', `Failed to configure NPM Proxy Host: ${npmErr.message}`, { instanceId });
            }
        }

        return NextResponse.json({
            success: true,
            clientName,
            port,
            url: `http://${domain}`,
            instanceId
        });

    } catch (error: any) {
        await logger.error('CREATION', 'Deployment process crashed', { error: error.message, instanceId });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
