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
            // UX / Modern Interface & Productivity
            'web_responsive',
            'web_environment_ribbon',
            'web_dialog_size',
            'web_notify',
            'web_sheet_full_width',
            'web_tree_dynamic_colored_field',
            'web_ir_actions_act_view_reload',
            'web_company_color',

            // Accounting
            'account_financial_report',
            'account_general_ledger',
            'account_trial_balance',
            'account_tax_balance',
            'account_partner_ledger',
            'account_asset_management',
            'account_invoice_auto_send_by_email',
            'account_move_base_import',
            'account_invoice_report_grouped_by_picking',
            'account_payment_order',
            'account_payment_mode',
            'account_payment_partner',
            'account_reconcile_model_oca',
            'account_statement_import',
            'account_statement_import_ofx',
            'account_statement_import_qif',
            'account_statement_import_camt',
            'account_statement_import_mt940',
            'account_bank_statement_import_helper',
            'account_lock_date_update',
            'account_fiscal_year',
            'account_journal_lock_date',

            // Sales
            'sale_order_type',
            'sale_automatic_workflow',
            'sale_automatic_workflow_stock',
            'sale_automatic_workflow_job',
            'sale_exception',
            'sale_global_discount',
            'sale_discount_display_amount',
            'sale_fixed_discount',
            'sale_invoice_policy',
            'sale_invoice_frequency',
            'sale_order_archive',
            'sale_order_priority',
            'sale_stock_cancel_restriction',
            'sale_delivery_state',
            'sale_tier_validation',

            // CRM
            'crm_lead_code',
            'crm_lead_firstname',
            'crm_claim',
            'crm_partner_assign',
            'crm_stage_probability',
            'crm_industry',
            'crm_tag',
            'crm_location',

            // Purchasing
            'purchase_request',
            'purchase_request_tier_validation',
            'purchase_order_type',
            'purchase_exception',
            'purchase_cancel_reason',
            'purchase_open_qty',
            'purchase_stock_manual_currency',
            'purchase_reception_status',

            // Inventory & Warehouse
            'stock_picking_batch_extended',
            'stock_picking_invoice_link',
            'stock_move_line_qty_picked',
            'stock_no_negative',
            'stock_inventory_discrepancy',
            'stock_cycle_count',
            'stock_location_children',
            'stock_picking_back2draft',
            'stock_available',
            'stock_available_unreserved',
            'stock_available_immediately',
            'stock_quant_cost_info',
            'stock_demand_estimate',
            'stock_barcode',
            'stock_barcode_mobile',

            // Manufacturing
            'mrp_bom_hierarchy',
            'mrp_bom_structure_report',
            'mrp_multi_level',
            'mrp_production_back_to_draft',
            'mrp_production_split',
            'mrp_unbuild_tracked_raw_material',
            'mrp_workorder_lock_planning',
            'mrp_lot_number_propagation',
            'quality_control',
            'quality_control_stock',
            'quality_control_mrp',

            // Project
            'project_task_default_stage',
            'project_task_parent_completion_blocking',
            'project_task_stage_state',
            'project_task_code',
            'project_task_dependency',
            'project_timesheet_time_control',
            'project_role',
            'project_category',
            'project_template',

            // Helpdesk
            'helpdesk_mgmt',
            'helpdesk_mgmt_sla',
            'helpdesk_mgmt_project',
            'helpdesk_mgmt_rating',
            'helpdesk_mgmt_sale',
            'helpdesk_type',

            // Field Service
            'fieldservice',
            'fieldservice_agreement',
            'fieldservice_calendar',
            'fieldservice_crm',
            'fieldservice_equipment',
            'fieldservice_project',
            'fieldservice_route',
            'fieldservice_sale',
            'fieldservice_stock',
            'fieldservice_vehicle',

            // HR
            'hr_employee_age',
            'hr_employee_service',
            'hr_employee_language',
            'hr_contract_reference',
            'hr_skill',
            'hr_department_code',
            'hr_attendance_reason',
            'hr_holidays_public',
            'hr_holidays_public_city',
            'hr_expense_invoice',

            // Recruitment
            'hr_recruitment',
            'hr_recruitment_stage',
            'hr_recruitment_survey',

            // Maintenance
            'maintenance_equipment_sequence',
            'maintenance_plan',
            'maintenance_request_purchase',
            'maintenance_project',

            // Subscription Management
            'contract',
            'contract_sale',
            'contract_invoice_start_end_dates',
            'contract_variable_quantity',
            'contract_payment_mode',
            'contract_mandate',

            // Documents / DMS
            'dms',
            'dms_field',
            'dms_mail',
            'dms_user_role',
            'dms_auto_classification',
            'dms_attachment_link',

            // Website
            'website_snippet_anchor',
            'website_menu_by_user_status',
            'website_cookie_notice',
            'website_legal_page',
            'website_seo_redirection',
            'website_mega_menu',
            'website_event_filter_city',

            // eCommerce
            'website_sale_stock_available',
            'website_sale_product_attachment',
            'website_sale_product_brand',
            'website_sale_wishlist_keep',
            'website_sale_secondary_unit',
            'website_sale_hide_price',
            'website_sale_comparison_wishlist',

            // Marketing
            'mass_mailing_partner',
            'mass_mailing_contact',
            'mail_tracking',
            'mail_activity_board',
            'mail_activity_done',
            'mail_optional_autofollow',
            'mail_debrand',

            // Knowledge Base
            'knowledge',
            'knowledge_article',
            'knowledge_base',

            // Electronic Signature
            'sign_oca',
            'document_sign',

            // Calendar & Appointments
            'calendar_resource',
            'calendar_export_ics',
            'resource_booking',

            // Reporting
            'bi_sql_editor',
            'report_xlsx',
            'report_csv',
            'report_xml',
            'report_pdf_zip_download',

            // Security & Administration
            'auditlog',
            'auth_admin_passkey',
            'auth_jwt',
            'auth_session_timeout',
            'password_security',
            'base_user_role',
            'base_tier_validation',
            'base_technical_user',
            'base_exception',
            'base_import_match',

            // SaaS Platform Essentials
            'queue_job',
            'queue_job_cron',
            'base_rest',
            'component',
            'connector',
            'connector_base_product',
            'server_action_mass_edit',
            'server_env'
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
