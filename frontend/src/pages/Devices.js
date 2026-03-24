// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/pages/Devices.js
// PURPOSE: Device management page.
//   Superadmin: register devices, assign to hospitals, unassign.
//   Hospital Admin: view devices assigned to their hospital.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Radio, Plus, Building2, UserCircle, RotateCcw } from "lucide-react";
import { authFetch } from "@/utils/authFetch";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { Label }  from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function Devices() {
  const { isSuperAdmin } = usePermissions();
  const [devices, setDevices]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [registerOpen, setRegisterOpen] = useState(false);

  // Register form
  const [regForm, setRegForm] = useState({ device_serial: "", device_type: "sleep_monitor", firmware_version: "" });
  const [registering, setRegistering] = useState(false);

  // Assign form
  const [assignDeviceId, setAssignDeviceId] = useState(null);
  const [assignHospitalId, setAssignHospitalId] = useState("");
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch(`${BACKEND_URL}/api/devices`);
        if (res.ok) setDevices(await res.json());
        else toast.error("Failed to load devices");
      } catch { toast.error("Network error"); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const handleRegister = async () => {
    if (!regForm.device_serial.trim()) { toast.error("Serial number is required"); return; }
    setRegistering(true);
    try {
      const res = await authFetch(`${BACKEND_URL}/api/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(regForm),
      });
      if (res.ok) {
        const device = await res.json();
        toast.success(`Device "${device.device_serial}" registered`);
        setDevices(prev => [device, ...prev]);
        setRegisterOpen(false);
        setRegForm({ device_serial: "", device_type: "sleep_monitor", firmware_version: "" });
      } else {
        const err = await res.json().catch(() => ({ detail: "Registration failed" }));
        toast.error(err.detail ?? "Registration failed");
      }
    } catch { toast.error("Network error"); }
    finally { setRegistering(false); }
  };

  const handleAssignHospital = async () => {
    if (!assignHospitalId.trim()) { toast.error("Hospital ID is required"); return; }
    setAssigning(true);
    try {
      const res = await authFetch(`${BACKEND_URL}/api/devices/${assignDeviceId}/assign-hospital`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospital_id: assignHospitalId }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDevices(prev => prev.map(d => d.device_id === assignDeviceId ? { ...d, ...updated } : d));
        toast.success("Device assigned to hospital");
        setAssignDeviceId(null);
        setAssignHospitalId("");
      } else {
        const err = await res.json().catch(() => ({ detail: "Assignment failed" }));
        toast.error(err.detail ?? "Assignment failed");
      }
    } catch { toast.error("Network error"); }
    finally { setAssigning(false); }
  };

  const handleUnassign = async (deviceId) => {
    try {
      const res = await authFetch(`${BACKEND_URL}/api/devices/${deviceId}/unassign`, { method: "PATCH" });
      if (res.ok) {
        setDevices(prev => prev.map(d => d.device_id === deviceId ? { ...d, hospital_id: null, patient_id: null } : d));
        toast.success("Device returned to pool");
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed" }));
        toast.error(err.detail ?? "Unassign failed");
      }
    } catch { toast.error("Network error"); }
  };

  const unassigned = devices.filter(d => !d.hospital_id);
  const assigned   = devices.filter(d => d.hospital_id);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Radio className="w-6 h-6 text-slate-600" />
          <h1 className="text-2xl font-bold text-slate-900">Devices</h1>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setRegisterOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Register device
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
        </div>
      ) : devices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-400">
            No devices registered yet.{isSuperAdmin && " Click 'Register device' to add one."}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Assigned devices */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Assigned to hospitals ({assigned.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {assigned.length === 0 ? (
                <p className="p-6 text-slate-400 text-sm">No devices assigned yet.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {assigned.map(d => (
                    <div key={d.device_id} className="px-6 py-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{d.device_serial}</p>
                        <p className="text-xs text-slate-500">{d.device_type} · Hospital: {d.hospital_id}</p>
                        {d.patient_id && <p className="text-xs text-blue-600">Linked to patient: {d.patient_id}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Assigned</Badge>
                        {isSuperAdmin && (
                          <Button variant="ghost" size="sm" onClick={() => handleUnassign(d.device_id)} className="gap-1.5">
                            <RotateCcw className="w-3.5 h-3.5" /> Unassign
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Unassigned devices (superadmin only) */}
          {isSuperAdmin && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserCircle className="w-4 h-4" /> Unassigned pool ({unassigned.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {unassigned.length === 0 ? (
                  <p className="p-6 text-slate-400 text-sm">All devices are assigned.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {unassigned.map(d => (
                      <div key={d.device_id} className="px-6 py-4 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{d.device_serial}</p>
                          <p className="text-xs text-slate-500">{d.device_type}{d.firmware_version ? ` · FW ${d.firmware_version}` : ""}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setAssignDeviceId(d.device_id)} className="gap-1.5">
                          <Building2 className="w-3.5 h-3.5" /> Assign to hospital
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Register device dialog */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Register new device</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1"><Label>Serial number *</Label><Input placeholder="SN-12345" value={regForm.device_serial} onChange={e => setRegForm(f => ({ ...f, device_serial: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Device type</Label><Input placeholder="sleep_monitor" value={regForm.device_type} onChange={e => setRegForm(f => ({ ...f, device_type: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Firmware version</Label><Input placeholder="v1.0.3" value={regForm.firmware_version} onChange={e => setRegForm(f => ({ ...f, firmware_version: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setRegisterOpen(false)}>Cancel</Button>
            <Button onClick={handleRegister} disabled={registering}>{registering ? "Registering…" : "Register"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign to hospital dialog */}
      <Dialog open={!!assignDeviceId} onOpenChange={() => setAssignDeviceId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Assign to hospital</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Hospital ID</Label>
              <Input placeholder="hospital_abc123" value={assignHospitalId} onChange={e => setAssignHospitalId(e.target.value)} />
              <p className="text-xs text-slate-500">Copy from the Hospitals page.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setAssignDeviceId(null)}>Cancel</Button>
            <Button onClick={handleAssignHospital} disabled={assigning}>{assigning ? "Assigning…" : "Assign"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
