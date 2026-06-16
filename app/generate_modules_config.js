const fs = require('fs-extra');
const path = require('path');

// Root directories to scan for addons
const SCAN_DIRS = {
    "18": [
        { path: "/home/portal/common18/custom", catKey: "custom_oca_addons", name: "Custom OCA addons" },
        { path: "/home/portal/common18/custom_paid", catKey: "custom_paid_addons", name: "Custom Paid Addons" },
        { path: "/home/portal/common18/custom-paid", catKey: "custom_paid_addons", name: "Custom Paid Addons" },
        { path: "/home/portal/common18/custom paid", catKey: "custom_paid_addons", name: "Custom Paid Addons" }
    ],
    "19": [
        { path: "/home/portal/common19/custom", catKey: "custom_oca_addons", name: "Custom OCA addons" },
        { path: "/home/portal/common19/custom_paid", catKey: "custom_paid_addons", name: "Custom Paid Addons" },
        { path: "/home/portal/common19/custom-paid", catKey: "custom_paid_addons", name: "Custom Paid Addons" },
        { path: "/home/portal/common19/custom paid", catKey: "custom_paid_addons", name: "Custom Paid Addons" }
    ]
};

// Base config that we always want to include (e.g. core Odoo apps)
const getBaseCategories = () => ({
    "crm_sales": {
        "name": "CRM & Sales",
        "description": "Core Odoo CRM, Sales, and Invoicing pipeline.",
        "modules": [
            { "id": "crm", "name": "CRM" },
            { "id": "sale", "name": "Sales" },
            { "id": "sale_management", "name": "Sales Management" },
            { "id": "contacts", "name": "Contacts" },
            { "id": "crm_iap_enrich", "name": "Lead Enrichment" },
            { "id": "crm_iap_mine", "name": "Lead Generation" },
            { "id": "crm_industry", "name": "CRM Industry" },
            { "id": "crm_livechat", "name": "CRM Livechat" },
            { "id": "crm_mail_plugin", "name": "CRM Mail Plugin" },
            { "id": "crm_sms", "name": "CRM SMS" },
            { "id": "delivery", "name": "Delivery Costs" }
        ]
    },
    "inventory_mrp": {
        "name": "Inventory & Manufacturing",
        "description": "Inventory management, purchase workflows, and MRP.",
        "modules": [
            { "id": "stock", "name": "Inventory" },
            { "id": "purchase", "name": "Purchase" },
            { "id": "mrp", "name": "Manufacturing" },
            { "id": "mrp_account", "name": "MRP Accounting" },
            { "id": "mrp_landed_costs", "name": "MRP Landed Costs" },
            { "id": "mrp_repair", "name": "MRP Repair" },
            { "id": "fleet", "name": "Fleet" },
            { "id": "hr_fleet", "name": "HR Fleet" }
        ]
    },
    "accounting": {
        "name": "Invoicing & Accounting",
        "description": "Core Odoo Invoicing and Accounting apps.",
        "modules": [
            { "id": "account", "name": "Invoicing" },
            { "id": "analytic", "name": "Analytic Accounting" },
            { "id": "payment", "name": "Payment Providers" },
            { "id": "payment_mollie", "name": "Mollie Payment Provider" },
            { "id": "payroll", "name": "Payroll" },
            { "id": "payroll_account", "name": "Payroll Accounting" }
        ]
    },
    "human_resources": {
        "name": "Human Resources & Payroll",
        "description": "Standard Odoo HR, Attendance, Timesheets, and Leave Management.",
        "modules": [
            { "id": "hr", "name": "Employees" },
            { "id": "hr_attendance", "name": "Attendances" },
            { "id": "hr_calendar", "name": "Employee Calendar" },
            { "id": "hr_contract", "name": "Employee Contracts" },
            { "id": "hr_expense", "name": "Expenses" },
            { "id": "hr_gamification", "name": "HR Gamification" },
            { "id": "hr_holidays", "name": "Time Off" },
            { "id": "hr_hourly_cost", "name": "Hourly Cost" },
            { "id": "hr_livechat", "name": "HR Livechat" },
            { "id": "hr_maintenance", "name": "HR Maintenance" },
            { "id": "hr_org_chart", "name": "Org Chart" },
            { "id": "hr_skills", "name": "Employee Skills" },
            { "id": "hr_skills_slides", "name": "Skills Slides" },
            { "id": "hr_skills_survey", "name": "Skills Survey" },
            { "id": "hr_timesheet", "name": "Timesheets" }
        ]
    },
    "marketing_pos_website": {
        "name": "Marketing, POS & Website",
        "description": "Point of Sale, eCommerce, Events, and Email Marketing.",
        "modules": [
            { "id": "point_of_sale", "name": "Point of Sale" },
            { "id": "pos_epson_printer", "name": "POS Epson Printer" },
            { "id": "pos_hr", "name": "POS HR" },
            { "id": "pos_loyalty", "name": "POS Loyalty" },
            { "id": "pos_mrp", "name": "POS MRP" },
            { "id": "pos_online_payment", "name": "POS Online Payment" },
            { "id": "pos_sale", "name": "POS Sale" },
            { "id": "pos_sale_loyalty", "name": "POS Sale Loyalty" },
            { "id": "pos_sale_margin", "name": "POS Sale Margin" },
            { "id": "pos_sms", "name": "POS SMS" },
            { "id": "loyalty", "name": "Coupons & Loyalty" },
            { "id": "mass_mailing", "name": "Email Marketing" },
            { "id": "mass_mailing_crm", "name": "Mass Mailing CRM" },
            { "id": "mass_mailing_crm_sms", "name": "Mass Mailing CRM SMS" },
            { "id": "mass_mailing_event", "name": "Mass Mailing Event" },
            { "id": "mass_mailing_event_sms", "name": "Mass Mailing Event SMS" },
            { "id": "mass_mailing_event_track", "name": "Mass Mailing Track" },
            { "id": "mass_mailing_event_track_sms", "name": "Mass Mailing Track SMS" },
            { "id": "mass_mailing_sale", "name": "Mass Mailing Sale" },
            { "id": "mass_mailing_sale_sms", "name": "Mass Mailing Sale SMS" },
            { "id": "mass_mailing_slides", "name": "Mass Mailing Slides" },
            { "id": "mass_mailing_sms", "name": "SMS Marketing" },
            { "id": "mass_mailing_themes", "name": "Mass Mailing Themes" },
            { "id": "marketing_card", "name": "Marketing Cards" },
            { "id": "event", "name": "Events" },
            { "id": "event_crm", "name": "Event CRM" },
            { "id": "event_crm_sale", "name": "Event CRM Sale" },
            { "id": "event_product", "name": "Event Product" },
            { "id": "event_sale", "name": "Event Sale" },
            { "id": "event_sms", "name": "Event SMS" },
            { "id": "website", "name": "Website" },
            { "id": "portal", "name": "Portal" },
            { "id": "portal_rating", "name": "Portal Rating" },
            { "id": "membership", "name": "Members" }
        ]
    },
    "core_system": {
        "name": "Core System & Tools",
        "description": "Standard Odoo internal system modules and technical tools.",
        "modules": [
            { "id": "base", "name": "Base" },
            { "id": "web", "name": "Web" },
            { "id": "mail", "name": "Discuss" },
            { "id": "mail_bot", "name": "OdooBot" },
            { "id": "mail_bot_hr", "name": "OdooBot HR" },
            { "id": "mail_group", "name": "Mailing Lists" },
            { "id": "mail_plugin", "name": "Mail Plugin" },
            { "id": "barcodes", "name": "Barcode" },
            { "id": "base_address_extended", "name": "Extended Addresses" },
            { "id": "base_automation", "name": "Automated Actions" },
            { "id": "base_import", "name": "Import CSV/Excel" },
            { "id": "base_import_module", "name": "Import Module" },
            { "id": "base_setup", "name": "Settings" },
            { "id": "base_sparse_field", "name": "Sparse Fields" },
            { "id": "base_vat", "name": "VAT" },
            { "id": "board", "name": "Dashboard" },
            { "id": "bus", "name": "Instant Messaging Bus" },
            { "id": "calendar", "name": "Calendar" },
            { "id": "calendar_sms", "name": "Calendar SMS" },
            { "id": "data_recycle", "name": "Data Recycle" },
            { "id": "digest", "name": "Digest Emails" },
            { "id": "gamification", "name": "Gamification" },
            { "id": "google_recaptcha", "name": "reCAPTCHA" },
            { "id": "html_editor", "name": "HTML Editor" },
            { "id": "http_routing", "name": "Web Routing" },
            { "id": "iap", "name": "IAP" },
            { "id": "iap_crm", "name": "IAP CRM" },
            { "id": "iap_mail", "name": "IAP Mail" },
            { "id": "im_livechat", "name": "Live Chat" },
            { "id": "link_tracker", "name": "Link Tracker" },
            { "id": "maintenance", "name": "Maintenance" },
            { "id": "microsoft_account", "name": "Microsoft Synchronization" },
            { "id": "onboarding", "name": "Onboarding" },
            { "id": "partner_autocomplete", "name": "Partner Autocomplete" },
            { "id": "phone_validation", "name": "Phone Validation" },
            { "id": "privacy", "name": "Privacy" },
            { "id": "privacy_lookup", "name": "Privacy Lookup" }
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

    for (const version of ["18", "19"]) {
        // Initialize with base categories
        config[version] = getBaseCategories();
        const dirsToScan = SCAN_DIRS[version];
        let totalModules = 0;

        for (const dirInfo of dirsToScan) {
            const { path: scanPath, catKey, name: catDisplayName } = dirInfo;

            if (!await fs.pathExists(scanPath)) {
                continue;
            }

            console.log(`Scanning Odoo ${version} modules in ${scanPath}...`);
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
                            if (!config[version][catKey]) {
                                config[version][catKey] = {
                                    name: catDisplayName,
                                    description: `${catDisplayName} modules.`,
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
                                            // Index the nested module under the repo's catKey
                                            if (!config[version][catKey]) {
                                                config[version][catKey] = {
                                                    name: catDisplayName,
                                                    description: `${catDisplayName} modules.`,
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
                console.log(`Successfully indexed ${moduleCount} custom modules from ${scanPath}.`);
                totalModules += moduleCount;
            } catch (err) {
                console.error(`Error scanning path ${scanPath}:`, err.message);
            }
        }
        console.log(`Total Odoo ${version} modules indexed: ${totalModules}`);
    }

    const outputPath = path.join(__dirname, 'modules_config.json');
    await fs.writeJson(outputPath, config, { spaces: 2 });
    console.log(`Updated modules config written to ${outputPath}`);
}

run().catch(err => {
    console.error('Auto-generator script failed:', err);
    process.exit(1);
});
