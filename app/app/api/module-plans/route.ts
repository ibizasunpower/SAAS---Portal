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
        const ocaEssentialsModules: any[] = [];
        const ocaEssentialsSet = new Set<string>();

        const OCA_ESSENTIAL_IDS = new Set([
            // UX / Modern Interface
            'web_responsive',
            'web_dialog_size',
            'web_search_with_selection',
            'web_advanced_search',
            'web_grid',
            'web_timeline',
            
            // Accounting (to match Enterprise Accounting features)
            'account_financial_report',
            'account_asset_management',
            'account_statement_import',
            'account_statement_import_txt',
            'account_statement_import_csv',
            'account_statement_import_camt',
            'account_payment_order',
            'account_payment_mode',
            'account_payment_partner',
            
            // Subscriptions & Recurring
            'contract',
            'contract_sale',
            'contract_payment_mode',
            
            // Helpdesk / Support
            'helpdesk_mgmt',
            'helpdesk_mgmt_project',
            'helpdesk_mgmt_timesheet',
            
            // DMS & Documents
            'dms',
            'dms_fieldservice',
            
            // Project timelines
            'project_timeline',
            
            // Useful utilities
            'excel_import_export',
            'base_custom_filter',
            'attachment_queue',
        ]);

        // Find matches across all scanned categories
        Object.keys(versionConfig).forEach(key => {
            const mods = versionConfig[key].modules || [];
            mods.forEach((mod: any) => {
                if (OCA_ESSENTIAL_IDS.has(mod.id) && !ocaEssentialsSet.has(mod.id)) {
                    ocaEssentialsModules.push({ ...mod });
                    ocaEssentialsSet.add(mod.id);
                }
            });
        });

        // Return categories formatted for checkboxes (id, name, description, modules)
        const categories = Object.keys(versionConfig).map(key => ({
            id: key,
            name: versionConfig[key].name,
            description: versionConfig[key].description,
            modules: versionConfig[key].modules || []
        }));

        if (ocaEssentialsModules.length > 0) {
            categories.unshift({
                id: 'oca_essentials',
                name: '★ OCA Essentials',
                description: 'Crucial OCA modules to replicate Odoo Enterprise functionality (Responsive Mobile UI, Full Accounting Reports, Helpdesk, Contracts, DMS, etc.).',
                modules: ocaEssentialsModules
            });
        }

        return NextResponse.json(categories);
    } catch (error: any) {
        return NextResponse.json({ error: 'Failed to fetch module plans: ' + error.message }, { status: 500 });
    }
}
