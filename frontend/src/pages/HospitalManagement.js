// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/pages/HospitalManagement.js
// PURPOSE: Superadmin-only page. Create hospitals and list all existing ones.
//          Displays hospital_id prominently so superadmin can copy it when
//          creating hospital_admin accounts.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Copy, Building2 } from "lucide-react";
import { authFetch } from "@/utils/authFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function HospitalManagement() {
  const [hospitals, setHospitals] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [form,      setForm]      = useState({ name: "", address: "" });
  const [creating,  setCreating]  = useState(false);

  // ─── Load hospitals ───────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch(`${process.env.REACT_APP_BACKEND_URL}/api/hospitals`);
        if (res.ok) setHospitals(await res.json());
        else toast.error("Failed to load hospitals");
      } catch { toast.error("Network error"); }
      finally  { setLoading(false); }
    };
    load();
  }, []);

  // ─── Create hospital ──────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("Hospital name is required"); return; }
    setCreating(true);
    try {
      const res = await authFetch(`${process.env.REACT_APP_BACKEND_URL}/api/hospitals`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      if (res.ok) {
        const h = await res.json();
        setHospitals(prev => [h, ...prev]);
        setForm({ name: "", address: "" });
        toast.success(`"${h.name}" created`);
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed to create hospital" }));
        if (res.status === 401) {
          toast.error("Session expired. Please log in again.");
        } else if (res.status === 403) {
          toast.error("You don't have permission to do this.");
        } else {
          toast.error(err.detail ?? "Failed to create hospital");
        }
      }
    } catch { toast.error("Network error"); }
    finally  { setCreating(false); }
  };

  // ─── Copy hospital_id to clipboard ───────────────────────────────────────
  const copyId = (id) => {
    navigator.clipboard.writeText(id);
    toast.success("Hospital ID copied");
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="w-6 h-6 text-slate-600" />
        <h1 className="text-2xl font-bold text-slate-900">Hospitals</h1>
      </div>

      {/* Create form */}
      <Card>
        <CardHeader><CardTitle className="text-base">Add new hospital</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Hospital name *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({...f, name: e.target.value}))}
                placeholder="City General Hospital"
              />
            </div>
            <div className="space-y-1">
              <Label>Address (optional)</Label>
              <Input
                value={form.address}
                onChange={e => setForm(f => ({...f, address: e.target.value}))}
                placeholder="123 Medical Drive"
              />
            </div>
          </div>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? "Creating…" : "Create hospital"}
          </Button>
        </CardContent>
      </Card>

      {/* Hospital list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All hospitals ({hospitals.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-slate-500 text-sm">Loading…</p>
          ) : hospitals.length === 0 ? (
            <p className="text-slate-400 text-sm">No hospitals yet. Create one above.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {hospitals.map(h => (
                <div key={h.hospital_id} className="py-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{h.name}</p>
                    {h.address && (
                      <p className="text-sm text-slate-500 mt-0.5">{h.address}</p>
                    )}
                    {/* hospital_id displayed prominently — superadmin needs to copy this
                        when creating hospital_admin accounts via User Management */}
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs text-slate-400 font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        {h.hospital_id}
                      </code>
                      <button
                        onClick={() => copyId(h.hospital_id)}
                        className="text-slate-400 hover:text-indigo-600 transition-colors"
                        title="Copy hospital ID"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                    h.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {h.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
