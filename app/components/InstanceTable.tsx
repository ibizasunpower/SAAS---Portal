/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import {
    Trash2,
    ExternalLink,
    ArrowUpDown,
    Terminal
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Instance {
    id: string;
    names: string[];
    image: string;
    state: string;
    status: string;
    ports: any[];
    domain?: string;
}

interface InstanceTableProps {
    instances: Instance[];
    onRefresh: () => void;
    onLogs: (instance: Instance) => void;
    onDelete: (instance: Instance) => void;
}

type SortKey = "name" | "port" | "state";
type SortDirection = "asc" | "desc";

export default function InstanceTable({ instances, onRefresh, onLogs, onDelete }: InstanceTableProps) {
    const [sortKey, setSortKey] = useState<SortKey>("name");
    const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

    // Sorting Logic
    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
        } else {
            setSortKey(key);
            setSortDirection("asc");
        }
    };

    const getSortValue = (instance: Instance, key: SortKey) => {
        switch (key) {
            case "name":
                return (instance.names[0] || "").replace("/", "").toLowerCase();
            case "port":
                // Find public port
                const port = instance.ports.find((p: any) => p.PublicPort)?.PublicPort;
                return port || 999999; // Put N/A at bottom
            case "state":
                return instance.state;
            default:
                return "";
        }
    };

    const sortedInstances = [...instances].sort((a, b) => {
        const valA = getSortValue(a, sortKey);
        const valB = getSortValue(b, sortKey);

        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        return 0;
    });

    // Helper for clean name
    const getCleanName = (instance: Instance) => (instance.names[0] || "Unknown").replace("/", "");

    // Status Badge Helper
    const getStatusColor = (state: string) => {
        switch (state.toLowerCase()) {
            case "running": return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
            case "exited": return "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/20"; // Gray for stopped
            default: return "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20";
        }
    };

    return (
        <div className="w-full space-y-4">

            {/* Table Container */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-50/50 dark:bg-zinc-800/20 text-zinc-500 dark:text-zinc-400 font-medium border-b border-zinc-200 dark:border-zinc-800">
                            <tr>
                                <th className="px-6 py-4 w-[250px] cursor-pointer hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors" onClick={() => handleSort("name")}>
                                    <div className="flex items-center gap-1">
                                        Instance Name
                                        <ArrowUpDown className="w-3.5 h-3.5" />
                                    </div>
                                </th>
                                <th className="px-6 py-4 w-[120px] cursor-pointer hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors" onClick={() => handleSort("port")}>
                                    <div className="flex items-center gap-1">
                                        Port
                                        <ArrowUpDown className="w-3.5 h-3.5" />
                                    </div>
                                </th>
                                <th className="px-6 py-4 w-[140px] cursor-pointer hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors" onClick={() => handleSort("state")}>
                                    <div className="flex items-center gap-1">
                                        Status
                                        <ArrowUpDown className="w-3.5 h-3.5" />
                                    </div>
                                </th>
                                <th className="px-6 py-4">Image</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {sortedInstances.map((instance) => {
                                const name = getCleanName(instance);
                                const publicPort = instance.ports.find((p: any) => p.PublicPort)?.PublicPort;

                                return (
                                    <tr key={instance.id} className="group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                                <div className={cn(
                                                    "w-2 h-2 rounded-full",
                                                    instance.state === 'running' ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                                                )} />
                                                {name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-zinc-600 dark:text-zinc-400">
                                            {publicPort ? (
                                                <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded text-xs border border-zinc-200 dark:border-zinc-700">
                                                    {publicPort}
                                                </span>
                                            ) : (
                                                <span className="text-zinc-400 dark:text-zinc-600 italic">N/A</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={cn(
                                                "px-2.5 py-1 rounded-full text-xs font-medium border",
                                                getStatusColor(instance.state)
                                            )}>
                                                {instance.state}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-zinc-500 dark:text-zinc-500 text-xs truncate max-w-[200px]" title={instance.image}>
                                            {instance.image.length > 25 ? instance.image.substring(0, 25) + '...' : instance.image}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {publicPort && instance.state === 'running' && (
                                                    <Link
                                                        href={instance.domain && !instance.domain.endsWith('.local') ? `http://${instance.domain}` : `http://${window.location.hostname}:${publicPort}`}
                                                        target="_blank"
                                                        className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 rounded-lg transition-colors"
                                                        title="Open Odoo"
                                                    >
                                                        <ExternalLink className="w-4 h-4" />
                                                    </Link>
                                                )}

                                                <button
                                                    onClick={() => onLogs(instance)}
                                                    className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded-lg transition-colors"
                                                    title="View Logs"
                                                >
                                                    <Terminal className="w-4 h-4" />
                                                </button>

                                                <button
                                                    onClick={() => onDelete(instance)}
                                                    className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors"
                                                    title="Delete Instance"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {sortedInstances.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-zinc-500 dark:text-zinc-400">
                                        No instances found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
