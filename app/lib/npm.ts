/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios';

const NPM_HOST = process.env.NPM_HOST; // e.g., http://127.0.0.1:81
const NPM_EMAIL = process.env.NPM_EMAIL;
const NPM_PASSWORD = process.env.NPM_PASSWORD;

export class NpmClient {
    private token: string | null = null;

    constructor() {
        if (!NPM_HOST || !NPM_EMAIL || !NPM_PASSWORD) {
            console.warn("NPM credentials not configured. API integration disabled.");
        }
    }

    private async getToken() {
        if (this.token) return this.token;

        if (!NPM_HOST || !NPM_EMAIL || !NPM_PASSWORD) return null;

        try {
            const res = await axios.post(`${NPM_HOST}/api/tokens`, {
                identity: NPM_EMAIL,
                secret: NPM_PASSWORD
            });
            this.token = res.data.token;
            return this.token;
        } catch (error: any) {
            console.error("NPM Auth Failed:", error.message);
            throw new Error("Failed to authenticate with Nginx Proxy Manager");
        }
    }

    async createProxyHost(domain: string, forwardHost: string, forwardPort: number) {
        const token = await this.getToken();
        if (!token) return null;

        try {
            // Check if exists first to avoid duplicate errors? NPM might handle it or error.
            // Let's just try to create.
            const res = await axios.post(`${NPM_HOST}/api/nginx/proxy-hosts`, {
                domain_names: [domain],
                forward_scheme: "http",
                forward_host: forwardHost,
                forward_port: forwardPort,
                access_list_id: 0,
                certificate_id: 0, // No SSL by default, user can enable in UI or we can add logic later
                ssl_forced: false,
                meta: {
                    letsencrypt_agree: false,
                    dns_challenge: false
                },
                advanced_config: `client_max_body_size 200m;\n\nproxy_read_timeout 720s;\nproxy_connect_timeout 720s;\nproxy_send_timeout 720s;\n\nproxy_set_header Host $host;\nproxy_set_header X-Real-IP $remote_addr;\nproxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\nproxy_set_header X-Forwarded-Proto $scheme;\n\n# Websocket support (important for Odoo chatter / notifications)\nproxy_set_header Upgrade $http_upgrade;\nproxy_set_header Connection "upgrade";`,
                locations: [],
                block_exploits: true,
                caching_enabled: false,
                allow_websocket_upgrade: true,
                http2_support: false,
                hsts_enabled: false,
                hsts_subdomains: false
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            return res.data; // Returns the created object, including 'id'
        } catch (error: any) {
            console.error(`NPM Create Host Failed for ${domain}:`, error.response?.data || error.message);
            throw new Error(`Failed to create proxy host: ${error.message}`);
        }
    }

    async deleteProxyHost(id: number) {
        const token = await this.getToken();
        if (!token) return false;

        try {
            await axios.delete(`${NPM_HOST}/api/nginx/proxy-hosts/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return true;
        } catch (error: any) {
            console.error(`NPM Delete Host ${id} Failed:`, error.message);
            // If 404, assume already deleted
            if (error.response?.status === 404) return true;
            return false;
        }
    }

    // Helper to find host by domain if we don't have ID
    async getProxyHostIdByDomain(domain: string): Promise<number | null> {
        const token = await this.getToken();
        if (!token) return null;

        try {
            const res = await axios.get(`${NPM_HOST}/api/nginx/proxy-hosts`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const hosts = res.data;
            const match = hosts.find((h: any) => h.domain_names.includes(domain));
            return match ? match.id : null;
        } catch (error: any) {
            console.error("NPM List Hosts Failed:", error.message);
            return null;
        }
    }
}

export const npmClient = new NpmClient();
