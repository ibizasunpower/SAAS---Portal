/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Server, Globe, Box, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeploymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function DeploymentModal({ isOpen, onClose, onSuccess }: DeploymentModalProps) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        clientName: "",
        version: "19", // Default to latest
        domain: "",
    });
    const [categories, setCategories] = useState<any[]>([]);
    const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
    const [selectedModules, setSelectedModules] = useState<string[]>([]);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!isOpen) return;
        const fetchCategories = async () => {
            try {
                const res = await fetch("/api/module-plans");
                if (res.ok) {
                    const data = await res.json();
                    setCategories(data);
                }
            } catch (err) {
                console.error("Failed to fetch module categories:", err);
            }
        };
        fetchCategories();
    }, [isOpen]);

    if (!isOpen) return null;

    const toggleExpand = (categoryId: string) => {
        setExpandedCategories(prev => 
            prev.includes(categoryId)
                ? prev.filter(id => id !== categoryId)
                : [...prev, categoryId]
        );
    };

    const handleCategoryChange = (cat: any) => {
        const moduleIds = cat.modules.map((m: any) => m.id);
        const allSelected = moduleIds.every((id: string) => selectedModules.includes(id));
        
        if (allSelected) {
            // Deselect all
            setSelectedModules(prev => prev.filter(id => !moduleIds.includes(id)));
        } else {
            // Select all
            setSelectedModules(prev => Array.from(new Set([...prev, ...moduleIds])));
        }
    };

    const handleModuleChange = (moduleId: string) => {
        setSelectedModules(prev => 
            prev.includes(moduleId)
                ? prev.filter(id => id !== moduleId)
                : [...prev, moduleId]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/deploy", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...formData,
                    selected_modules: selectedModules
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Deployment failed");

            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute right-4 top-4 text-zinc-500 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-white mb-2">Deploy Odoo Instance</h2>
                    <p className="text-zinc-400 text-sm">Create a new Odoo environment for your client.</p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-lg text-sm mb-4">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                            <Server size={14} /> Client Name
                        </label>
                        <input
                            type="text"
                            required
                            pattern="[a-z0-9-]+"
                            title="Lowercase letters, numbers and hyphens only"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-600 transition-all"
                            placeholder="e.g. client-acme-corp"
                            value={formData.clientName}
                            onChange={e => setFormData({ ...formData, clientName: e.target.value })}
                        />
                        <p className="text-xs text-zinc-500">Will be used for directory and container names.</p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                            <Box size={14} /> Odoo Version
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, version: "18" })}
                                className={cn(
                                    "py-3 px-4 rounded-lg border text-sm font-medium transition-all",
                                    formData.version === "18"
                                        ? "bg-blue-500/10 border-blue-500 text-blue-500"
                                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                                )}
                            >
                                Odoo 18.0
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, version: "19" })}
                                className={cn(
                                    "py-3 px-4 rounded-lg border text-sm font-medium transition-all",
                                    formData.version === "19"
                                        ? "bg-purple-500/10 border-purple-500 text-purple-500"
                                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                                )}
                            >
                                Odoo 19.0
                            </button>
                        </div>
                    </div>

                    {categories.length > 0 && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                                <Box size={14} /> Pre-installed Modules (Custom selection)
                            </label>
                            <div className="space-y-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3 max-h-60 overflow-y-auto">
                                {categories.map(cat => {
                                    const moduleIds = cat.modules ? cat.modules.map((m: any) => m.id) : [];
                                    const isExpanded = expandedCategories.includes(cat.id);
                                    const allSelected = moduleIds.length > 0 && moduleIds.every((id: string) => selectedModules.includes(id));
                                    const someSelected = !allSelected && moduleIds.some((id: string) => selectedModules.includes(id));

                                    return (
                                        <div key={cat.id} className="space-y-1.5 border-b border-zinc-800 last:border-0 pb-2.5 last:pb-0">
                                            <div className="flex items-center justify-between">
                                                <label className="flex items-start gap-3 cursor-pointer group py-0.5">
                                                    <input
                                                        type="checkbox"
                                                        className={cn(
                                                            "mt-1 rounded border-zinc-700 bg-zinc-950 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-950 h-4 w-4",
                                                            someSelected && "opacity-60"
                                                        )}
                                                        checked={allSelected}
                                                        onChange={() => handleCategoryChange(cat)}
                                                    />
                                                    <div>
                                                        <div className="text-xs font-semibold text-zinc-200 group-hover:text-white transition-colors">{cat.name}</div>
                                                        {cat.description && (
                                                            <div className="text-[10px] text-zinc-500">{cat.description}</div>
                                                        )}
                                                    </div>
                                                </label>
                                                
                                                {moduleIds.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleExpand(cat.id)}
                                                        className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors flex items-center gap-1 text-[10px]"
                                                    >
                                                        {isExpanded ? (
                                                            <>Hide ({moduleIds.length}) <ChevronDown size={14} /></>
                                                        ) : (
                                                            <>Show ({moduleIds.length}) <ChevronRight size={14} /></>
                                                        )}
                                                    </button>
                                                )}
                                            </div>

                                            {isExpanded && cat.modules && (
                                                <div className="pl-7 grid grid-cols-1 gap-2 pt-1.5 border-l border-zinc-800 ml-2 animate-in slide-in-from-top-1 duration-150">
                                                    {cat.modules.map((mod: any) => (
                                                        <label key={mod.id} className="flex items-center gap-2.5 cursor-pointer group py-0.5">
                                                            <input
                                                                type="checkbox"
                                                                className="rounded border-zinc-800 bg-zinc-950 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-950 h-3.5 w-3.5"
                                                                checked={selectedModules.includes(mod.id)}
                                                                onChange={() => handleModuleChange(mod.id)}
                                                            />
                                                            <span className="text-[11px] text-zinc-400 group-hover:text-zinc-200 transition-colors font-medium">
                                                                {mod.name} <span className="text-[9px] text-zinc-650 font-mono">({mod.id})</span>
                                                            </span>
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                            <Globe size={14} /> Domain
                        </label>
                        <input
                            type="text"
                            required
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-600 transition-all"
                            placeholder="e.g. odoo.acme.com"
                            value={formData.domain}
                            onChange={e => setFormData({ ...formData, domain: e.target.value })}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-white text-black font-bold py-3 rounded-lg mt-6 hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : "Deploy Instance"}
                    </button>
                </form>
            </div>
        </div>
    );
}
