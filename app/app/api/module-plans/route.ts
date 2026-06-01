import { NextResponse } from 'next/server';
import fs from 'fs-extra';
import path from 'path';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const version = searchParams.get('version') || '19';
        const configPath = path.join(process.cwd(), 'modules_config.json');
        
        if (!await fs.pathExists(configPath)) {
            return NextResponse.json([]);
        }

        const config = await fs.readJson(configPath);
        
        // If config is partitioned by version (e.g. { "18": {...}, "19": {...} })
        // otherwise default to standard flat layout
        const isVersioned = config['18'] || config['19'];
        const versionConfig = isVersioned ? (config[version] || config['18'] || {}) : config;
        
        // Return categories formatted for checkboxes (id, name, description, modules)
        const categories = Object.keys(versionConfig).map(key => ({
            id: key,
            name: versionConfig[key].name,
            description: versionConfig[key].description,
            modules: versionConfig[key].modules || []
        }));

        return NextResponse.json(categories);
    } catch (error: any) {
        return NextResponse.json({ error: 'Failed to fetch module plans: ' + error.message }, { status: 500 });
    }
}
