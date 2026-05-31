# Stage 1: Build & Dependencies
FROM python:3.11-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive
ENV ODOO_VERSION=18.0

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    build-essential \
    libpq-dev \
    libldap2-dev \
    libsasl2-dev \
    libxml2-dev \
    libxslt1-dev \
    libjpeg-dev \
    zlib1g-dev \
    libfreetype6-dev \
    node-less \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /opt/odoo

# Create directories
RUN mkdir -p /opt/odoo/odoo \
    /opt/odoo/custom-addons \
    /opt/odoo/oca-addons

# Clone Odoo Core
RUN git clone --depth 1 -b ${ODOO_VERSION} https://github.com/odoo/odoo.git /opt/odoo/odoo

# Clone OCA Repositories
WORKDIR /opt/odoo/oca-addons
RUN git clone --depth 1 -b ${ODOO_VERSION} https://github.com/OCA/account-financial-tools.git && \
    git clone --depth 1 -b ${ODOO_VERSION} https://github.com/OCA/account-closing.git && \
    git clone --depth 1 -b ${ODOO_VERSION} https://github.com/OCA/bank-statement-import.git && \
    git clone --depth 1 -b ${ODOO_VERSION} https://github.com/OCA/sale-workflow.git && \
    git clone --depth 1 -b ${ODOO_VERSION} https://github.com/OCA/purchase-workflow.git && \
    git clone --depth 1 -b ${ODOO_VERSION} https://github.com/OCA/stock-logistics-workflow.git && \
    git clone --depth 1 -b ${ODOO_VERSION} https://github.com/OCA/project.git && \
    git clone --depth 1 -b ${ODOO_VERSION} https://github.com/OCA/timesheet.git && \
    git clone --depth 1 -b ${ODOO_VERSION} https://github.com/OCA/field-service.git && \
    git clone --depth 1 -b ${ODOO_VERSION} https://github.com/OCA/hr.git && \
    git clone --depth 1 -b ${ODOO_VERSION} https://github.com/OCA/payroll.git

# Create virtual environment
RUN python3 -m venv /opt/odoo/venv

# Install Python requirements
RUN /opt/odoo/venv/bin/pip install --no-cache-dir --upgrade pip wheel && \
    /opt/odoo/venv/bin/pip install --no-cache-dir -r /opt/odoo/odoo/requirements.txt

# Install OCA requirements if present
RUN find /opt/odoo/oca-addons -name "requirements.txt" -exec /opt/odoo/venv/bin/pip install --no-cache-dir -r {} \;

# Stage 2: Final Production Stage
FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/opt/odoo/venv/bin:$PATH"

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libldap-2.5-0 \
    libsasl2-2 \
    libxml2 \
    libxslt1.1 \
    libjpeg62-turbo \
    zlib1g \
    libfreetype6 \
    node-less \
    curl \
    postgresql-client \
    wkhtmltopdf \
    gettext-base \
    && rm -rf /var/lib/apt/lists/*

# Create odoo user
RUN useradd -m -d /opt/odoo -U -r -s /bin/bash odoo

# Set up directories
RUN mkdir -p /opt/odoo/odoo /opt/odoo/custom-addons /opt/odoo/oca-addons /var/lib/odoo /etc/odoo \
    && chown -R odoo:odoo /opt/odoo /var/lib/odoo /etc/odoo

# Copy from builder
COPY --from=builder --chown=odoo:odoo /opt/odoo /opt/odoo

WORKDIR /opt/odoo

# Copy entrypoint and conf template
COPY --chown=odoo:odoo entrypoint.sh /opt/odoo/entrypoint.sh
COPY --chown=odoo:odoo odoo.conf.template /etc/odoo/odoo.conf.template

RUN chmod +x /opt/odoo/entrypoint.sh

# Volumes
VOLUME ["/var/lib/odoo", "/opt/odoo/custom-addons"]

# Expose ports
EXPOSE 8069 8072

# Set user
USER odoo

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8069/web/health || exit 1

ENTRYPOINT ["/opt/odoo/entrypoint.sh"]
CMD ["odoo"]
