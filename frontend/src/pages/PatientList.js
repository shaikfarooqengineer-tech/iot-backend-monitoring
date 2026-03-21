// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/pages/PatientList.js
// PURPOSE: Lists patients visible to the current user (hospital-scoped).
//          Staff see only their assigned patients (server enforces this).
//          Links to patient Dashboard for monitoring.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { UserCircle, Activity } from "lucide-react";
import { authFetch } from "@/utils/authFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function PatientList() {
  const [patients, setPatients] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch(`${process.env.REACT_APP_BACKEND_URL}/api/patients`);
        if (res.ok) setPatients(await res.json());
        else toast.error("Failed to load patients");
      } catch { toast.error("Network error"); }
      finally  { setLoading(false); }
    };
    load();
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <UserCircle className="w-6 h-6 text-slate-600" />
        <h1 className="text-2xl font-bold text-slate-900">Patients</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{patients.length} patients</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-slate-500 text-sm">Loading…</p>
          ) : patients.length === 0 ? (
            <p className="p-6 text-slate-400 text-sm">No patients assigned yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {patients.map(p => (
                <div key={p.user_id ?? p.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-slate-200 flex-shrink-0 flex items-center justify-center">
                      {p.avatar_url
                        ? <img src={p.avatar_url} alt={p.name} className="w-full h-full rounded-full object-cover" />
                        : <span className="text-xs font-bold text-slate-500">
                            {(p.name ?? "P").charAt(0).toUpperCase()}
                          </span>
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{p.name}</p>
                      <p className="text-sm text-slate-500 truncate">{p.email}</p>
                    </div>
                  </div>
                  <Link to="/dashboard">
                    <Button variant="outline" size="sm" className="gap-1.5 flex-shrink-0">
                      <Activity className="w-3.5 h-3.5" />
                      Monitor
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
