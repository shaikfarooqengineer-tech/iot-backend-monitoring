// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/pages/PatientList.js
// PURPOSE: Lists patients visible to the current user (hospital-scoped).
//          Features: Admit patient, edit patient, delete patient, monitor link.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { UserCircle, Activity, UserPlus, Pencil, Trash2, Copy } from "lucide-react";
import { authFetch } from "@/utils/authFetch";
import { usePermissions } from "@/hooks/usePermissions";
import { CreatePatientModal } from "@/components/CreatePatientModal";
import { EditUserModal } from "@/components/EditUserModal";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PatientList() {
  const { isAdmin, canCreate } = usePermissions();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [admitOpen, setAdmitOpen] = useState(false);
  const [editPatient, setEditPatient] = useState(null);
  const [deletePatient, setDeletePatient] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch(`${BACKEND_URL}/api/patients`);
        if (res.ok) setPatients(await res.json());
        else toast.error("Failed to load patients");
      } catch { toast.error("Network error"); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const handlePatientCreated = (p) => setPatients(prev => [p, ...prev]);

  const handlePatientUpdated = (updated) => {
    setPatients(prev => prev.map(p =>
      (p.user_id || p.id) === (updated.user_id || updated.id) ? { ...p, ...updated } : p
    ));
  };

  const handleDelete = async () => {
    if (!deletePatient) return;
    setDeleting(true);
    try {
      const id = deletePatient.user_id || deletePatient.id;
      const res = await authFetch(`${BACKEND_URL}/api/users/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(`"${deletePatient.name}" removed`);
        setPatients(prev => prev.filter(p => (p.user_id || p.id) !== id));
        setDeletePatient(null);
      } else {
        const err = await res.json().catch(() => ({ detail: "Delete failed" }));
        toast.error(err.detail ?? "Delete failed");
      }
    } catch { toast.error("Network error"); }
    finally { setDeleting(false); }
  };

  //copy Patient ID.........
  const copyPatientId = async (patientId) => {
    try {
      await navigator.clipboard.writeText(patientId);
      toast.success("Patient ID copied successfully");
    } catch {
      toast.error("Failed to copy Patient ID");
    }
  };


  const showAdmitBtn = isAdmin || canCreate("patient");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <UserCircle className="w-6 h-6 text-slate-600" />
          <h1 className="text-2xl font-bold text-slate-900">Patients</h1>
        </div>
        {showAdmitBtn && (
          <Button onClick={() => setAdmitOpen(true)} className="gap-2">
            <UserPlus className="w-4 h-4" /> Admit patient
          </Button>
        )}
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
              {patients.map(p => {
                const patientId = p.user_id ?? p.id;
                return (
                  <div key={patientId} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
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
                        {/* ── Patient ID & Copy Button ── */}
                        <div className="flex items-center gap-2 mt-1 pt-0.5 text-xs text-slate-600">
                          <span>Patient ID:</span>
                          <span className="text-xs font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {patientId}
                          </span>

                          {/* copy button */}
                          <button
                            onClick={() => copyPatientId(patientId)}
                            className="text-slate-400 hover:text-slate-700"
                            title="Copy Patient ID"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {p.room && (
                        <Badge variant="outline" className="ml-2 flex-shrink-0">{p.room}</Badge>
                      )}
                      {p.status && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 flex-shrink-0">{p.status}</Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isAdmin && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => setEditPatient(p)} data-testid={`edit-patient-${patientId}`}>
                            <Pencil className="w-4 h-4 text-slate-500" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeletePatient(p)} data-testid={`delete-patient-${patientId}`}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </>
                      )}
                      <Link to={`/monitor/${patientId}`}>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Activity className="w-3.5 h-3.5" />
                          Monitor
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <CreatePatientModal
        open={admitOpen}
        onClose={() => setAdmitOpen(false)}
        onCreated={handlePatientCreated}
      />

      <EditUserModal
        open={!!editPatient}
        onClose={() => setEditPatient(null)}
        user={editPatient}
        onUpdated={handlePatientUpdated}
      />

      <DeleteConfirmDialog
        open={!!deletePatient}
        onClose={() => setDeletePatient(null)}
        onConfirm={handleDelete}
        userName={deletePatient?.name}
        loading={deleting}
      />
    </div>
  );
}
