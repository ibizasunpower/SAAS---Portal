/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, Database, Box, ArrowRight, Server, Globe, ExternalLink, HelpCircle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Tenant {
    company: string;
    domain: string;
    dbName: string;
    plan: '18' | '19';
    createdAt: string;
}

export default function OnboardingPage() {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [formData, setFormData] = useState({
        company: "",
        domain: "",
        plan: "19" as '18' | '19',
    });
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    const [domainError, setDomainError] = useState("");

    // Load tenants on mount
    const fetchTenants = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/provision");
            const data = await res.json();
            if (Array.isArray(data)) {
                setTenants(data);
            }
        } catch (err) {
            console.error("Failed to fetch tenants:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTenants();
    }, []);

    // Handle domain validation and input formatting
    const handleDomainChange = (val: string) => {
        const cleaned = val.toLowerCase().replace(/\s+/g, "-");
        setFormData({ ...formData, domain: cleaned });

        const domainRegex = /^[a-z0-9-]+$/;
        if (cleaned && !domainRegex.test(cleaned)) {
            setDomainError("Only lowercase letters, numbers, and hyphens are allowed");
        } else {
            setDomainError("");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (domainError) return;

        setSubmitLoading(true);
        setError("");
        setSuccessMsg("");

        try {
            const res = await fetch("/api/provision", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Workspace provisioning failed.");
            }

            setSuccessMsg(`Successfully provisioned database '${data.db}'! Redirecting to Odoo...`);
            
            // Refresh list
            await fetchTenants();
            
            // Redirect after brief delay
            setTimeout(() => {
                window.open(data.url, "_blank");
                setSuccessMsg("");
                setFormData({ company: "", domain: "", plan: "19" });
            }, 2500);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-50 p-6 md:p-12 font-sans selection:bg-indigo-600/30">
            <div className="max-w-7xl mx-auto space-y-10">
                {/* Header */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-zinc-900">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 bg-gradient-to-tr from-indigo-600 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/25 animate-pulse">
                            <Sparkles className="text-white" size={24} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-100 to-zinc-400">
                                SaaS Onboarding Plane
                            </h1>
                            <p className="text-zinc-400 text-sm mt-0.5">Provision template-based isolated tenant databases</p>
                        </div>
                    </div>
                    
                    <div className="flex gap-3">
                        <Link
                            href="/"
                            className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl font-medium transition-all border border-zinc-800/80 hover:border-zinc-700 shadow-sm"
                        >
                            Back to Core Dashboard
                        </Link>
                        <button
                            onClick={fetchTenants}
                            disabled={loading}
                            className="flex items-center justify-center p-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-xl transition-all border border-zinc-800/80"
                            title="Refresh database registry"
                        >
                            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Left Column: Form */}
                    <div className="lg:col-span-5 bg-zinc-900/40 border border-zinc-900 p-6 md:p-8 rounded-3xl backdrop-blur-md shadow-xl space-y-6">
                        <div>
                            <h2 className="text-xl font-bold text-white">Create New Workspace</h2>
                            <p className="text-zinc-400 text-xs mt-1">
                                Generates a secure, schema-populated database instance using pre-configured PostgreSQL templates.
                            </p>
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3.5 rounded-xl text-sm leading-relaxed animate-in fade-in duration-200">
                                <strong className="font-semibold block mb-0.5">Provisioning Error</strong>
                                {error}
                            </div>
                        )}

                        {successMsg && (
                            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3.5 rounded-xl text-sm leading-relaxed animate-in fade-in duration-200">
                                <strong className="font-semibold block mb-0.5">Success</strong>
                                {successMsg}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Company Name */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                                    <Server size={12} className="text-indigo-400" />
                                    Company / Workspace Name
                                </label>
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-zinc-950/80 border border-zinc-800/80 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-zinc-700 transition-all font-medium"
                                    placeholder="e.g. Acme Corporation"
                                    value={formData.company}
                                    onChange={e => setFormData({ ...formData, company: e.target.value })}
                                />
                            </div>

                            {/* Domain prefix */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                                    <Globe size={12} className="text-indigo-400" />
                                    Subdomain Prefix
                                </label>
                                <div className="relative flex items-center">
                                    <input
                                        type="text"
                                        required
                                        className={cn(
                                            "w-full bg-zinc-950/80 border rounded-xl pl-4 pr-32 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-zinc-700 transition-all font-mono text-sm",
                                            domainError ? "border-red-500/50 focus:ring-red-500" : "border-zinc-800/80"
                                        )}
                                        placeholder="acme-corp"
                                        value={formData.domain}
                                        onChange={e => handleDomainChange(e.target.value)}
                                    />
                                    <span className="absolute right-3 text-xs font-semibold text-zinc-500 pointer-events-none select-none bg-zinc-900 border border-zinc-800/60 px-2 py-1 rounded-lg">
                                        .odoo.saas
                                    </span>
                                </div>
                                {domainError ? (
                                    <p className="text-xs text-red-400 font-medium">{domainError}</p>
                                ) : (
                                    <p className="text-[11px] text-zinc-500 leading-normal">
                                        Lower-case letters, numbers, and hyphens only. Spaces are replaced by hyphens.
                                    </p>
                                )}
                            </div>

                            {/* Plan Selector */}
                            <div className="space-y-2.5">
                                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                                    <Box size={12} className="text-indigo-400" />
                                    Odoo Core Template
                                </label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, plan: "18" })}
                                        className={cn(
                                            "relative p-4 rounded-2xl border text-left transition-all hover:scale-[1.01]",
                                            formData.plan === "18"
                                                ? "bg-indigo-600/10 border-indigo-500/80 text-white shadow-lg shadow-indigo-500/5"
                                                : "bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-300"
                                        )}
                                    >
                                        <div className="text-xs text-zinc-400">Odoo 18.0</div>
                                        <div className="font-bold text-sm mt-1">Standard Stable</div>
                                        <div className="text-[10px] text-zinc-500 mt-2 font-mono">template18</div>
                                        {formData.plan === "18" && (
                                            <div className="absolute top-3 right-3 h-2 w-2 rounded-full bg-indigo-500" />
                                        )}
                                    </button>
                                    
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, plan: "19" })}
                                        className={cn(
                                            "relative p-4 rounded-2xl border text-left transition-all hover:scale-[1.01]",
                                            formData.plan === "19"
                                                ? "bg-purple-600/10 border-purple-500/80 text-white shadow-lg shadow-purple-500/5"
                                                : "bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-300"
                                        )}
                                    >
                                        <div className="text-xs text-zinc-400">Odoo 19.0</div>
                                        <div className="font-bold text-sm mt-1">Latest Release</div>
                                        <div className="text-[10px] text-zinc-500 mt-2 font-mono">template19</div>
                                        {formData.plan === "19" && (
                                            <div className="absolute top-3 right-3 h-2 w-2 rounded-full bg-purple-500" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={submitLoading || !!domainError}
                                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-3.5 px-6 rounded-2xl mt-6 transition-all hover:shadow-lg hover:shadow-indigo-500/25 flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed group"
                            >
                                {submitLoading ? (
                                    <>
                                        <RefreshCw className="animate-spin" size={18} />
                                        Cloning Postgres Template...
                                    </>
                                ) : (
                                    <>
                                        Create Workspace
                                        <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                                    </>
                                )}
                            </button>
                        </form>
                    </div>

                    {/* Right Column: Tenants list */}
                    <div className="lg:col-span-7 space-y-4">
                        <div className="flex justify-between items-center px-1">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
                                <Database className="text-indigo-400" size={20} />
                                Active Workspace Registry
                                <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                                    {tenants.length}
                                </span>
                            </h2>
                        </div>

                        <div className="bg-zinc-900/30 border border-zinc-900/80 rounded-3xl overflow-hidden shadow-xl">
                            {tenants.length === 0 ? (
                                <div className="p-16 text-center text-zinc-500 space-y-3">
                                    <div className="h-10 w-10 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center mx-auto text-zinc-600">
                                        <HelpCircle size={20} />
                                    </div>
                                    <p className="text-sm font-medium">No multi-tenant workspaces provisioned yet</p>
                                    <p className="text-xs text-zinc-600">Use the form on the left to clone templates.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm border-collapse">
                                        <thead className="bg-zinc-950/60 text-zinc-400 font-semibold border-b border-zinc-900/80">
                                            <tr>
                                                <th className="px-6 py-4">Company</th>
                                                <th className="px-6 py-4">Domain / DB Name</th>
                                                <th className="px-6 py-4">Engine</th>
                                                <th className="px-6 py-4 text-right">Access</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-900/60">
                                            {tenants.map((t, idx) => (
                                                <tr key={idx} className="group hover:bg-zinc-900/20 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="font-bold text-white leading-tight">{t.company}</div>
                                                        <div className="text-[10px] text-zinc-500 mt-0.5">
                                                            Created {new Date(t.createdAt).toLocaleDateString()}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 font-mono text-xs">
                                                        <div className="text-zinc-300 font-semibold">{t.domain}.odoo.saas</div>
                                                        <div className="text-zinc-500 text-[10px] mt-0.5">DB: {t.dbName}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={cn(
                                                            "px-2.5 py-0.5 rounded-full text-xs font-semibold border",
                                                            t.plan === '19' 
                                                                ? "bg-purple-900/10 text-purple-400 border-purple-900/30" 
                                                                : "bg-indigo-900/10 text-indigo-400 border-indigo-900/30"
                                                        )}>
                                                            v{t.plan}.0
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <a
                                                            href={`http://${window.location.hostname}:8069/web?db=${t.dbName}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-all hover:shadow-sm"
                                                        >
                                                            Open
                                                            <ExternalLink size={12} />
                                                        </a>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
