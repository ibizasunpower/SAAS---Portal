# Odoo 18 CE Multi-Tenant SaaS Template

This repository template provides a production-ready, lightweight Docker deployment for an Odoo 18 Community Edition instance. It is custom-built with pre-installed OCA modules and tailored for a multi-tenant SaaS environment.

## Features

- **Python 3.11 Slim Base** instead of a heavy Odoo image
- **OCA Repositories Included** for advanced accounting, sales, inventory, projects, and HR management.
- **Dynamic Configuration** via `entrypoint.sh` overriding `odoo.conf` dynamically.
- **Multi-Tenant Ready** via `dbfilter`.
- **Pre-configured Proxy Mode & Ports** for Traefik/Nginx reverse proxy scenarios.
- **Automated Init & Validation** ensuring Postgres check loops and optional module updates and installations mapping to environments.

## Environment Variables Configuration

- `DB_HOST`: Hostname of the PostgreSQL database (default: `db`)
- `DB_PORT`: Port of the PostgreSQL database (default: `5432`)
- `DB_USER`: PostgreSQL user (default: `odoo`)
- `DB_PASSWORD`: PostgreSQL password (default: `odoo`)
- `DB_NAME`: Exact database name for this tenant. Strongly maps `dbfilter = ^${DB_NAME}$`. (default: `odoo`)
- `ADMIN_PASSWORD`: Master administration password for resetting backups and configuration keys.
- `WORKERS`: Number of Odoo web workers serving proxy mode. Set to `auto` to use `(CPUs * 2 + 1)`.
- `MAX_CRON_THREADS`: Dedicated background job thread pool. (default: `2`)
- `LIST_DB`: Defines whether the `/web/database/manager` allows visible listing of underlying schema components. Should frequently be `False`.
- `INIT_MODULES`: Comma-separated list of modules to install upon container boot **if the provisioned database is initially empty**. Default evaluates to mapping `base`.
- `UPDATE_MODULES`: Optionally apply mass migrations automatically by replacing with `base`, `all`, or target modules, executed solely on warm restarts / redeployments.

## Getting Started

1. Place external modules in `./custom-addons`.
2. Generate your isolated container definitions using the `docker-compose.yml` baseline.
3. Bring the isolated deployment up:

```bash
docker-compose up -d --build
```
