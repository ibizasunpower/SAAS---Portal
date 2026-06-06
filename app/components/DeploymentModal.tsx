/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { X, Loader2, Server, Globe, Box, Search, CheckSquare, Square, Tag, Package, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeploymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

// Known standard Odoo modules — these get the "Odoo Core" badge
const STANDARD_ODOO_IDS = new Set([
    'base','web','mail','account','account_accountant','account_analytic',
    'crm','sale','sale_management','purchase','stock','mrp','project',
    'hr','hr_expense','hr_holidays','hr_timesheet','hr_payroll',
    'website','website_sale','ecommerce','point_of_sale','pos_restaurant',
    'l10n_es','l10n_es_account','l10n_generic_coa','fleet',
    'maintenance','quality','helpdesk','knowledge','discuss','calendar',
    'contacts','note','lunch','survey','event','gamification',
    'analytic','resource','digest','bus','portal','rating','utm',
    'base_iban','base_vat','base_import','delivery','stock_account',
    'mrp_account','purchase_stock','sale_stock','account_payment',
    'payment','spreadsheet','documents','sign','approvals',
]);

export function DeploymentModal({ isOpen, onClose, onSuccess }: DeploymentModalProps) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        clientName: "",
        version: "19",
        domain: "",
    });
    const [categories, setCategories] = useState<any[]>([]);
    const [selectedModules, setSelectedModules] = useState<string[]>([]);
    const [error, setError] = useState("");
    const [logs, setLogs] = useState<any[]>([]);
    const [moduleSearch, setModuleSearch] = useState("");
    const [activeCategory, setActiveCategory] = useState<string>("all");

    const logContainerRef = useRef<HTMLDivElement>(null);

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
        setSelectedModules([]);
        setModuleSearch("");
        setActiveCategory("all");
        setLogs([]);
    }, [isOpen, formData.version]);

    // Flatten all modules into a single list with their category info (unique by ID, prioritizing original category assignment over oca_essentials)
    const allModules = useMemo(() => {
        const flat: any[] = [];
        const seen = new Set<string>();
        
        // Phase 1: Add from standard categories
        categories.forEach(cat => {
            if (cat.id === 'oca_essentials') return;
            (cat.modules || []).forEach((mod: any) => {
                if (!seen.has(mod.id)) {
                    flat.push({
                        ...mod,
                        categoryId: cat.id,
                        categoryName: cat.name,
                        isStandard: STANDARD_ODOO_IDS.has(mod.id),
                    });
                    seen.add(mod.id);
                }
            });
        });
        
        // Phase 2: Add any remaining in oca_essentials (not in any other scanned category)
        categories.forEach(cat => {
            if (cat.id !== 'oca_essentials') return;
            (cat.modules || []).forEach((mod: any) => {
                if (!seen.has(mod.id)) {
                    flat.push({
                        ...mod,
                        categoryId: cat.id,
                        categoryName: cat.name,
                        isStandard: STANDARD_ODOO_IDS.has(mod.id),
                    });
                    seen.add(mod.id);
                }
            });
        });
        
        return flat;
    }, [categories]);

    // Unique category list for the filter tabs
    const categoryTabs = useMemo(() => {
        const tabs = [{ id: 'all', name: 'All', count: allModules.length }];
        categories.forEach(cat => {
            const count = (cat.modules || []).length;
            if (count > 0) tabs.push({ id: cat.id, name: cat.name, count });
        });
        return tabs;
    }, [categories, allModules.length]);

    // Filtered modules based on search + category filter
    const filteredModules = useMemo(() => {
        const q = moduleSearch.toLowerCase().trim();
        
        let targets: any[] = [];
        if (activeCategory === 'all') {
            targets = allModules;
        } else {
            const cat = categories.find(c => c.id === activeCategory);
            if (cat) {
                targets = (cat.modules || []).map((mod: any) => ({
                    ...mod,
                    categoryId: cat.id,
                    categoryName: cat.name,
                    isStandard: STANDARD_ODOO_IDS.has(mod.id),
                }));
            }
        }

        return targets.filter(mod => {
            if (!q) return true;
            return (
                mod.name?.toLowerCase().includes(q) ||
                mod.id?.toLowerCase().includes(q) ||
                mod.categoryName?.toLowerCase().includes(q)
            );
        });
    }, [allModules, categories, moduleSearch, activeCategory]);

    if (!isOpen) return null;

    const handleModuleChange = (moduleId: string) => {
        if (loading) return;
        setSelectedModules(prev => {
            if (prev.includes(moduleId)) return prev.filter(id => id !== moduleId);
            return [...prev, moduleId];
        });
    };

    const handleSelectAll = () => {
        if (loading) return;
        const ids = filteredModules.map(m => m.id);
        const allChecked = ids.every(id => selectedModules.includes(id));
        if (allChecked) {
            setSelectedModules(prev => prev.filter(id => !ids.includes(id)));
        } else {
            setSelectedModules(prev => Array.from(new Set([...prev, ...ids])));
        }
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
                partialLine = lines.pop() || "";

                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const logObj = JSON.parse(line);
                            setLogs(prev => [...prev, logObj]);
                            if (logObj.type === "success") {
                                setLoading(false);
                                setTimeout(() => { onSuccess(); onClose(); }, 2000);
                            } else if (logObj.type === "error") {
                                setError(logObj.message);
                                setLoading(false);
                            }
                        } catch {
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

    const filteredAllChecked = filteredModules.length > 0 && filteredModules.every(m => selectedModules.includes(m.id));
    const filteredSomeChecked = !filteredAllChecked && filteredModules.some(m => selectedModules.includes(m.id));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full md:w-[70vw] md:h-[70vh] p-6 shadow-2xl relative animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden">
                <button
                    onClick={onClose}
                    disabled={loading}
                    className="absolute right-4 top-4 text-zinc-500 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed z-10"
                >
                    <X size={20} />
                </button>

                <div className="mb-4 shrink-0">
                    <h2 className="text-2xl font-bold text-white mb-1">Deploy Odoo Instance</h2>
                    <p className="text-zinc-400 text-sm">Create a new Odoo environment for your client.</p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-lg text-sm mb-4 shrink-0">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-grow overflow-hidden min-h-0">

                    {/* ── Left Column: Config ── */}
                    <div className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto pr-1">
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
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-600 transition-all disabled:opacity-55 disabled:cursor-not-allowed"
                                placeholder="e.g. client-acme-corp"
                                value={formData.clientName}
                                onChange={e => setFormData({ ...formData, clientName: e.target.value })}
                            />
                            <p className="text-[10px] text-zinc-500">Lowercase letters, numbers and hyphens only.</p>
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
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-600 transition-all disabled:opacity-55 disabled:cursor-not-allowed"
                                placeholder="e.g. odoo.acme.com"
                                value={formData.domain}
                                onChange={e => setFormData({ ...formData, domain: e.target.value })}
                            />
                        </div>

                        {/* Selected summary */}
                        {selectedModules.length > 0 && (
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 flex items-center justify-between">
                                <span className="text-xs text-blue-400 flex items-center gap-1.5">
                                    <Package size={12} />
                                    <strong>{selectedModules.length}</strong> module{selectedModules.length !== 1 ? 's' : ''} selected
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setSelectedModules([])}
                                    disabled={loading}
                                    className="text-[10px] text-blue-400/60 hover:text-blue-300 transition-colors"
                                >
                                    Clear all
                                </button>
                            </div>
                        )}

                        <div className="pt-2 border-t border-zinc-800/80 mt-auto">
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

                    {/* ── Right Column: Module Picker ── */}
                    <div className="lg:col-span-8 flex flex-col overflow-hidden min-h-0 border border-zinc-800 rounded-xl bg-zinc-900/40">

                        {/* Header */}
                        <div className="px-4 pt-3 pb-2 border-b border-zinc-800 shrink-0 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                                    <Package size={14} className="text-blue-400" />
                                    Pre-installed Modules
                                </span>
                                {filteredModules.length > 0 && (
                                    <button
                                        type="button"
                                        disabled={loading}
                                        onClick={handleSelectAll}
                                        className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-zinc-800"
                                    >
                                        {filteredAllChecked
                                            ? <><CheckSquare size={13} className="text-blue-400" /> Deselect all</>
                                            : <><Square size={13} /> Select all {activeCategory !== 'all' ? 'in category' : ''}</>
                                        }
                                    </button>
                                )}
                            </div>

                            {/* Search */}
                            <div className="relative">
                                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                                <input
                                    type="text"
                                    placeholder="Search modules by name or ID..."
                                    value={moduleSearch}
                                    disabled={loading}
                                    onChange={e => setModuleSearch(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                                />
                                {moduleSearch && (
                                    <button
                                        type="button"
                                        onClick={() => setModuleSearch('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Content Area with Categories Sidebar & Modules List */}
                        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden min-h-0">
                            {/* Categories Sidebar */}
                            {categoryTabs.length > 1 && (
                                <div className="w-full sm:w-52 border-b sm:border-b-0 sm:border-r border-zinc-800 overflow-x-auto sm:overflow-y-auto p-2 flex flex-row sm:flex-col gap-1 scrollbar-thin bg-zinc-950/20 shrink-0 max-h-16 sm:max-h-none">
                                    {categoryTabs.map(tab => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            disabled={loading}
                                            onClick={() => setActiveCategory(tab.id)}
                                            className={cn(
                                                "text-left text-[11px] px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg transition-all font-medium flex items-center justify-between gap-2 shrink-0 sm:shrink-0",
                                                activeCategory === tab.id
                                                    ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                                                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/45 border border-transparent"
                                            )}
                                        >
                                            <span className="truncate flex items-center gap-1.5">
                                                <Tag size={10} className={activeCategory === tab.id ? "text-blue-400" : "text-zinc-500"} />
                                                {tab.name}
                                            </span>
                                            <span className={cn(
                                                "text-[9px] px-1.5 py-0.5 rounded-full font-mono",
                                                activeCategory === tab.id ? "bg-blue-500/20 text-blue-300" : "bg-zinc-800 text-zinc-500"
                                            )}>
                                                {tab.count}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Modules List Pane */}
                            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                                {/* Module list */}
                                <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0 p-2">
                                    {categories.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full text-zinc-500 py-10">
                                            <Loader2 className="animate-spin mb-2" size={22} />
                                            <span className="text-xs">Loading modules for Odoo {formData.version}.0...</span>
                                        </div>
                                    ) : filteredModules.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full text-zinc-500 py-10">
                                            <Search size={22} className="mb-2 opacity-40" />
                                            <span className="text-xs">No modules match &quot;{moduleSearch}&quot;</span>
                                            <button type="button" onClick={() => setModuleSearch('')} className="mt-2 text-[10px] text-blue-400 hover:underline">Clear search</button>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-0.5">
                                            {filteredModules.map(mod => {
                                                const isChecked = selectedModules.includes(mod.id);
                                                return (
                                                    <label
                                                        key={mod.id}
                                                        className={cn(
                                                            "flex items-start gap-3 px-3 py-2 rounded-lg cursor-pointer select-none group transition-all",
                                                            isChecked
                                                                ? "bg-blue-500/10 border border-blue-500/20"
                                                                : "hover:bg-zinc-800/60 border border-transparent",
                                                            loading && "pointer-events-none opacity-60"
                                                        )}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            disabled={loading}
                                                            className="mt-0.5 rounded border-zinc-600 bg-zinc-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-950 h-4 w-4 cursor-pointer shrink-0"
                                                            checked={isChecked}
                                                            onChange={() => handleModuleChange(mod.id)}
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className={cn(
                                                                    "text-sm font-medium transition-colors",
                                                                    isChecked ? "text-white" : "text-zinc-300 group-hover:text-white"
                                                                )}>
                                                                    {mod.name}
                                                                </span>
                                                                {mod.isStandard ? (
                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-medium">
                                                                        Odoo Core
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/20 font-medium">
                                                                        OCA
                                                                    </span>
                                                                )}
                                                                {activeCategory === 'all' && (
                                                                    <span className="text-[9px] text-zinc-600">
                                                                        {mod.categoryName}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-[10px] text-zinc-500 font-mono">{mod.id}</span>
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Footer count */}
                                <div className="px-4 py-2 border-t border-zinc-800 shrink-0 flex items-center justify-between text-[10px] text-zinc-500">
                                    <span>
                                        Showing {filteredModules.length} of {allModules.length} modules
                                        {filteredSomeChecked && <span className="ml-2 text-blue-400">{filteredModules.filter(m => selectedModules.includes(m.id)).length} selected in view</span>}
                                    </span>
                                    {moduleSearch && <span className="text-zinc-600">Filtered by: &quot;{moduleSearch}&quot;</span>}
                                </div>
                            </div>
                        </div>
                    </div>
                </form>

                {/* Live Console */}
                {(loading || logs.length > 0) && (
                    <div className="mt-4 border-t border-zinc-800/80 pt-4 space-y-2 animate-in slide-in-from-bottom-2 duration-300 shrink-0">
                        <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
                            <span className="flex items-center gap-1.5">
                                <span className={cn(
                                    "h-2 w-2 rounded-full",
                                    loading ? "bg-blue-500 animate-pulse" : (error ? "bg-red-500" : "bg-emerald-500")
                                )}></span>
                                {loading ? "Streaming live deployment logs..." : (error ? "Deployment Failed" : "Deployment Completed")}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-500">{logs.length} lines captured</span>
                        </div>
                        <div
                            ref={logContainerRef}
                            className="bg-zinc-950 border border-zinc-900 rounded-lg p-3 h-32 overflow-y-auto font-mono text-[10px] text-zinc-300 space-y-1 selection:bg-zinc-800 scrollbar-thin"
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
