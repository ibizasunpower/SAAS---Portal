#!/bin/bash
set -e

# Default env vars if not set
export DB_HOST=${DB_HOST:-db}
export DB_PORT=${DB_PORT:-5432}
export DB_USER=${DB_USER:-odoo}
export DB_PASSWORD=${DB_PASSWORD:-odoo}
export DB_NAME=${DB_NAME:-odoo}
export ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin}
export WORKERS=${WORKERS:-auto}
export MAX_CRON_THREADS=${MAX_CRON_THREADS:-2}
export LIST_DB=${LIST_DB:-False}

# Auto-calculate workers if set to auto (number of CPUs * 2 + 1)
if [ "$WORKERS" = "auto" ]; then
    CPUS=$(nproc)
    export WORKERS=$((CPUS * 2 + 1))
fi

# Build OCA addons path
OCA_PATHS=$(find /opt/odoo/oca-addons -mindepth 1 -maxdepth 1 -type d | paste -sd "," -)
if [ -n "$OCA_PATHS" ]; then
    export OCA_ADDONS_PATHS=",$OCA_PATHS"
else
    export OCA_ADDONS_PATHS=""
fi

# Substitute vars in odoo.conf
envsubst < /etc/odoo/odoo.conf.template > /etc/odoo/odoo.conf

export PGPASSWORD="$DB_PASSWORD"

# Wait for DB to be ready
echo "Waiting for PostgreSQL at $DB_HOST:$DB_PORT..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER"; do
    sleep 2
done
echo "PostgreSQL is ready!"

# Odoo check initialization
ODOO_CMD="/opt/odoo/venv/bin/python3 /opt/odoo/odoo/odoo-bin -c /etc/odoo/odoo.conf"

DB_EXISTS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -wq "$DB_NAME" && echo "yes" || echo "no")

if [ "$DB_EXISTS" = "no" ]; then
    echo "Database $DB_NAME does not exist. The application will create it."
    createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" || true
    
    INIT_MODS=${INIT_MODULES:-base}
    echo "Initializing database with modules: $INIT_MODS"
    ODOO_CMD="$ODOO_CMD -d $DB_NAME -i $INIT_MODS"
else
    echo "Database $DB_NAME exists."
    if [ -n "$UPDATE_MODULES" ]; then
        echo "Updating modules: $UPDATE_MODULES"
        ODOO_CMD="$ODOO_CMD -d $DB_NAME -u $UPDATE_MODULES"
    fi
fi

if [ "$1" = "odoo" ]; then
    echo "Starting Odoo..."
    exec $ODOO_CMD
else
    exec "$@"
fi
