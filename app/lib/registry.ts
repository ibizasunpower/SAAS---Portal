import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { docker } from './docker';
import { logger } from './logger';

const BASE_DIR = process.env.BASE_DIR || (process.platform === 'win32' ? 'd:/!ODOO/ODOO Apps/SASS - Portal' : '/home/portal');
const REGISTRY_FILE = path.join(BASE_DIR, 'registry.json');

export interface InstanceRecord {
    instance_id: string; // UUID
    container_name: string; // tenant_<slug>
    database_name: string; // tenant_<slug>
    odoo_port: number; // Host port
    addons_path: string; // Path on host
    config_path: string; // Path on host
    status: 'active' | 'stopped' | 'failed' | 'failed_delete';
    created_at: string; // ISO String
    last_health_check: string; // ISO String
    client_name: string; // Display name
    domain: string;
    version: string;
    last_backup?: string;
}

export class InstanceRegistry {
    private writeLock = false;

    private async acquireLock(): Promise<void> {
        while (this.writeLock) {
            await new Promise(r => setTimeout(r, 50));
        }
        this.writeLock = true;
    }

    private releaseLock() {
        this.writeLock = false;
    }

    async getRegistry(): Promise<InstanceRecord[]> {
        try {
            const exists = await fs.pathExists(REGISTRY_FILE);
            if (!exists) {
                // Run auto-discovery to build initial registry if none exists
                logger.info('REGISTRY', 'Registry file not found. Starting auto-discovery of existing instances...');
                const discovered = await this.discoverExistingInstances();
                await this.saveRegistry(discovered);
                return discovered;
            }

            const data = await fs.readJson(REGISTRY_FILE);
            return Array.isArray(data) ? data : [];
        } catch (error: any) {
            logger.error('REGISTRY', 'Failed to read registry.json', { error: error.message });
            return [];
        }
    }

    async saveRegistry(records: InstanceRecord[]): Promise<void> {
        await this.acquireLock();
        try {
            const tempFile = `${REGISTRY_FILE}.tmp`;
            await fs.writeJson(tempFile, records, { spaces: 2 });
            await fs.rename(tempFile, REGISTRY_FILE);
        } catch (error: any) {
            logger.error('REGISTRY', 'Failed to write registry.json atomically', { error: error.message });
            throw error;
        } finally {
            this.releaseLock();
        }
    }

    async getInstance(id: string): Promise<InstanceRecord | undefined> {
        const records = await this.getRegistry();
        return records.find(r => r.instance_id === id || r.container_name === id || r.database_name === id);
    }

    async addInstance(record: InstanceRecord): Promise<void> {
        const records = await this.getRegistry();
        
        // Check for duplicates
        const exists = records.some(r => r.instance_id === record.instance_id || r.container_name === record.container_name);
        if (exists) {
            throw new Error(`Instance already exists in registry: ${record.container_name}`);
        }

        records.push(record);
        await this.saveRegistry(records);
        logger.info('REGISTRY', `Added instance to registry: ${record.container_name}`, { instance_id: record.instance_id });
    }

    async updateInstance(id: string, updates: Partial<InstanceRecord>): Promise<void> {
        const records = await this.getRegistry();
        const index = records.findIndex(r => r.instance_id === id);
        
        if (index === -1) {
            throw new Error(`Instance not found in registry: ${id}`);
        }

        records[index] = { ...records[index], ...updates };
        await this.saveRegistry(records);
        logger.info('REGISTRY', `Updated instance in registry: ${records[index].container_name}`, { instance_id: id, updates });
    }

    async deleteInstanceRecord(id: string): Promise<void> {
        const records = await this.getRegistry();
        const filtered = records.filter(r => r.instance_id !== id);
        
        if (filtered.length === records.length) {
            logger.warn('REGISTRY', `Attempted to delete instance not in registry: ${id}`);
            return;
        }

        await this.saveRegistry(filtered);
        logger.info('REGISTRY', `Deleted instance from registry: ${id}`);
    }

