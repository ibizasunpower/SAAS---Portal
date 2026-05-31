import { NextResponse } from 'next/server';
import { tenantStore } from '@/lib/tenants';
import { logger } from '@/lib/logger';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

const PG_PASSWORD = process.env.PG_PASSWORD || 'Enter@123!';
const DB_CONTAINER = process.env.DB_CONTAINER || 'db';

export async function GET() {
    try {
        await logger.info('PROVISION', 'Fetching SaaS tenants list...');
        const tenants = await tenantStore.getTenants();
        return NextResponse.json(tenants);
    } catch (error: any) {
        await logger.error('PROVISION', 'Failed to fetch SaaS tenants', { error: error.message });
        return NextResponse.json({ error: 'Failed to fetch SaaS tenants' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { company, domain, plan } = body;

        // 1. Validations
        if (!company || !domain || !plan) {
            return NextResponse.json({ error: 'Missing required fields: company, domain, or plan' }, { status: 400 });
        }

        const trimmedDomain = domain.trim().toLowerCase();
        const trimmedCompany = company.trim();

        if (plan !== '18' && plan !== '19') {
            return NextResponse.json({ error: 'Invalid plan selected. Must be 18 or 19' }, { status: 400 });
        }

        // Validate domain (only lowercase alphanumeric and hyphens allowed)
        const domainRegex = /^[a-z0-9-]+$/;
        if (!domainRegex.test(trimmedDomain)) {
            return NextResponse.json({ error: 'Domain must contain only lowercase letters, numbers, and hyphens' }, { status: 400 });
        }

        // Postgres database name naming convention
        const safeDomainSuffix = trimmedDomain.replace(/-/g, '_');
        const dbName = `tenant_${safeDomainSuffix}`;

        await logger.info('PROVISION', `Starting SaaS database provisioning. Company: ${trimmedCompany}, DB: ${dbName}, Plan: Odoo ${plan}`);

        // 2. Collision Check in JSON store
        const tenants = await tenantStore.getTenants();
        const domainCollision = tenants.some(t => t.domain === trimmedDomain || t.dbName === dbName);
        if (domainCollision) {
            await logger.warn('PROVISION', `Tenant registration collision for domain: ${trimmedDomain}`);
            return NextResponse.json({ error: `Tenant domain '${trimmedDomain}' is already registered` }, { status: 409 });
        }

        // 3. Collision Check in PostgreSQL database
        try {
            const checkDbCmd = `docker exec -e PGPASSWORD=${PG_PASSWORD} ${DB_CONTAINER} psql -U odoo postgres -t -c "SELECT 1 FROM pg_database WHERE datname = '${dbName}';"`;
            const { stdout } = await execAsync(checkDbCmd);
            if (stdout.trim() === '1') {
                await logger.warn('PROVISION', `Postgres database collision: ${dbName} already exists`);
                return NextResponse.json({ error: `PostgreSQL database '${dbName}' already exists` }, { status: 409 });
            }
        } catch (checkErr: any) {
            // Log warning but proceed (it might fail if docker commands aren't supported locally on Windows host, but template creation will fail cleanly if so)
            await logger.warn('PROVISION', `PostgreSQL check database failed or container not ready: ${checkErr.message}`);
        }

        // 4. Determine template name
        const templateName = plan === '19' ? 'template19' : 'template18';

        // 5. Execute database creation using the template
        try {
            await logger.info('PROVISION', `Cloning database ${dbName} using template ${templateName}...`);
            const createDbCmd = `docker exec -e PGPASSWORD=${PG_PASSWORD} ${DB_CONTAINER} psql -U odoo postgres -c "CREATE DATABASE \\"${dbName}\\" TEMPLATE \\"${templateName}\\" OWNER odoo;"`;
            await execAsync(createDbCmd);
            await logger.info('PROVISION', `Database ${dbName} cloned successfully.`);
        } catch (createErr: any) {
            await logger.error('PROVISION', `PostgreSQL CREATE DATABASE failed`, { error: createErr.message });
            
            const errMsg = createErr.message || '';
            if (errMsg.includes('already exists')) {
                return NextResponse.json({ error: `Database '${dbName}' already exists in PostgreSQL` }, { status: 409 });
            }
            if (errMsg.includes('does not exist')) {
                return NextResponse.json({ error: `Template database '${templateName}' does not exist in PostgreSQL. Please create it first.` }, { status: 500 });
            }
            if (errMsg.includes('connection failed') || errMsg.includes('could not connect') || errMsg.includes('refused')) {
                return NextResponse.json({ error: "PostgreSQL connection failure: Could not connect to database container 'db'. Please ensure it is running." }, { status: 500 });
            }
            return NextResponse.json({ error: `Postgres database creation failed: ${createErr.message}` }, { status: 500 });
        }

        // 6. Save tenant state
        const newTenant = {
            company: trimmedCompany,
            domain: trimmedDomain,
            dbName: dbName,
            plan: plan as '18' | '19',
            createdAt: new Date().toISOString()
        };
        await tenantStore.addTenant(newTenant);

        // 7. Generate redirect URL
        const hostHeader = request.headers.get('host') || 'localhost';
        const serverHost = hostHeader.split(':')[0];
        const redirectUrl = `http://${serverHost}:8069/web?db=${dbName}`;

        await logger.info('PROVISION', `Onboarding completed for tenant ${dbName}. Redirecting to ${redirectUrl}`);

        return NextResponse.json({
            success: true,
            db: dbName,
            url: redirectUrl
        });

    } catch (error: any) {
        await logger.error('PROVISION', 'Provisioning handler crashed', { error: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
