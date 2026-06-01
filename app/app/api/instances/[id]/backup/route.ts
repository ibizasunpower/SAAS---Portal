import { NextResponse } from 'next/server';
import { registry } from '@/lib/registry';
import { logger } from '@/lib/logger';
import { spawn } from 'child_process';

const PG_PASSWORD = process.env.PG_PASSWORD || 'Enter@123!';
const DB_CONTAINER = process.env.DB_CONTAINER || 'db';

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
        if (!databaseName) {
            await logger.warn('DATABASE', `Instance ID ${id} has no database name.`, { id });
            return NextResponse.json({ error: 'Database name not found' }, { status: 404 });
        }

        await logger.info('DATABASE', `Starting backup for database: ${databaseName}`, { id });

        // Spawn pg_dump
        const child = spawn('docker', [
            'exec',
            '-e',
            `PGPASSWORD=${PG_PASSWORD}`,
            DB_CONTAINER,
            'pg_dump',
            '-U',
            'odoo',
            '-F',
            'c',
            databaseName
        ]);

        const stream = new ReadableStream({
            start(controller) {
                child.stdout.on('data', (chunk) => {
                    controller.enqueue(chunk);
                });
                child.stderr.on('data', (chunk) => {
                    const msg = chunk.toString();
                    if (msg.trim()) {
                        console.error(`[pg_dump stderr] ${msg.trim()}`);
                    }
                });
                child.on('close', (code) => {
                    if (code !== 0) {
                        logger.error('DATABASE', `pg_dump failed with exit code ${code} for ${databaseName}`, { id });
                        controller.error(new Error(`pg_dump exited with code ${code}`));
                    } else {
                        logger.info('DATABASE', `Backup completed successfully for database: ${databaseName}`, { id });
                        controller.close();
                    }
                });
                child.on('error', (err) => {
                    logger.error('DATABASE', `Process error for backup of ${databaseName}`, { error: err.message, id });
                    controller.error(err);
                });
            },
            cancel() {
                child.kill();
            }
        });

        const safeDate = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${databaseName}_${safeDate}.dump`;

        return new Response(stream, {
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            }
        });

    } catch (error: any) {
        await logger.error('DATABASE', `Backup failed for instance ID: ${id}`, { error: error.message, id });
        return NextResponse.json({ error: `Backup failed: ${error.message}` }, { status: 500 });
    }
}
