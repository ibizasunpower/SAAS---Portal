/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, LayoutDashboard, List, Grid, Trash2, Sparkles } from "lucide-react";
import Link from "next/link";
import InstanceTable from "@/components/InstanceTable";
import { InstanceCard } from "@/components/InstanceCard";
import { DeploymentModal } from "@/components/DeploymentModal";
import LogViewerModal from "@/components/LogViewerModal";
import DeleteConfirmationModal from "@/components/DeleteConfirmationModal";

export default function Dashboard() {
  const [instances, setInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // View Toggle State
  const [viewMode, setViewMode] = useState<"list" | "card">("list");

  // Logs Modal State
  const [logModalInstance, setLogModalInstance] = useState<{ id: string, name: string } | null>(null);

  // Delete Modal State (Hoisted from Table)
  const [deleteInstance, setDeleteInstance] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchInstances = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/instances");
      const data = await res.json();
      setInstances(data);
    } catch (error) {
      console.error("Failed to fetch instances:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstances();
  }, []);

  // Handlers
  const handleLogs = (instance: any) => {
    const name = (instance.names[0] || "Unknown").replace('/', '');
    setLogModalInstance({ id: instance.id, name });
  };

  const handleDeleteParams = (instance: any) => {
    setDeleteInstance(instance);
  };

  const handleBackup = (instance: any) => {
    window.location.href = `/api/instances/${instance.id}/backup`;
  };

  const handleConfirmDelete = async () => {
    if (!deleteInstance) return;

    setIsDeleting(true);
    try {
      const name = (deleteInstance.names[0] || "").replace("/", "");
      const response = await fetch(`/api/instances/${deleteInstance.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: name }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete instance");
      }

      // Success
      setDeleteInstance(null);
      fetchInstances();
    } catch (error) {
      console.error(error);
      alert("Failed to delete instance. Check console.");
    } finally {
      setIsDeleting(false);
      setDeleteInstance(null);
    }
  };

  const cleanDeleteName = deleteInstance ? (deleteInstance.names[0] || "Unknown").replace("/", "") : "";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-50 p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-center shadow-sm">
              <LayoutDashboard className="text-blue-600 dark:text-blue-500" size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Acatechnic SAAS Portal</h1>
              <p className="text-zinc-500 dark:text-zinc-400">Manage your client deployments</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/onboarding"
              className="group flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-indigo-500/20"
            >
              <Sparkles size={18} />
              SaaS Onboarding
            </Link>

            <Link
              href="/cleanup"
              className="group flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-orange-500/20"
            >
              <Trash2 size={18} />
              Cleanup
            </Link>

            <button
              onClick={() => setIsModalOpen(true)}
              className="group flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20"
            >
              <Plus size={18} className="group-hover:rotate-90 transition-transform" />
              New Instance
            </button>

          </div>
        </header>

        <section className="space-y-4">
          <div className="flex justify-between items-center bg-white dark:bg-zinc-900 p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <div className="flex items-center gap-4 pl-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Instances</h2>
                <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded-full text-xs font-medium border border-zinc-200 dark:border-zinc-700">
                  {instances.length}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* View Toggles */}
              <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-white" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
                  title="List View"
                >
                  <List size={16} />
                </button>
                <button
                  onClick={() => setViewMode("card")}
                  className={`p-1.5 rounded-md transition-all ${viewMode === "card" ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-white" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}
                  title="Card View"
                >
                  <Grid size={16} />
                </button>
              </div>

              <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-1"></div>

              <button
                onClick={fetchInstances}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                title="Refresh List"
              >
                <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {viewMode === "list" ? (
            <InstanceTable
              instances={instances}
              onRefresh={fetchInstances}
              onLogs={handleLogs}
              onDelete={handleDeleteParams}
              onBackup={handleBackup}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {instances.map(inst => (
                <InstanceCard
                  key={inst.id}
                  instance={inst}
                  onLogs={handleLogs}
                  onDelete={handleDeleteParams}
                  onBackup={handleBackup}
                />
              ))}
              {instances.length === 0 && (
                <div className="col-span-full text-center py-20 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl text-zinc-500">
                  No instances running.
                </div>
              )}
            </div>
          )}
        </section>

        {/* Modals */}
        <DeploymentModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={fetchInstances}
        />

        <LogViewerModal
          isOpen={!!logModalInstance}
          instanceId={logModalInstance?.id || ""}
          instanceName={logModalInstance?.name || ""}
          onClose={() => setLogModalInstance(null)}
        />

        <DeleteConfirmationModal
          isOpen={!!deleteInstance}
          instanceName={cleanDeleteName}
          isDeleting={isDeleting}
          onClose={() => !isDeleting && setDeleteInstance(null)}
          onConfirm={handleConfirmDelete}
        />

      </div>
    </div>
  );
}
