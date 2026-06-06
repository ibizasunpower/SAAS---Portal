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
            // 1. ODOO CE CORE (BASE INSTALL)
            'base',
            'web',
            'mail',
            'portal',
            'digest',
            'account',
            'account_accountant',
            'analytic',
            'account_reports',
            'sale_management',
            'sale_stock',
            'purchase',
            'stock',
            'product',
            'uom',
            'contacts',
            'calendar',
            'hr',
            'report',

            // 3. ACCOUNTING CORE (ENTERPRISE-LEVEL FINANCE)
            'account_usability',
            'account_financial_report',
            'account_financial_report_qweb',
            'account_general_ledger',
            'account_trial_balance',
            'account_lock_to_date',
            'account_journal_lock_date',
            'account_invoice_check_total',
            'account_move_line_reconcile_manual',
            'account_fiscal_position_vat_check',
            'account_cutoff_accrual_picking',

            // 4. RECONCILIATION SYSTEM
            'account_reconcile_oca',
            'account_reconcile_wizard',
            'account_reconcile_model_oca',
            'account_partner_reconcile',
            'bank_statement_reconcile',
            'account_statement_base',

            // 5. BANKING + PAYMENTS
            'account_payment',
            'account_payment_mode',
            'account_payment_partner',
            'account_bank_statement_import_file',
            'account_bank_statement_import_csv',
            'account_bank_statement_import_xlsx',
            'account_bank_statement_import_camt',
            'account_move_base_import',
            'account_bank_statement_import_online',

            // 6. PROCUREMENT + 3-WAY MATCH FOUNDATION
            'purchase_stock',
            'stock_account',
            'purchase_stock_picking_invoice_link',
            'purchase_order_line_price_history',
            'purchase_allowed_product',

            // 7. INVENTORY + STOCK ENHANCEMENTS
            'stock_picking_batch',
            'stock_move_line_auto_fill',
            'stock_valuation_layer_revaluation',
            'stock_demand_estimate',
            'stock_available',

            // 8. FINANCIAL REPORTING + BI
            'mis_builder',
            'mis_builder_budget',

            // 9. SPAIN LOCALIZATION + AEAT COMPLIANCE
            'l10n_es',
            'l10n_es_aeat_mod303',
            'l10n_es_aeat_mod347',
            'l10n_es_aeat_mod390',
            'l10n_es_aeat_sii',
            'l10n_es_vat_book',
            'l10n_es_partner',
            'l10n_es_account_asset',

            // 10. ACCOUNTING RULES + CONTROL LAYER
            'account_analytic_required',
            'account_analytic_distribution',

            // 11. UX + WEB IMPROVEMENTS
            'web_responsive',
            'web_dialog_size',
            'web_m2x_options',
            'web_no_bubble',
            'web_refresher'
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