    // Auto-discovery of existing Odoo containers to build registry
    private async discoverExistingInstances(): Promise<InstanceRecord[]> {
        const discovered: InstanceRecord[] = [];
        try {
            const containers = await docker.listContainers({ all: true });
            
            // Filter containers running Odoo or named appropriately
            const odooContainers = containers.filter(c => 
                c.Image.includes('odoo') || 
                c.Image.startsWith('root-') ||
                c.Names.some(n => n.toLowerCase().includes('odoo') || n.toLowerCase().includes('tenant_'))
            );

            for (const container of odooContainers) {
                const containerName = container.Names[0]?.replace('/', '') || '';
                const cleanName = containerName.replace(/^odoo-/, '').replace(/^tenant_/, '');
                
                // Retrieve host port
                let port = 8069; // default odoo port
                if (container.Ports && container.Ports.length > 0) {
                    const mappedPort = container.Ports.find(p => p.PublicPort)?.PublicPort;
                    if (mappedPort) port = mappedPort;
                }

                // Retrieve host volume paths if present
                let config_path = '';
                let addons_path = '';
                if (container.Id) {
                    try {
                        const inspectInfo = await docker.getContainer(container.Id).inspect();
                        inspectInfo.Mounts?.forEach((mount: any) => {
                            if (mount.Destination === '/etc/odoo') {
                                config_path = mount.Source;
                            }
                            if (mount.Destination === '/mnt/extra-addons') {
                                addons_path = mount.Source;
                            }
                        });
                    } catch (inspectErr) {
                        // ignore inspect failure
                    }
                }

                // Fallbacks
                const clientDir = path.join(BASE_DIR, 'clients', containerName);
                const legacyClientDir = path.join(BASE_DIR, cleanName);
                
                let actualClientDir = clientDir;
                if (!config_path) {
                    // Try to guess
                    const clientExists = await fs.pathExists(clientDir);
                    const legacyExists = await fs.pathExists(legacyClientDir);
                    actualClientDir = clientExists ? clientDir : (legacyExists ? legacyClientDir : clientDir);
                    
                    config_path = path.join(actualClientDir, 'config');
                    addons_path = path.join(actualClientDir, 'addons');
                }

                // Parse config to find exact database name
                let database_name = containerName;
                const hostConfPath = path.join(config_path, 'odoo.conf');
                if (await fs.pathExists(hostConfPath)) {
                    try {
                        const confContent = await fs.readFile(hostConfPath, 'utf8');
                        const dbNameMatch = confContent.match(/db_name\s*=\s*([a-zA-Z0-9_\-]+)/);
                        const dbFilterMatch = confContent.match(/dbfilter\s*=\s*([a-zA-Z0-9_\-%^$]+)/);
                        database_name = dbNameMatch?.[1] || dbFilterMatch?.[1]?.replace(/[\^$]/g, '') || containerName;
                    } catch (readErr) {
                        // ignore read error
                    }
                }

                // Extract domain from docker labels
                const domain = container.Labels?.['com.odoo.domain'] || `${cleanName}.local`;
                
                // Deduce version
                let version = '18';
                if (container.Image.includes(':19') || container.Image.includes('19.0')) version = '19';

                const record: InstanceRecord = {
                    instance_id: crypto.randomUUID(),
                    container_name: containerName,
                    database_name: database_name,
                    odoo_port: port,
                    addons_path,
                    config_path,
                    status: container.State === 'running' ? 'active' : 'stopped',
                    created_at: new Date(container.Created * 1000).toISOString(),
                    last_health_check: new Date().toISOString(),
                    client_name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
                    domain,
                    version
                };

                discovered.push(record);
                logger.info('REGISTRY', `Discovered existing container: ${containerName} -> DB: ${database_name}`, { instance_id: record.instance_id });
            }
        } catch (discoverErr: any) {
            logger.error('REGISTRY', 'Auto-discovery of existing containers failed', { error: discoverErr.message });
        }
        return discovered;
    }
}

export const registry = new InstanceRegistry();
