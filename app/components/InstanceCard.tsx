/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Container, ExternalLink, Trash2, Terminal, Globe, Database, Download, Calendar, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface InstanceProps {
    instance: {
        id: string;
        names: string[];
        image: string;
        state: string;
        status: string;
        ports: any[];
        labels: Record<string, string>;
        domain?: string;
        database?: string;
        created_at?: string;
        last_backup?: string | null;
    };
    onDelete: (instance: any) => void;
    onLogs: (instance: any) => void;
    onBackup: (instance: any) => void;
}

export function InstanceCard({ instance, onDelete, onLogs, onBackup }: InstanceProps) {
    const name = (instance.names[0] || "Unknown").replace('/', '');
    const isRunning = instance.state === 'running';
    // Find public port
    const port = instance.ports.find((p: any) => p.PublicPort)?.PublicPort || 'N/A';

    // Get Domain from labels or direct field
    const domain = instance.domain || instance.labels?.['com.odoo.domain'] || 'N/A';

    // Get Database
    const database = instance.database || 'N/A';

    // Format date/time helpers
    const formatDateTime = (iso?: string | null) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    };

    // Clean name odoo-client -> client
    const displayName = name.startsWith('odoo-') ? name.replace('odoo-', '') : name;

    const statusColor = isRunning
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400";

    const statusDot = isRunning
        ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
        : "bg-zinc-300 dark:bg-zinc-700";

    return (
        <div className="group relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 transition-all hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-lg dark:hover:shadow-black/40 flex flex-col h-full">

            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                    <div className={cn("p-2.5 rounded-lg border border-transparent", statusColor)}>
                        <Container size={24} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-lg text-zinc-900 dark:text-white capitalize leading-tight">{displayName}</h3>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 capitalize">{instance.state}</p>
                    </div>
                </div>
                <div className={cn("h-2.5 w-2.5 rounded-full mt-2", statusDot)} />
            </div>

            <div className="space-y-3 mb-6 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-lg border border-zinc-100 dark:border-zinc-800/50 flex-1">
                <div className="flex justify-between text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5"><Globe size={14} /> Domain</span>
                    <span className="text-zinc-700 dark:text-zinc-200 font-medium truncate max-w-[140px]" title={domain}>{domain}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5"><Database size={14} /> Database</span>
                    <span className="text-zinc-700 dark:text-zinc-200 font-medium truncate max-w-[140px] font-mono text-xs text-zinc-600 dark:text-zinc-400" title={database}>{database}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">Port</span>
                    <span className="text-zinc-700 dark:text-zinc-200 font-mono font-medium">{port}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">Image</span>
                    <span className="text-zinc-700 dark:text-zinc-200 truncate max-w-[140px]" title={instance.image}>
                        {instance.image.split(':')[0]}
                        <span className="text-zinc-400 dark:text-zinc-500">:{instance.image.split(':')[1] || 'latest'}</span>
                    </span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">Container</span>
                    <span className="text-zinc-700 dark:text-zinc-200 truncate max-w-[140px]" title={name}>{name}</span>
                </div>
                <div className="border-t border-zinc-200 dark:border-zinc-700/50 pt-3 mt-1 space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5"><Calendar size={13} /> Created</span>
                        <span className="text-zinc-600 dark:text-zinc-400 text-xs">{formatDateTime(instance.created_at)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5"><ShieldCheck size={13} /> Last Backup</span>
                        <span className={`text-xs ${instance.last_backup ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400 dark:text-zinc-600 italic'}`}>
                            {formatDateTime(instance.last_backup)}
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex gap-2 text-sm pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                    onClick={() => onLogs(instance)}
                    className="p-2.5 text-zinc-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors border border-transparent"
                    title="View Logs"
                >
                    <Terminal size={18} />
                </button>

                <button
                    onClick={() => onBackup(instance)}
                    className="p-2.5 text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors border border-transparent"
                    title="Backup & Download Database"
                >
                    <Download size={18} />
                </button>

                {isRunning && port !== 'N/A' ? (
                    <Link
                        href={`http://${window.location.hostname}:${port}`}
                        target="_blank"
                        className="flex-1 flex items-center justify-center gap-2 bg-zinc-900 dark:bg-white text-white dark:text-black py-2.5 rounded-lg hover:opacity-90 transition-all font-medium shadow-sm"
                    >
                        <ExternalLink size={16} />
                        Open
                    </Link>
                ) : (
                    <div className="flex-1" />
                )}

                <button
                    onClick={() => onDelete(instance)}
                    className="p-2.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-transparent hover:border-red-100 dark:hover:border-red-900/30"
                    title="Delete Instance"
                >
                    <Trash2 size={18} />
                </button>
            </div>
        </div>
    );
}
