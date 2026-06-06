/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { docker } from '@/lib/docker';
import { npmClient } from '@/lib/npm';
import { registry } from '@/lib/registry';
import { logger } from '@/lib/logger';
import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';

// Configuration
const BASE_DIR = process.env.BASE_DIR || (process.platform === 'win32' ? 'd:/!ODOO/ODOO Apps/SASS - Portal' : '/home/portal');
const TEMPLATE_DIR = path.join(BASE_DIR, 'templates');
const PG_PASSWORD = process.env.PG_PASSWORD || 'Enter@123!';
const DB_CONTAINER = process.env.DB_CONTAINER || 'db';

// Helper to spawn processes and capture output dynamically
function runCommandStream(
    command: string,
    args: string[],
    options: any,
    onLog: (data: string, type: 'stdout' | 'stderr') => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, options);
        
        proc.stdout?.on('data', (chunk) => {
            onLog(chunk.toString('utf8'), 'stdout');
        });
        
        proc.stderr?.on('data', (chunk) => {
            onLog(chunk.toString('utf8'), 'stderr');
        });
        
        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command "${command} ${args.join(' ')}" failed with exit code ${code}`));
            }
        });
        
        proc.on('error', (err) => {
            reject(err);
        });
    });
}

export async function POST(request: Request) {
    const instanceId = crypto.randomUUID();
    let containerName = '';
    let dbName = '';
    
    try {
        const body = await request.json();
        const { clientName, version, domain, selected_modules } = body;

        // Validation Checks (Fast failures)
        if (!clientName || !version || !domain) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const slug = clientName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!slug) {
            return NextResponse.json({ error: 'Client name must contain alphanumeric characters' }, { status: 400 });
        }

        containerName = `tenant_${slug}`;
        dbName = `tenant_${slug}`;

        // 1. Collision Checks
        const registryRecord = await registry.getInstance(containerName);
        if (registryRecord) {
            return NextResponse.json({ error: `Client or database with name '${slug}' already exists` }, { status: 409 });
        }

        // Verify with docker list
        const containers = await docker.listContainers({ all: true });
        const nameCollision = containers.some(c => 
            c.Names.some(n => n.replace('/', '') === containerName)
        );
        if (nameCollision) {
            return NextResponse.json({ error: `Docker container '${containerName}' already exists. Please run cleanup first.` }, { status: 409 });
        }

        const clientDir = path.join(BASE_DIR, 'clients', containerName);
        if (fs.existsSync(clientDir)) {
            return NextResponse.json({ error: `Client directory ${containerName} already exists on disk` }, { status: 409 });
        }

        const templatePath = path.join(TEMPLATE_DIR, `odoo${version}`);
        if (!fs.existsSync(templatePath)) {
            return NextResponse.json({ error: `Template for version ${version} not found` }, { status: 404 });
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
                return NextResponse.json({ error: 'No available ports in range 8005-8500' }, { status: 503 });
            }
        }

        // Build the module lists — split into standard Odoo vs OCA/custom
        const KNOWN_STANDARD_ODOO_MODULES = new Set<string>([
            'base','web','mail','account','account_accountant','account_analytic',
            'crm','sale','sale_management','purchase','stock','mrp','project',
            'hr','hr_expense','hr_holidays','hr_timesheet','hr_payroll',
            'website','website_sale','ecommerce','point_of_sale','pos_restaurant',
            'l10n_es','l10n_es_account','l10n_generic_coa','fleet',
            'maintenance','quality','helpdesk','knowledge','discuss','calendar',
            'contacts','note','lunch','survey','event','gamification',
            'analytic','resource','digest','bus','portal','rating','utm',
            'base_iban','base_vat','base_import','delivery','stock_account',
            'mrp_account','purchase_stock','sale_stock','account_payment',
            'payment','spreadsheet','documents','sign','approvals',
        ]);

        const coreModules = new Set<string>(['base', 'web']);
        const ocaModules = new Set<string>();

        if (Array.isArray(selected_modules) && selected_modules.length > 0) {
            selected_modules.forEach((mod: string) => {
                if (!mod || typeof mod !== 'string') return;
                const m = mod.trim();
                if (KNOWN_STANDARD_ODOO_MODULES.has(m)) {
                    coreModules.add(m);
                } else {
                    ocaModules.add(m);
                }
            });
        }

        const coreModulesList = Array.from(coreModules).join(',');

        // Return ReadableStream for live server log updates
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                const sendLog = (type: 'info' | 'stdout' | 'stderr' | 'error' | 'success', message: string, payload?: any) => {
                    const chunk = JSON.stringify({ type, message, timestamp: new Date().toISOString(), ...payload }) + '\n';
                    controller.enqueue(encoder.encode(chunk));
                };

                const handleOutput = (data: string, type: 'stdout' | 'stderr') => {
                    const lines = data.split('\n');
                    lines.forEach(line => {
                        if (line.trim()) {
                            sendLog(type, line);
                        }
                    });
                };

                try {
                    await logger.info('CREATION', `Starting streamed deployment for: ${clientName}`, { instanceId, slug, version, domain });
                    
                    // Collect Python dependencies of selected modules from config
                    const pythonPackagesToInstall = new Set<string>();
                    try {
                        const configPath = path.join(process.cwd(), 'modules_config.json');
                        if (await fs.pathExists(configPath)) {
                            const config = await fs.readJson(configPath);
                            const versionConfig = config[version] || config['18'] || {};
                            
                            if (Array.isArray(selected_modules)) {
                                selected_modules.forEach((modId: string) => {
                                    for (const catKey of Object.keys(versionConfig)) {
                                        const mod = versionConfig[catKey].modules?.find((m: any) => m.id === modId);
                                        if (mod) {
                                            if (Array.isArray(mod.requirements)) {
                                                mod.requirements.forEach((req: string) => pythonPackagesToInstall.add(req.trim()));
                                            }
                                            if (Array.isArray(mod.external_dependencies?.python)) {
                                                mod.external_dependencies.python.forEach((req: string) => pythonPackagesToInstall.add(req.trim()));
                                            }
                                        }
                                    }
                                });
                            }
                        }
                    } catch (readErr: any) {
                        sendLog('stderr', `Warning: Failed to load modules configuration details: ${readErr.message}`);
                    }

                    // Step 1: Pre-creating database
                    sendLog('info', `[1/6] Pre-creating PostgreSQL database: ${dbName}...`);
                    try {
                        await runCommandStream(
                            'docker',
                            ['exec', '-e', `PGPASSWORD=${PG_PASSWORD}`, DB_CONTAINER, 'psql', '-U', 'odoo', 'postgres', '-c', `CREATE DATABASE "${dbName}";`],
                            {},
                            handleOutput
                        );
                        sendLog('info', `Successfully pre-created database ${dbName}.`);
                    } catch (dbErr: any) {
                        if (dbErr.message.includes('already exists')) {
                            sendLog('info', `Database ${dbName} already exists, reusing.`);
                        } else {
                            throw new Error(`Failed to create database: ${dbErr.message}`);
                        }
                    }

                    // Step 2: Copy template
                    sendLog('info', `[2/6] Copying Odoo template files to clients/${containerName}...`);
                    await fs.copy(templatePath, clientDir);

                    // Step 3: Customize configuration
                    sendLog('info', `[3/6] Customizing docker-compose.yml and odoo.conf files...`);
                    
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

                    // Register record
                    sendLog('info', `Registering instance record inside SASS database registry...`);
                    const addonsPath = path.join(clientDir, 'addons');
                    const configPath = path.join(clientDir, 'config');
                    const newRecord = {
                        instance_id: instanceId,
                        container_name: containerName,
                        database_name: dbName,
                        odoo_port: port,
                        addons_path: addonsPath,
                        config_path: configPath,
                        status: 'failed' as const, // Starts as failed until verified healthy
                        created_at: new Date().toISOString(),
                        last_health_check: new Date().toISOString(),
                        client_name: clientName,
                        domain: domain,
                        version: version
                    };
                    await registry.addInstance(newRecord);

                    // Step 4: Docker up
                    sendLog('info', `[4/6] Starting container environment with Docker Compose...`);
                    await runCommandStream(
                        'docker',
                        ['compose', 'up', '-d', '--build'],
                        { cwd: clientDir },
                        handleOutput
                    );

                    // Install Python libraries if required
                    if (pythonPackagesToInstall.size > 0) {
                        const packagesList = Array.from(pythonPackagesToInstall);
                        sendLog('info', `Installing required Python libraries inside container: ${packagesList.join(', ')}...`);
                        try {
                            await runCommandStream(
                                'docker',
                                ['exec', '-u', 'root', containerName, 'pip3', 'install', ...packagesList],
                                {},
                                handleOutput
                            );
                            sendLog('info', `Python libraries successfully installed.`);
                        } catch (pipErr: any) {
                            sendLog('stderr', `Warning: Python libraries installation had warnings: ${pipErr.message}. Proceeding with Odoo setup.`);
                        }
                    }

                    // ── STEP 5a: Install standard Odoo modules (FATAL if fails) ──────────
                    sendLog('info', `[5/6] Phase 1 — Installing core Odoo modules (${coreModules.size} modules) sequentially to prevent memory exhaustion...`);
                    
                    // Always install 'base' first
                    sendLog('info', `  → Installing foundation: base`);
                    try {
                        await runCommandStream(
                            'docker',
                            ['exec', '-e', 'PYTHONUNBUFFERED=1', containerName, 'odoo', '-d', dbName, '-i', 'base',
                             '--stop-after-init', '--no-http', '--without-demo=all'],
                            {},
                            handleOutput
                        );
                    } catch (baseErr: any) {
                        sendLog('error', `Installation of base foundation module FAILED. Fetching logs...`);
                        sendLog('error', `This error (often exit code 255) usually means Odoo crashed on startup or was terminated abruptly by the OS (e.g. killed by the Out-Of-Memory / OOM killer due to insufficient server RAM).`);
                        sendLog('info', `Please verify that your database is running and that your server has enough RAM (consider adding a swap file if memory is low).`);
                        try {
                            await runCommandStream('docker', ['logs', '--tail', '100', containerName], {}, handleOutput);
                        } catch { /* ignore */ }
                        throw baseErr;
                    }

                    // Install the remaining core modules one by one
                    const remainingCore = Array.from(coreModules).filter(m => m !== 'base');
                    for (const mod of remainingCore) {
                        sendLog('info', `  → Installing core module: ${mod}`);
                        try {
                            await runCommandStream(
                                'docker',
                                ['exec', '-e', 'PYTHONUNBUFFERED=1', containerName, 'odoo', '-d', dbName, '-i', mod,
                                 '--stop-after-init', '--no-http', '--without-demo=all'],
                                {},
                                handleOutput
                            );
                        } catch (coreErr: any) {
                            sendLog('error', `Installation of core module "${mod}" FAILED. Fetching logs...`);
                            try {
                                await runCommandStream('docker', ['logs', '--tail', '100', containerName], {}, handleOutput);
                            } catch { /* ignore */ }
                            throw coreErr;
                        }
                    }
                    sendLog('info', `Phase 1 complete — all core modules successfully installed.`);

                    // ── STEP 5b: Install OCA/custom modules (BEST-EFFORT, one by one) ───
                    if (ocaModules.size > 0) {
                        sendLog('info', `[5b/6] Phase 2 — Installing ${ocaModules.size} OCA/custom modules (failures are warnings, not crashes)...`);
                        const failed: string[] = [];
                        const succeeded: string[] = [];
                        for (const mod of ocaModules) {
                            try {
                                sendLog('info', `  → Installing: ${mod}`);
                                await runCommandStream(
                                    'docker',
                                    ['exec', '-e', 'PYTHONUNBUFFERED=1', containerName, 'odoo', '-d', dbName, '-i', mod,
                                     '--stop-after-init', '--no-http', '--without-demo=all'],
                                    {},
                                    handleOutput
                                );
                                succeeded.push(mod);
                            } catch (err: any) {
                                failed.push(mod);
                                sendLog('stderr', `  ✗ Module "${mod}" failed to install (skipped). Reason: ${err.message}`);
                            }
                        }
                        sendLog('info', `Phase 2 complete — ${succeeded.length} installed, ${failed.length} skipped.`);
                        if (failed.length > 0) {
                            sendLog('stderr', `Skipped modules: ${failed.join(', ')}`);
                            sendLog('stderr', `Tip: Run "docker exec -e PYTHONUNBUFFERED=1 ${containerName} odoo -d ${dbName} -i <module> --stop-after-init" manually inside your server terminal to see the full traceback.`);
                        }
                    }

                    sendLog('info', `Database initialisation complete for ${dbName}.`);

                    // Restart container to refresh assets and load addons registry
                    sendLog('info', `Restarting Odoo container to apply registry cache changes...`);
                    await runCommandStream(
                        'docker',
                        ['restart', containerName],
                        {},
                        handleOutput
                    );

                    // Step 6: Health verification loop
                    sendLog('info', `[6/6] Starting container health checks...`);
                    let isHealthy = false;
                    let attempts = 0;
                    const maxAttempts = 15;
                    const hostIp = process.env.NPM_FORWARD_HOST || '172.17.0.1';

                    while (attempts < maxAttempts && !isHealthy) {
                        attempts++;
                        sendLog('info', `Health Check Attempt ${attempts}/${maxAttempts}: Verifying port ${port}...`);
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
                                    // next url
                                }
                            }
                        } catch {
                            // ignore
                        }
                    }

                    if (isHealthy) {
                        await registry.updateInstance(instanceId, {
                            status: 'active',
                            last_health_check: new Date().toISOString()
                        });
                        sendLog('info', `Health check successful! Portal status set to active.`);
                    } else {
                        throw new Error('Container spawned but timed out during health check verification.');
                    }

                    // Step 7: Nginx Proxy Manager setup
                    if (process.platform !== 'win32') {
                        sendLog('info', `Configuring Nginx Proxy Manager routing for domain ${domain}...`);
                        try {
                            const forwardHost = process.env.NPM_FORWARD_HOST || '172.17.0.1';
                            const result = await npmClient.createProxyHost(domain, forwardHost, port);
                            if (result) {
                                sendLog('info', `NPM Proxy Host configured successfully.`);
                            } else {
                                sendLog('stderr', `Warning: NPM API credentials are not configured in your .env file on the server. Skipping automatic routing. You must add the Proxy Host manually inside your Nginx Proxy Manager admin panel.`);
                            }
                        } catch (npmErr: any) {
                            sendLog('stderr', `NPM integration error: ${npmErr.message}. You will need to create the Proxy Host manually.`);
                        }
                    }

                    // Success!
                    sendLog('success', `Deployment completed successfully!`, {
                        port,
                        url: `http://${domain}`,
                        instanceId
                    });

                } catch (err: any) {
                    sendLog('error', `Deployment crashed: ${err.message}`);
                    sendLog('info', `Starting rollback procedure to clean server resources...`);

                    try {
                        sendLog('info', `Stopping and removing Docker container...`);
                        await runCommandStream('docker', ['compose', 'down', '-v'], { cwd: clientDir }, handleOutput);
                    } catch (composeErr: any) {
                        sendLog('stderr', `Rollback error (docker compose down): ${composeErr.message}`);
                    }

                    try {
                        sendLog('info', `Dropping PostgreSQL database ${dbName}...`);
                        await runCommandStream(
                            'docker',
                            ['exec', '-e', `PGPASSWORD=${PG_PASSWORD}`, DB_CONTAINER, 'psql', '-U', 'odoo', 'postgres', '-c', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}';`],
                            {},
                            handleOutput
                        );
                        await runCommandStream(
                            'docker',
                            ['exec', '-e', `PGPASSWORD=${PG_PASSWORD}`, DB_CONTAINER, 'psql', '-U', 'odoo', 'postgres', '-c', `DROP DATABASE IF EXISTS "${dbName}";`],
                            {},
                            handleOutput
                        );
                    } catch (dbErr: any) {
                        sendLog('stderr', `Rollback error (drop database): ${dbErr.message}`);
                    }

                    try {
                        sendLog('info', `Removing directories in ${clientDir}...`);
                        await fs.remove(clientDir);
                    } catch (fsErr: any) {
                        sendLog('stderr', `Rollback error (remove files): ${fsErr.message}`);
                    }

                    try {
                        sendLog('info', `Deleting database registry record...`);
                        await registry.deleteInstanceRecord(instanceId);
                    } catch (regErr: any) {
                        sendLog('stderr', `Rollback error (delete registry): ${regErr.message}`);
                    }

                    sendLog('error', `Rollback completed. Deployment failed.`);
                } finally {
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        });

    } catch (error: any) {
        await logger.error('CREATION', 'Stream initiation crashed', { error: error.message, instanceId });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
