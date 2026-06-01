/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef } from "react";
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
    const [logs, setLogs] = useState<any[]>([]);
    
    const logContainerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to the bottom of the logs container
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    useEffect(() => {
        if (!isOpen) return;
        const fetchCategories = async () => {
            try {
                const res = await fetch(`/api/module-plans?version=${formData.version}`);
                if (res.ok) {
                    const data = await res.json();
                    setCategories(data);
                }
            } catch (err) {
                console.error("Failed to fetch module categories:", err);
            }
        };
        fetchCategories();
        // Clear selected modules and expanded state when version changes to avoid mismatch
        setSelectedModules([]);
        setExpandedCategories([]);
        setLogs([]);
    }, [isOpen, formData.version]);

    if (!isOpen) return null;

    const toggleExpand = (categoryId: string) => {
        if (loading) return;
        setExpandedCategories(prev => 
            prev.includes(categoryId)
                ? prev.filter(id => id !== categoryId)
                : [...prev, categoryId]
        );
    };

    const handleCategoryChange = (cat: any) => {
        if (loading) return;
        const moduleIds = cat.modules ? cat.modules.map((m: any) => m.id) : [];
        const allSelected = moduleIds.length > 0 && moduleIds.every((id: string) => selectedModules.includes(id));
        
        if (allSelected) {
            // Deselect all
            setSelectedModules(prev => prev.filter(id => !moduleIds.includes(id)));
        } else {
            // Select all
            setSelectedModules(prev => Array.from(new Set([...prev, ...moduleIds])));
        }
    };

    const handleModuleChange = (moduleId: string) => {
        if (loading) return;
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
        setLogs([]);

        try {
            const res = await fetch("/api/deploy", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...formData,
                    selected_modules: selectedModules
                }),
            });

            // If response is not a stream (e.g. validation crash)
            if (!res.ok) {
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const data = await res.json();
                    throw new Error(data.error || "Deployment initiation failed");
                } else {
                    throw new Error(`Deployment failed with status ${res.status}`);
                }
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error("Deployment output stream is not readable");

            const decoder = new TextDecoder();
            let partialLine = "";

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = (partialLine + chunk).split("\n");
                partialLine = lines.pop() || ""; // save the incomplete line

                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const logObj = JSON.parse(line);
                            setLogs(prev => [...prev, logObj]);

                            if (logObj.type === "success") {
                                setLoading(false);
                                // Short delay to let user realize it succeeded
                                setTimeout(() => {
                                    onSuccess();
                                    onClose();
                                }, 2000);
                            } else if (logObj.type === "error") {
                                setError(logObj.message);
                                setLoading(false);
                            }
                        } catch (parseErr) {
                            console.error("Failed to parse log line JSON:", line, parseErr);
                            // Fallback raw text log
                            setLogs(prev => [...prev, { type: "stdout", message: line, timestamp: new Date().toISOString() }]);
                        }
                    }
                }
            }
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-5xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    disabled={loading}
                    className="absolute right-4 top-4 text-zinc-500 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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

                <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Column (Inputs) */}
                    <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                                    <Server size={14} /> Client Name
                                </label>
                                <input
                                    type="text"
                                    required
                                    disabled={loading}
                                    pattern="[a-z0-9-]+"
                                    title="Lowercase letters, numbers and hyphens only"
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-650 transition-all disabled:opacity-55 disabled:cursor-not-allowed"
                                    placeholder="e.g. client-acme-corp"
                                    value={formData.clientName}
                                    onChange={e => setFormData({ ...formData, clientName: e.target.value })}
                                />
                                <p className="text-xs text-zinc-555">Will be used for directory and container names.</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                                    <Box size={14} /> Odoo Version
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        disabled={loading}
                                        onClick={() => setFormData({ ...formData, version: "18" })}
                                        className={cn(
                                            "py-3 px-4 rounded-lg border text-sm font-medium transition-all disabled:opacity-55 disabled:cursor-not-allowed",
                                            formData.version === "18"
                                                ? "bg-blue-500/10 border-blue-500 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                                                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                                        )}
                                    >
                                        Odoo 18.0
                                    </button>
                                    <button
                                        type="button"
                                        disabled={loading}
                                        onClick={() => setFormData({ ...formData, version: "19" })}
                                        className={cn(
                                            "py-3 px-4 rounded-lg border text-sm font-medium transition-all disabled:opacity-55 disabled:cursor-not-allowed",
                                            formData.version === "19"
                                                ? "bg-purple-500/10 border-purple-500 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.1)]"
                                                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                                        )}
                                    >
                                        Odoo 19.0
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                                    <Globe size={14} /> Domain
                                </label>
                                <input
                                    type="text"
                                    required
                                    disabled={loading}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-650 transition-all disabled:opacity-55 disabled:cursor-not-allowed"
                                    placeholder="e.g. odoo.acme.com"
                                    value={formData.domain}
                                    onChange={e => setFormData({ ...formData, domain: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="pt-4 border-t border-zinc-800/80 mt-4">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-white text-black font-bold py-3 rounded-lg hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="animate-spin" size={18} />
                                        Deploying Instance...
                                    </>
                                ) : (
                                    "Deploy Instance"
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Right Column (Modules Checklist) */}
                    <div className="lg:col-span-7 flex flex-col min-h-[300px]">
                        <div className="space-y-2 flex flex-col h-full">
                            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                                <Box size={14} /> Pre-installed Modules (Custom selection)
                            </label>
                            {categories.length > 0 ? (
                                <div className="space-y-3 bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex-grow overflow-y-auto max-h-[380px] min-h-[300px]">
                                    {categories.map(cat => {
                                        const moduleIds = cat.modules ? cat.modules.map((m: any) => m.id) : [];
                                        const isExpanded = expandedCategories.includes(cat.id);
                                        const allSelected = moduleIds.length > 0 && moduleIds.every((id: string) => selectedModules.includes(id));
                                        const someSelected = !allSelected && moduleIds.some((id: string) => selectedModules.includes(id));

                                        return (
                                            <div key={cat.id} className="space-y-1.5 border-b border-zinc-850 last:border-0 pb-3 last:pb-0">
                                                <div className="flex items-center justify-between">
                                                    <label className="flex items-start gap-3 cursor-pointer group py-0.5 select-none">
                                                        <input
                                                            type="checkbox"
                                                            disabled={loading}
                                                            className={cn(
                                                                "mt-1 rounded border-zinc-700 bg-zinc-950 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-950 h-4 w-4 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                                                                someSelected && "opacity-60"
                                                            )}
                                                            checked={allSelected}
                                                            onChange={() => handleCategoryChange(cat)}
                                                        />
                                                        <div>
                                                            <div className="text-xs font-semibold text-zinc-200 group-hover:text-white transition-colors">{cat.name}</div>
                                                            {cat.description && (
                                                                <div className="text-[10px] text-zinc-400">{cat.description}</div>
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
                                                            <label key={mod.id} className="flex items-center gap-2.5 cursor-pointer group py-0.5 select-none">
                                                                <input
                                                                    type="checkbox"
                                                                    disabled={loading}
                                                                    className="rounded border-zinc-800 bg-zinc-950 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-950 h-3.5 w-3.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    checked={selectedModules.includes(mod.id)}
                                                                    onChange={() => handleModuleChange(mod.id)}
                                                                />
                                                                <span className="text-[11px] text-zinc-400 group-hover:text-zinc-200 transition-colors font-medium">
                                                                    {mod.name} <span className="text-[9px] text-zinc-500 font-mono">({mod.id})</span>
                                                                </span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center flex-grow border border-zinc-800 border-dashed rounded-lg p-6 bg-zinc-900/50 text-zinc-500 min-h-[300px]">
                                    <Loader2 className="animate-spin mb-2" size={24} />
                                    <span className="text-xs">No custom modules found for Odoo {formData.version}.0</span>
                                </div>
                            )}
                        </div>
                    </div>
                </form>

                {/* Live Console Logs positioned at the bottom end of the deployment window */}
                {(loading || logs.length > 0) && (
                    <div className="mt-6 border-t border-zinc-800/80 pt-4 space-y-2 animate-in slide-in-from-bottom-2 duration-300">
                        <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
                            <span className="flex items-center gap-1.5">
                                <span className={cn(
                                    "h-2 w-2 rounded-full",
                                    loading ? "bg-blue-500 animate-pulse" : (error ? "bg-red-500" : "bg-emerald-500")
                                )}></span>
                                {loading ? "Streaming Live Deployment logs..." : (error ? "Deployment Failed" : "Deployment Completed")}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-500">
                                {logs.length} lines captured
                            </span>
                        </div>
                        <div 
                            ref={logContainerRef}
                            className="bg-zinc-950 border border-zinc-900 rounded-lg p-3 h-48 overflow-y-auto font-mono text-[10px] text-zinc-300 space-y-1 selection:bg-zinc-800 scrollbar-thin"
                        >
                            {logs.map((log, idx) => (
                                <div 
                                    key={idx} 
                                    className={cn(
                                        "flex items-start gap-2 whitespace-pre-wrap leading-relaxed border-l-2 pl-2 py-0.5",
                                        log.type === 'info' && "border-blue-500 text-zinc-200",
                                        log.type === 'stdout' && "border-zinc-800 text-zinc-400",
                                        log.type === 'stderr' && "border-amber-600/80 text-amber-300",
                                        log.type === 'error' && "border-red-500 text-red-400 font-bold",
                                        log.type === 'success' && "border-emerald-500 text-emerald-400 font-bold"
                                    )}
                                >
                                    <span className="text-zinc-600 shrink-0 select-none">[{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}]</span>
                                    <span>{log.message}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
