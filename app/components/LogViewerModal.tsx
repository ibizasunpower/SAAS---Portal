"use client";

import { useEffect, useState, useRef } from "react";
import { X, RefreshCw, Terminal, Download } from "lucide-react";

interface LogViewerModalProps {
    isOpen: boolean;
    instanceId: string;
    instanceName: string;
    onClose: () => void;
}

export default function LogViewerModal({
    isOpen,
    instanceId,
    instanceName,
    onClose,
}: LogViewerModalProps) {
    const [logs, setLogs] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLPreElement>(null);

    const fetchLogs = async () => {
        if (!instanceId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/instances/${instanceId}/logs`);
            const data = await res.json();
            if (data.logs) {
                // Basic cleanup of Docker multiplex headers if roughly needed, though complex in JS
                // For now just show raw, it's usually readable enough (just some weird squares at start of lines)
                // Or simplistic strip of non-ascii at start
                setLogs(data.logs);
            } else {
                setLogs("No logs available.");
            }
        } catch (error) {
            setLogs("Failed to load logs.");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchLogs();
        }
    }, [isOpen, instanceId]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[85vh]">

                {/* Header */}
                <div className="p-4 border-b border-zinc-900 flex justify-between items-center bg-zinc-900/50 rounded-t-xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-800 text-zinc-400">
                            <Terminal size={18} />
                        </div>
                        <div>
                            <h2 className="font-semibold text-zinc-100">Live Logs</h2>
                            <p className="text-xs text-zinc-500 font-mono">{instanceName} ({instanceId.substring(0, 12)})</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchLogs}
                            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                            title="Refresh Logs"
                        >
                            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Console Body */}
                <div className="flex-1 overflow-hidden relative bg-zinc-950 p-4">
                    <pre ref={scrollRef} className="h-full overflow-y-auto text-xs sm:text-sm font-mono text-zinc-300 whitespace-pre-wrap break-all custom-scrollbar p-2">
                        {logs || (loading ? "Loading logs..." : "No logs found.")}
                    </pre>
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-zinc-900 bg-zinc-900/30 flex justify-between items-center text-xs text-zinc-500">
                    <span>Showing last ~100 lines</span>
                    <span>Real-time stream</span>
                </div>
            </div>
        </div>
    );
}
