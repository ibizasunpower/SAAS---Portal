import { NextResponse } from 'next/server';
import { docker } from '@/lib/docker';
import { registry } from '@/lib/registry';
import { logger } from '@/lib/logger';

export async function GET() {
    try {
        await logger.info('REGISTRY', 'Fetching instances from registry...');
        const records = await registry.getRegistry();

        // Get live containers from Docker to enrich the registry data
        let containers: any[] = [];
        try {
            containers = await docker.listContainers({ all: true });
        } catch (dockerErr: any) {
            await logger.warn('REGISTRY', 'Failed to retrieve live Docker container statuses', { error: dockerErr.message });
        }

        // Map live containers by name for O(1) lookup
        const containerMap = new Map<string, any>();
        containers.forEach(c => {
            c.Names?.forEach((name: string) => {
                const cleanName = name.replace('/', '');
                containerMap.set(cleanName, c);
            });
        });

        // Enrich registry records with live container data
        const instances = records.map(record => {
            const liveContainer = containerMap.get(record.container_name);
            
            // Build the port array the UI expects
            const ports = liveContainer?.Ports || [
                { PublicPort: record.odoo_port }
            ];

            return {
                id: record.instance_id,
                names: [record.container_name],
                image: liveContainer?.Image || `odoo:${record.version}.0`,
                state: liveContainer ? liveContainer.State : (record.status === 'active' ? 'stopped' : record.status),
                status: liveContainer ? liveContainer.Status : record.status,
                ports,
                created: Math.floor(new Date(record.created_at).getTime() / 1000),
                created_at: record.created_at,
                last_backup: record.last_backup || null,
                domain: record.domain,
                version: record.version,
                database: record.database_name
            };
        });

        await logger.info('REGISTRY', `Returned ${instances.length} instances to client dashboard.`);
        return NextResponse.json(instances);

    } catch (error: any) {
        await logger.error('REGISTRY', 'Failed to list instances', { error: error.message });
        return NextResponse.json({ error: 'Failed to list instances' }, { status: 500 });
    }
}
