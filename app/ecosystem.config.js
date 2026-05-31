module.exports = {
    apps: [{
        name: "sass-portal",
        script: "npm",
        args: "start",
        env: {
            NODE_ENV: "production",

            // --- Application Config ---
            BASE_DIR: "/home/portal",

            // --- Nginx File Customization (Legacy/Fallback) ---
            // Still useful if API fails or for other custom configs
            NGINX_CONFIG_PATH: "/root/data/nginx/custom",
            NGINX_RELOAD_COMMAND: "docker exec nginxproxy nginx -s reload",

            // --- Nginx Proxy Manager API (REQUIRED for UI & SSL) ---
            NPM_HOST: "http://127.0.0.1:81",       // URL of your NPM (use http://172.17.0.1:81 if running in docker)
            NPM_EMAIL: "admin@example.com",        // CHANGE THIS
            NPM_PASSWORD: "changeme",              // CHANGE THIS

            // IP of THIS server (where potential Odoo containers run)
            // NPM will forward traffic to this IP + the Odoo Port
            NPM_FORWARD_HOST: "172.17.0.1"
        }
    }]
}
