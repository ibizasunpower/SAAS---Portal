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

        const extractDepends = () => {
            const regex = /['"]depends['"]\s*:\s*\[([\s\S]*?)\]/i;
            const match = cleanContent.match(regex);
            if (match) {
                return match[1]
                    .split(',')
                    .map(item => item.replace(/['"\s]/g, ''))
                    .filter(Boolean);
            }
            return [];
        };

        const extractExternalDeps = () => {
            const regex = /['"]external_dependencies['"]\s*:\s*\{([\s\S]*?)\}/i;
            const match = cleanContent.match(regex);
            if (match) {
                const inner = match[1];
                const pythonRegex = /['"]python['"]\s*:\s*\[([\s\S]*?)\]/i;
                const pythonMatch = inner.match(pythonRegex);
                const pythonDeps = pythonMatch 
                    ? pythonMatch[1].split(',').map(item => item.replace(/['"\s]/g, '')).filter(Boolean)
                    : [];

                const binRegex = /['"]bin['"]\s*:\s*\[([\s\S]*?)\]/i;
                const binMatch = inner.match(binRegex);
                const binDeps = binMatch
                    ? binMatch[1].split(',').map(item => item.replace(/['"\s]/g, '')).filter(Boolean)
                    : [];

                return { python: pythonDeps, bin: binDeps };
            }
            return null;
        };

        const name = extractString('name') || path.basename(path.dirname(filePath));
        const category = extractString('category') || 'Uncategorized';
        const summary = extractString('summary') || '';
        const depends = extractDepends();
        const external_dependencies = extractExternalDeps();

        let requirementsTxt = [];
        const reqPath = path.join(path.dirname(filePath), 'requirements.txt');
        if (fs.existsSync(reqPath)) {
            try {
                requirementsTxt = fs.readFileSync(reqPath, 'utf8')
                    .split('\n')
                    .map(line => line.replace(/#.*$/, '').trim())
                    .filter(Boolean);
            } catch {}
        }

        return { name, category, summary, depends, external_dependencies, requirements: requirementsTxt };
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

                if (!stat.isDirectory()) continue;

                // Check if it's an Odoo module directly (Level 1)
                const manifestPath = path.join(itemPath, '__manifest__.py');
                if (await fs.pathExists(manifestPath)) {
                    const manifest = parseManifest(manifestPath);
                    if (manifest) {
                        const catKey = slugify(manifest.category);
                        if (!config[version][catKey]) {
                            config[version][catKey] = {
                                name: manifest.category,
                                description: `Odoo ${manifest.category} modules.`,
                                modules: []
                            };
                        }
                        const exists = config[version][catKey].modules.some(m => m.id === item);
                        if (!exists) {
                            config[version][catKey].modules.push({
                                id: item,
                                name: manifest.name,
                                description: manifest.summary,
                                depends: manifest.depends,
                                external_dependencies: manifest.external_dependencies,
                                requirements: manifest.requirements
                            });
                            moduleCount++;
                        }
                    }
                } else {
                    // Check if it's a repository containing nested Odoo modules (Level 2)
                    // E.g. search inside `scanPath/item/*`
                    try {
                        const subItems = await fs.readdir(itemPath);
                        for (const subItem of subItems) {
                            const subItemPath = path.join(itemPath, subItem);
                            const subStat = await fs.stat(subItemPath);

                            if (subStat.isDirectory()) {
                                const subManifestPath = path.join(subItemPath, '__manifest__.py');
                                if (await fs.pathExists(subManifestPath)) {
                                    const manifest = parseManifest(subManifestPath);
                                    if (manifest) {
                                        // Index the nested module
                                        const catKey = slugify(manifest.category);
                                        if (!config[version][catKey]) {
                                            config[version][catKey] = {
                                                name: manifest.category,
                                                description: `Odoo ${manifest.category} modules.`,
                                                modules: []
                                            };
                                        }
                                        const exists = config[version][catKey].modules.some(m => m.id === subItem);
                                        if (!exists) {
                                            config[version][catKey].modules.push({
                                                id: subItem,
                                                name: manifest.name,
                                                description: manifest.summary,
                                                depends: manifest.depends,
                                                external_dependencies: manifest.external_dependencies,
                                                requirements: manifest.requirements
                                            });
                                            moduleCount++;
                                        }

                                        // Create a relative symbolic link at the root level of custom directory
                                        // so Odoo container can load it
                                        const target = `./${item}/${subItem}`;
                                        const linkPath = path.join(scanPath, subItem);

                                        let linkExists = false;
                                        try {
                                            fs.lstatSync(linkPath);
                                            linkExists = true;
                                        } catch (e) {
                                            // doesn't exist
                                        }

                                        if (!linkExists) {
                                            try {
                                                fs.symlinkSync(target, linkPath);
                                                console.log(`Created symlink: ${subItem} -> ${target}`);
                                            } catch (err) {
                                                console.error(`Failed to create symlink for ${subItem}:`, err.message);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch (readErr) {
                        console.error(`Failed to read nested folder ${itemPath}:`, readErr.message);
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
