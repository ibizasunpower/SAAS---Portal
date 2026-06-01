const fs = require('fs-extra');
const path = require('path');

// Root directories to scan for addons
const SCAN_PATHS = {
    "18": process.env.ADDONS_PATH_18 || "/home/portal/common18/custom",
    "19": process.env.ADDONS_PATH_19 || "/home/portal/common19/custom"
};

// Base config that we always want to include (e.g. core Odoo apps)
const getBaseCategories = () => ({
    "crm_sales": {
        "name": "CRM & Sales",
        "description": "Core Odoo CRM, Sales, and Invoicing pipeline.",
        "modules": [
            { "id": "crm", "name": "CRM" },
            { "id": "sale", "name": "Sales" },
            { "id": "sale_management", "name": "Sales Management" }
        ]
    },
    "inventory_mrp": {
        "name": "Inventory & Manufacturing",
        "description": "Inventory management, purchase workflows, and MRP.",
        "modules": [
            { "id": "stock", "name": "Inventory" },
            { "id": "purchase", "name": "Purchase" },
            { "id": "mrp", "name": "Manufacturing" }
        ]
    }
});

const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function parseManifest(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        // Clean comments
        const cleanContent = content
            .split('\n')
            .map(line => line.replace(/#.*$/, ''))
            .join('\n');

        // Helper to extract string values using regex
        const extractString = (field) => {
            const regex = new RegExp(`['"]${field}['"]\\s*:\\s*(['"]{1,3})([\\s\\S]*?)\\1`, 'i');
            const match = cleanContent.match(regex);
            if (match) {
                return match[2].trim();
            }
            return null;
        };

        const name = extractString('name') || path.basename(path.dirname(filePath));
        const category = extractString('category') || 'Uncategorized';
        const summary = extractString('summary') || '';

        return { name, category, summary };
    } catch (err) {
        console.error(`Failed to parse manifest at ${filePath}:`, err.message);
        return null;
    }
}

async function run() {
    const config = {};

    for (const [version, scanPath] of Object.entries(SCAN_PATHS)) {
        console.log(`Scanning Odoo ${version} modules in ${scanPath}...`);
        
        // Initialize with base categories
        config[version] = getBaseCategories();

        if (!await fs.pathExists(scanPath)) {
            console.warn(`Warning: Scan path for Odoo ${version} does not exist: ${scanPath}. Skipping.`);
            continue;
        }

        try {
            const items = await fs.readdir(scanPath);
            let moduleCount = 0;

            for (const item of items) {
                const itemPath = path.join(scanPath, item);
                const stat = await fs.stat(itemPath);

                if (stat.isDirectory()) {
                    // Check if it's an Odoo module folder
                    const manifestPath = path.join(itemPath, '__manifest__.py');
                    if (await fs.pathExists(manifestPath)) {
                        const manifest = parseManifest(manifestPath);
                        if (manifest) {
                            const catKey = slugify(manifest.category);
                            
                            // Initialize category if it doesn't exist
                            if (!config[version][catKey]) {
                                config[version][catKey] = {
                                    name: manifest.category,
                                    description: `Odoo ${manifest.category} modules.`,
                                    modules: []
                                };
                            }

                            // Avoid duplicates
                            const exists = config[version][catKey].modules.some(m => m.id === item);
                            if (!exists) {
                                config[version][catKey].modules.push({
                                    id: item,
                                    name: manifest.name,
                                    description: manifest.summary
                                });
                                moduleCount++;
                            }
                        }
                    }
                }
            }
            console.log(`Successfully indexed ${moduleCount} custom modules for Odoo ${version}.`);
        } catch (err) {
            console.error(`Error scanning path ${scanPath}:`, err.message);
        }
    }

    const outputPath = path.join(__dirname, 'modules_config.json');
    await fs.writeJson(outputPath, config, { spaces: 2 });
    console.log(`Updated modules config written to ${outputPath}`);
}

run().catch(err => {
    console.error('Auto-generator script failed:', err);
    process.exit(1);
});
