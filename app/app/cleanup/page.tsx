/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { Trash2, RefreshCw, Database, Box, HardDrive, AlertTriangle, ArrowUpDown } from "lucide-react";
import Link from "next/link";

interface OrphanedDatabase {
    name: string;
    size: string;
    sizeBytes: number;
    createdAt: string;
    inUse: boolean;
}

interface StoppedContainer {
    id: string;
    name: string;
    image: string;
    state: string;
    status: string;
    created: number;
}

interface OrphanedVolume {
    name: string;
    driver: string;
    mountpoint: string;
}

interface CleanupData {
    orphanedDatabases: OrphanedDatabase[];
    stoppedContainers: StoppedContainer[];
    orphanedVolumes: OrphanedVolume[];
    activeContainers: number;
    totalDatabases: number;
    activeDatabases: number;
}

export default function CleanupPage() {
    const [data, setData] = useState<CleanupData | null>(null);
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState<{ type: string; name: string } | null>(null);

    // Sorting state
    const [dbSort, setDbSort] = useState<{ field: 'name' | 'size' | 'createdAt'; direction: 'asc' | 'desc' }>({ field: 'name', direction: 'asc' });
    const [containerSort, setContainerSort] = useState<{ field: 'name' | 'created'; direction: 'asc' | 'desc' }>({ field: 'name', direction: 'asc' });
    const [volumeSort, setVolumeSort] = useState<{ field: 'name'; direction: 'asc' | 'desc' }>({ field: 'name', direction: 'asc' });

    const sortDatabases = (databases: OrphanedDatabase[]) => {
        return [...databases].sort((a, b) => {
            let comparison = 0;
            if (dbSort.field === 'name') {
                comparison = a.name.localeCompare(b.name);
            } else if (dbSort.field === 'size') {
                comparison = a.sizeBytes - b.sizeBytes;
            } else if (dbSort.field === 'createdAt') {
                const dateA = new Date(a.createdAt).getTime();
                const dateB = new Date(b.createdAt).getTime();
                comparison = isNaN(dateA) || isNaN(dateB) ? 0 : dateA - dateB;
            }
            return dbSort.direction === 'asc' ? comparison : -comparison;
        });
    };

    const sortContainers = (containers: StoppedContainer[]) => {
        return [...containers].sort((a, b) => {
            let comparison = 0;
            if (containerSort.field === 'name') {
                comparison = a.name.localeCompare(b.name);
            } else if (containerSort.field === 'created') {
                comparison = a.created - b.created;
            }
            return containerSort.direction === 'asc' ? comparison : -comparison;
        });
    };

    const sortVolumes = (volumes: OrphanedVolume[]) => {
        return [...volumes].sort((a, b) => {
            const comparison = a.name.localeCompare(b.name);
            return volumeSort.direction === 'asc' ? comparison : -comparison;
        });
    };

    const fetchCleanupData = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/cleanup");
            const result = await res.json();
            setData(result);
        } catch (error) {
            console.error("Failed to fetch cleanup data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCleanupData();
    }, []);

    const handleDelete = async (type: string, name: string) => {
        if (!confirm(`Are you sure you want to delete this ${type}: ${name}?`)) {
            return;
        }

        setDeleting({ type, name });
        try {
            const res = await fetch("/api/cleanup", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type, name }),
            });

            if (!res.ok) {
                throw new Error("Delete failed");
            }

            // Refresh data
            await fetchCleanupData();
        } catch (error) {
            console.error("Delete failed:", error);
            alert(`Failed to delete ${type}: ${name}`);
        } finally {
            setDeleting(null);
        }
    };

    const toggleDbSort = (field: typeof dbSort.field) => {
        setDbSort({
            field,
            direction: dbSort.field === field && dbSort.direction === 'asc' ? 'desc' : 'asc'
        });
    };

    const toggleContainerSort = (field: typeof containerSort.field) => {
        setContainerSort({
            field,
            direction: containerSort.field === field && containerSort.direction === 'asc' ? 'desc' : 'asc'
        });
    };

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-50 p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                <header className="mb-8">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                                <Box className="text-orange-600" size={32} />
                                Cleanup Management
                            </h1>
                            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                                Identify and remove unused resources
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <Link
                                href="/"
                                className="px-4 py-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                            >
                                Back to Dashboard
                            </Link>
                            <button
                                onClick={fetchCleanupData}
                                disabled={loading}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors disabled:opacity-50"
                            >
                                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                                Scan
                            </button>
                        </div>
                    </div>
                </header>

                {data && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
                            <div className="flex items-center gap-3">
                                <Database className="text-blue-500" size={24} />
                                <div>
                                    <div className="text-2xl font-bold">{data.orphanedDatabases.length}</div>
                                    <div className="text-sm text-zinc-500">Orphaned Databases</div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
                            <div className="flex items-center gap-3">
                                <Box className="text-orange-500" size={24} />
                                <div>
                                    <div className="text-2xl font-bold">{data.stoppedContainers.length}</div>
                                    <div className="text-sm text-zinc-500">Stopped Containers</div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
                            <div className="flex items-center gap-3">
                                <HardDrive className="text-purple-500" size={24} />
                                <div>
                                    <div className="text-2xl font-bold">{data.orphanedVolumes.length}</div>
                                    <div className="text-sm text-zinc-500">Orphaned Volumes</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Orphaned Databases */}
                <section className="mb-8">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Database size={20} />
                        Orphaned Databases
                    </h2>
                    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        {data?.orphanedDatabases.length === 0 ? (
                            <div className="p-8 text-center text-zinc-500">
                                No orphaned databases found
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                                    <tr>
                                        <th
                                            className="text-left p-4 font-semibold text-sm cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 select-none"
                                            onClick={() => toggleDbSort('name')}
                                        >
                                            <div className="flex items-center gap-2">
                                                Database Name
                                                {dbSort.field === 'name' && <span>{dbSort.direction === 'asc' ? '↑' : '↓'}</span>}
                                            </div>
                                        </th>
                                        <th
                                            className="text-left p-4 font-semibold text-sm cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 select-none"
                                            onClick={() => toggleDbSort('size')}
                                        >
                                            <div className="flex items-center gap-2">
                                                Size
                                                {dbSort.field === 'size' && <span>{dbSort.direction === 'asc' ? '↑' : '↓'}</span>}
                                            </div>
                                        </th>
                                        <th
                                            className="text-left p-4 font-semibold text-sm cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 select-none"
                                            onClick={() => toggleDbSort('createdAt')}
                                        >
                                            <div className="flex items-center gap-2">
                                                Created
                                                {dbSort.field === 'createdAt' && <span>{dbSort.direction === 'asc' ? '↑' : '↓'}</span>}
                                            </div>
                                        </th>
                                        <th className="text-right p-4 font-semibold text-sm">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortDatabases(data?.orphanedDatabases || []).map((db) => (
                                        <tr key={db.name} className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                                            <td className="p-4 font-mono text-sm">{db.name}</td>
                                            <td className="p-4 text-sm text-zinc-600 dark:text-zinc-400">{db.size}</td>
                                            <td className="p-4 text-sm text-zinc-600 dark:text-zinc-400">
                                                {db.createdAt !== 'Unknown' ? new Date(db.createdAt).toLocaleDateString() : 'Unknown'}
                                            </td>
                                            <td className="p-4 text-right">
                                                <button
                                                    onClick={() => handleDelete("database", db.name)}
                                                    disabled={deleting?.type === "database" && deleting?.name === db.name}
                                                    className="text-red-600 hover:text-red-500 disabled:opacity-50 flex items-center gap-2 ml-auto"
                                                >
                                                    <Trash2 size={16} />
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </section>

                {/* Stopped Containers */}
                <section className="mb-8">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Box size={20} />
                        Stopped Containers
                    </h2>
                    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        {data?.stoppedContainers.length === 0 ? (
                            <div className="p-8 text-center text-zinc-500">
                                No stopped containers found
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                                    <tr>
                                        <th
                                            className="text-left p-4 font-semibold text-sm cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 select-none"
                                            onClick={() => toggleContainerSort('name')}
                                        >
                                            <div className="flex items-center gap-2">
                                                Container Name
                                                {containerSort.field === 'name' && <span>{containerSort.direction === 'asc' ? '↑' : '↓'}</span>}
                                            </div>
                                        </th>
                                        <th className="text-left p-4 font-semibold text-sm">Image</th>
                                        <th className="text-left p-4 font-semibold text-sm">Status</th>
                                        <th
                                            className="text-left p-4 font-semibold text-sm cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 select-none"
                                            onClick={() => toggleContainerSort('created')}
                                        >
                                            <div className="flex items-center gap-2">
                                                Created
                                                {containerSort.field === 'created' && <span>{containerSort.direction === 'asc' ? '↑' : '↓'}</span>}
                                            </div>
                                        </th>
                                        <th className="text-right p-4 font-semibold text-sm">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortContainers(data?.stoppedContainers || []).map((container) => (
                                        <tr key={container.id} className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                                            <td className="p-4 font-mono text-sm">{container.name}</td>
                                            <td className="p-4 text-sm text-zinc-600 dark:text-zinc-400">{container.image}</td>
                                            <td className="p-4">
                                                <span className="px-2 py-1 rounded-full text-xs bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                                                    {container.state}
                                                </span>
                                            </td>
                                            <td className="p-4 text-sm text-zinc-600 dark:text-zinc-400">
                                                {new Date(container.created * 1000).toLocaleDateString()}
                                            </td>
                                            <td className="p-4 text-right">
                                                <button
                                                    onClick={() => handleDelete("container", container.name)}
                                                    disabled={deleting?.type === "container" && deleting?.name === container.name}
                                                    className="text-red-600 hover:text-red-500 disabled:opacity-50 flex items-center gap-2 ml-auto"
                                                >
                                                    <Trash2 size={16} />
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </section>

                {/* Orphaned Volumes */}
                <section className="mb-8">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <HardDrive size={20} />
                        Orphaned Volumes
                    </h2>
                    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        {data?.orphanedVolumes.length === 0 ? (
                            <div className="p-8 text-center text-zinc-500">
                                No orphaned volumes found
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                                    <tr>
                                        <th className="text-left p-4 font-semibold text-sm">Volume Name</th>
                                        <th className="text-left p-4 font-semibold text-sm">Driver</th>
                                        <th className="text-right p-4 font-semibold text-sm">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortVolumes(data?.orphanedVolumes || []).map((volume) => (
                                        <tr key={volume.name} className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                                            <td className="p-4 font-mono text-sm">{volume.name}</td>
                                            <td className="p-4 text-sm text-zinc-600 dark:text-zinc-400">{volume.driver}</td>
                                            <td className="p-4 text-right">
                                                <button
                                                    onClick={() => handleDelete("volume", volume.name)}
                                                    disabled={deleting?.type === "volume" && deleting?.name === volume.name}
                                                    className="text-red-600 hover:text-red-500 disabled:opacity-50 flex items-center gap-2 ml-auto"
                                                >
                                                    <Trash2 size={16} />
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </section>

                <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="text-yellow-600 dark:text-yellow-500 flex-shrink-0" size={20} />
                    <div className="text-sm">
                        <strong className="text-yellow-900 dark:text-yellow-200">Warning:</strong>
                        <span className="text-yellow-800 dark:text-yellow-300 ml-1">
                            Deletion is permanent and cannot be undone. Make sure you have backups before deleting any resources.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
