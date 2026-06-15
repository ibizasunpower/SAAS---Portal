import { NextResponse } from 'next/server';
import { registry } from '@/lib/registry';
import { logger } from '@/lib/logger';
import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';

const BASE_DIR = process.env.BASE_DIR || (process.platform === 'win32' ? 'd:/!ODOO/ODOO Apps/SASS - Portal' : '/home/portal');
const TEMPLATE_DIR = path.join(BASE_DIR, 'templates');
const PG_PASSWORD = process.env.PG_PASSWORD || 'Enter@123!';
const DB_CONTAINER = process.env.DB_CONTAINER || 'db';

export async function GET() {
    try {
        if (!await fs.pathExists(TEMPLATE_DIR)) {
            await fs.ensureDir(TEMPLATE_DIR);
        }

        const dirs = await fs.readdir(TEMPLATE_DIR);
        const templates = [];

        for (const dir of dirs) {
            const dirPath = path.join(TEMPLATE_DIR, dir);
            const stat = await fs.stat(dirPath);
            if (!stat.isDirectory()) continue;

            const metadataPath = path.join(dirPath, 'metadata.json');
            if (await fs.pathExists(metadataPath)) {
                try {
                    const meta = await fs.readJson(metadataPath);
                    templates.push({
                        id: dir,
                        name: meta.name || dir,
                        version: meta.version || '18',
                        created_at: meta.created_at,
                        description: meta.description || '',
                        is_custom: true
                    });
                } catch {
                    templates.push({
                        id: dir,
                        name: dir,
                        version: '18',
                        is_custom: true
                    });
                }
            } else {
                let name = dir;
                let version = '18';
                if (dir === 'odoo18') {
                    name = 'Odoo 18.0 Default';
                    version = '18';
                } else if (dir === 'odoo19') {
                    name = 'Odoo 19.0 Default';
                    version = '19';
                } else if (dir === 'odoo18-saas-template') {
                    name = 'Odoo 18.0 SaaS Template';
                    version = '18';
                } else {
                    if (dir.includes('19')) version = '19';
                }

                templates.push({
                    id: dir,
                    name: name,
                    version: version,
                    is_custom: false
                });
            }
        }

        return NextResponse.json(templates);
    } catch (error: any) {
        await logger.error('REGISTRY', 'Failed to list templates', { error: error.message });
        return NextResponse.json({ error: 'Failed to list templates' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { instanceId, templateName: rawTemplateName } = body;

        if (!instanceId || !rawTemplateName) {
            return NextResponse.json({ error: 'Missing required fields: instanceId or templateName' }, { status: 400 });
        }

        const templateName = rawTemplateName.toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (!templateName) {
            return NextResponse.json({ error: 'Template name must contain alphanumeric characters or hyphens' }, { status: 400 });
        }

        // Collision Check
        const templatePath = path.join(TEMPLATE_DIR, templateName);
        if (await fs.pathExists(templatePath)) {
            return NextResponse.json({ error: `Template '${templateName}' already exists` }, { status: 409 });
        }

        // Get instance details
        const record = await registry.getInstance(instanceId);
        if (!record) {
            return NextResponse.json({ error: 'Instance not found in database registry' }, { status: 404 });
        }

        const containerName = record.container_name;
        const databaseName = record.database_name;
        const clientDir = path.join(BASE_DIR, 'clients', containerName);

        if (!await fs.pathExists(clientDir)) {
            return NextResponse.json({ error: `Client directory ${clientDir} does not exist on disk` }, { status: 404 });
        }

        await logger.info('PROVISION', `Creating template '${templateName}' from instance '${containerName}'...`, { instanceId, databaseName });

        // 1. Create template directory structure
        await fs.ensureDir(templatePath);

        // Copy addons if exists
        const clientAddons = path.join(clientDir, 'addons');
        if (await fs.pathExists(clientAddons)) {
            await fs.copy(clientAddons, path.join(templatePath, 'addons'));
        } else {
            await fs.ensureDir(path.join(templatePath, 'addons'));
        }

        // Copy config if exists
        const clientConfig = path.join(clientDir, 'config');
        if (await fs.pathExists(clientConfig)) {
            await fs.copy(clientConfig, path.join(templatePath, 'config'));
        }

        // Copy docker-compose.yml if exists
        const clientCompose = path.join(clientDir, 'docker-compose.yml');
        if (await fs.pathExists(clientCompose)) {
            await fs.copy(clientCompose, path.join(templatePath, 'docker-compose.yml'));
        }

        // 2. Export database dump
        const dumpFile = path.join(templatePath, 'dump.sql');
        const writeStream = fs.createWriteStream(dumpFile);

        await logger.info('DATABASE', `Dumping database ${databaseName} via pg_dump...`);
        const proc = spawn('docker', [
            'exec',
            '-i',
            '-e', `PGPASSWORD=${PG_PASSWORD}`,
            DB_CONTAINER,
            'pg_dump',
            '-U', 'odoo',
            '--clean',
            '--no-owner',
            '-d', databaseName
        ]);

        proc.stdout.pipe(writeStream);

        let stderr = '';
        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        const dumpSuccess = await new Promise<boolean>((resolve) => {
            proc.on('close', (code) => {
                if (code === 0) {
                    resolve(true);
                } else {
                    console.error(`pg_dump failed with code ${code}: ${stderr}`);
                    resolve(false);
                }
            });
            proc.on('error', (err) => {
                console.error(`pg_dump process error:`, err);
                resolve(false);
            });
        });

        if (!dumpSuccess) {
            // Clean up template folder if database dump failed
            await fs.remove(templatePath);
            return NextResponse.json({ error: 'Database dump failed. Make sure the container database is running.' }, { status: 500 });
        }

        // 3. Write metadata file
        const metadata = {
            name: templateName,
            version: record.version,
            created_at: new Date().toISOString(),
            description: `Custom template from ${record.client_name} (Odoo ${record.version}.0)`
        };
        await fs.writeJson(path.join(templatePath, 'metadata.json'), metadata, { spaces: 2 });

        await logger.info('PROVISION', `Template '${templateName}' successfully created.`);
        return NextResponse.json({ success: true, template: templateName });

    } catch (error: any) {
        await logger.error('PROVISION', 'Template creation crashed', { error: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
