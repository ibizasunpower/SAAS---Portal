import { NextResponse } from 'next/server';
import fs from 'fs-extra';
import path from 'path';

export async function GET() {
    try {
        const configPath = path.join(process.cwd(), 'modules_config.json');
        
        if (!await fs.pathExists(configPath)) {
            return NextResponse.json({});
        }

        const config = await fs.readJson(configPath);
        
        // Return categories formatted for checkboxes (id, name, description, modules)
        const categories = Object.keys(config).map(key => ({
            id: key,
            name: config[key].name,
            description: config[key].description,
            modules: config[key].modules
        }));

        return NextResponse.json(categories);
    } catch (error: any) {
        return NextResponse.json({ error: 'Failed to fetch module plans: ' + error.message }, { status: 500 });
    }
}
