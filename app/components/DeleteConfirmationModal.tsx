"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeleteConfirmationModalProps {
    isOpen: boolean;
    instanceName: string;
    isDeleting: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

export default function DeleteConfirmationModal({
    isOpen,
    instanceName,
    isDeleting,
    onClose,
    onConfirm,
}: DeleteConfirmationModalProps) {
    const [confirmInput, setConfirmInput] = useState("");

    useEffect(() => {
        if (isOpen) {
            setConfirmInput("");
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const isMatch = confirmInput === instanceName;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-red-50/50 dark:bg-red-900/10">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                        <AlertTriangle className="w-5 h-5" />
                        <h2 className="font-semibold text-lg">Delete Instance</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    <div className="text-zinc-600 dark:text-zinc-300">
                        <p>
                            Are you sure you want to delete the instance <strong className="text-zinc-900 dark:text-white">{instanceName}</strong>?
                        </p>
                        <p className="text-sm mt-2 text-red-600/80 dark:text-red-400/80">
                            This action ensures:
                        </p>
                        <ul className="list-disc list-inside text-sm mt-1 text-zinc-500 dark:text-zinc-400 space-y-1">
                            <li>Docker container is removed.</li>
                            <li>Nginx configuration is deleted.</li>
                            <li><strong>All data files in /home/portal/{instanceName} are permanently deleted.</strong></li>
                        </ul>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            Type <span className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 select-all">{instanceName}</span> to confirm:
                        </label>
                        <input
                            type="text"
                            value={confirmInput}
                            onChange={(e) => setConfirmInput(e.target.value)}
                            placeholder={instanceName}
                            className={cn(
                                "w-full px-3 py-2 rounded-lg border bg-transparent transition-all outline-none",
                                "border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-red-500/20 focus:border-red-500",
                                "placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                            )}
                            autoFocus
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 pt-0 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        disabled={isDeleting}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={!isMatch || isDeleting}
                        className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 text-white transition-all shadow-sm",
                            isMatch
                                ? "bg-red-600 hover:bg-red-700 shadow-red-500/20"
                                : "bg-zinc-300 dark:bg-zinc-800 cursor-not-allowed opacity-50",
                            isDeleting && "opacity-80 cursor-wait"
                        )}
                    >
                        {isDeleting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Deleting...
                            </>
                        ) : (
                            "Confirm Delete"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
