// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/pages/Devices.js
// PURPOSE: Device management page.
//   SuperAdmin:      register devices, assign to hospitals, assign to patients,
//                    view all devices, unassign.
//   Hospital Admin:  assign/unassign hospital-scoped devices to patients.
//   Staff (flagged): assign hospital-scoped devices to patients (read-only otherwise).
//   Patient:         blocked at router level — never reaches this page.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Radio, Plus, Building2, UserCheck, RotateCcw, RefreshCw, Trash2 } from "lucide-react";
import { authFetch } from "@/utils/authFetch";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// ─── Status badge helper ──────────────────────────────────────────────────────
function StatusBadge({ status }) {
  if (status === "assigned_to_patient") {
    return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>;
  }
  if (status === "assigned_to_hospital") {
    return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">In Pool</Badge>;
  }
  return <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200">Unassigned</Badge>;
}

// ─── Relative time helper ─────────────────────────────────────────────────────
function relativeTime(isoString) {
  if (!isoString) return "never";
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ═════════════════════════════════════════════════════════════════════════════
export default function Devices() {
  const {
    canRegisterDevices,
    canAssignHospital,
    canUnassignDevices,
    canAssignDevices,
  } = usePermissions();

  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Register form ────────────────────────────────────────────────────────
  const [registerOpen, setRegisterOpen] = useState(false);
  const [regForm, setRegForm] = useState({
    device_serial: "", device_type: "sleep_monitor", firmware_version: ""
  });
  const [registering, setRegistering] = useState(false);

  // ── Assign-to-hospital form ──────────────────────────────────────────────
  const [assignHospitalDeviceId, setAssignHospitalDeviceId] = useState(null);
  const [assignHospitalId, setAssignHospitalId] = useState("");
  const [assigningHospital, setAssigningHospital] = useState(false);

  // ── Assign-to-patient form ───────────────────────────────────────────────
  const [assignPatientDeviceId, setAssignPatientDeviceId] = useState(null);
  const [assignPatientId, setAssignPatientId] = useState("");
  const [assigningPatient, setAssigningPatient] = useState(false);

  // ─── Load devices ────────────────────────────────────────────────────────
  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${BACKEND_URL}/api/devices`);
      if (res.ok) setDevices(await res.json());
      else toast.error("Failed to load devices");
    } catch { toast.error("Network error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  // ─── Register device ─────────────────────────────────────────────────────
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

  // ─── Assign to hospital ───────────────────────────────────────────────────
  const handleAssignHospital = async () => {
    if (!assignHospitalId.trim()) { toast.error("Hospital ID is required"); return; }
    setAssigningHospital(true);
    try {
      const res = await authFetch(
        `${BACKEND_URL}/api/devices/${assignHospitalDeviceId}/assign-hospital`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hospital_id: assignHospitalId }),
        }
      );
      if (res.ok) {
        const updated = await res.json();
        setDevices(prev => prev.map(d => d.device_id === assignHospitalDeviceId ? { ...d, ...updated } : d));
        toast.success("Device assigned to hospital");
        setAssignHospitalDeviceId(null);
        setAssignHospitalId("");
      } else {
        const err = await res.json().catch(() => ({ detail: "Assignment failed" }));
        toast.error(err.detail ?? "Assignment failed");
      }
    } catch { toast.error("Network error"); }
    finally { setAssigningHospital(false); }
  };

  // ─── Assign to patient ────────────────────────────────────────────────────
  const handleAssignPatient = async () => {
    if (!assignPatientId.trim()) { toast.error("Patient ID is required"); return; }
    setAssigningPatient(true);
    try {
      const res = await authFetch(
        `${BACKEND_URL}/api/devices/${assignPatientDeviceId}/assign-patient`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patient_id: assignPatientId }),
        }
      );
      if (res.ok) {
        const updated = await res.json();
        setDevices(prev => prev.map(d => d.device_id === assignPatientDeviceId ? { ...d, ...updated } : d));
        toast.success("Device assigned to patient");
        setAssignPatientDeviceId(null);
        setAssignPatientId("");
      } else {
        const err = await res.json().catch(() => ({ detail: "Assignment failed" }));
        toast.error(err.detail ?? "Assignment failed");
      }
    } catch { toast.error("Network error"); }
    finally { setAssigningPatient(false); }
  };

  // ─── Unassign ─────────────────────────────────────────────────────────────
  const handleUnassign = async (deviceId) => {
    try {
      const res = await authFetch(
        `${BACKEND_URL}/api/devices/${deviceId}/unassign`,
        { method: "PATCH" }
      );
      if (res.ok) {
        const updated = await res.json();
        setDevices(prev => prev.map(d => d.device_id === deviceId ? { ...d, ...updated } : d));
        toast.success("Device returned to pool");
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed" }));
        toast.error(err.detail ?? "Unassign failed");
      }
    } catch { toast.error("Network error"); }
  };

  //────────────DeleteDevice────────────────────────────────────
  const handleDeleteDevice = async (deviceId) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this device?"
    );

    console.log("confirmed =", confirmed);
    console.log("deviceId =", deviceId);

    if (!confirmed) return;

    try {
      const res = await authFetch(
        `${BACKEND_URL}/api/devices/${deviceId}`,
        {
          method: "DELETE",
        }
      );

      console.log("status =", res.status);

      if (res.ok) {
        setDevices(prev =>
          prev.filter(d => d.device_id !== deviceId)
        );

        toast.success("Device deleted successfully");
      } else {
        const err = await res.json().catch(() => ({
          detail: "Delete failed"
        }));

        console.log("error =", err);

        toast.error(err.detail ?? "Delete failed");
      }
    } catch (error) {
      console.error(error);
      toast.error("Network error");
    }
  };

  // ─── Computed views ──────────────────────────────────────────────────────
  const unassigned = devices.filter(d => !d.hospital_id);
  const inPool = devices.filter(d => d.hospital_id && !d.assigned_patient_id);
  const activeOnPat = devices.filter(d => d.assigned_patient_id);

  // ─── Row component ────────────────────────────────────────────────────────
  const DeviceRow = ({ d }) => (
    <div className="px-6 py-4 flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-slate-900">{d.device_serial}</p>
          <StatusBadge status={d.status} />
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          {d.device_type}
          {d.firmware_version ? ` · FW ${d.firmware_version}` : ""}
          {d.hospital_id ? ` · Hospital: ${d.hospital_id}` : ""}
        </p>
        {d.assigned_patient_id && (
          <p className="text-xs text-indigo-600 mt-0.5">Patient: {d.assigned_patient_id}</p>
        )}
        {d.last_seen && (
          <p className="text-xs text-slate-400 mt-0.5">Last seen: {relativeTime(d.last_seen)}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Assign to hospital: SuperAdmin only, device not yet in a hospital */}
        {canAssignHospital && !d.hospital_id && (
          <Button
            id={`assign-hospital-${d.device_id}`}
            variant="outline" size="sm"
            onClick={() => { setAssignHospitalDeviceId(d.device_id); setAssignHospitalId(""); }}
            className="gap-1.5"
          >
            <Building2 className="w-3.5 h-3.5" /> Assign to hospital
          </Button>
        )}
        {/* Assign to patient: hospital devices not yet on a patient */}
        {canAssignDevices && d.hospital_id && !d.assigned_patient_id && (
          <Button
            id={`assign-patient-${d.device_id}`}
            variant="outline" size="sm"
            onClick={() => { setAssignPatientDeviceId(d.device_id); setAssignPatientId(""); }}
            className="gap-1.5"
          >
            <UserCheck className="w-3.5 h-3.5" /> Assign to patient
          </Button>
        )}
        {/* Unassign: only when device is on a patient */}
        {canUnassignDevices && d.assigned_patient_id && (
          <Button
            id={`unassign-${d.device_id}`}
            variant="ghost" size="sm"
            onClick={() => handleUnassign(d.device_id)}
            className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Unassign
          </Button>
        )}

        <button
          onClick={() => handleDeleteDevice(d.device_id)}
          className="text-red-500 hover:text-red-700"
        >
          <Trash2 className="w-4 h-4" />
        </button>

      </div>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Radio className="w-6 h-6 text-slate-600" />
          <h1 className="text-2xl font-bold text-slate-900">Devices</h1>
          <span className="text-sm text-slate-500">({devices.length} total)</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            id="refresh-devices"
            variant="outline" size="sm"
            onClick={loadDevices}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canRegisterDevices && (
            <Button id="register-device-btn" onClick={() => setRegisterOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Register device
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
        </div>
      ) : devices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-400">
            No devices registered yet.
            {canRegisterDevices && " Click 'Register device' to add one."}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Active: assigned to patient */}
          {activeOnPat.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-green-600" />
                  Assigned to patients ({activeOnPat.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  {activeOnPat.map(d => <DeviceRow key={d.device_id} d={d} />)}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Hospital pool: in hospital, not on patient */}
          {inPool.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  Hospital pool ({inPool.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  {inPool.map(d => <DeviceRow key={d.device_id} d={d} />)}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Global unassigned pool: SuperAdmin only */}
          {canRegisterDevices && unassigned.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Radio className="w-4 h-4 text-slate-400" />
                  Unassigned pool ({unassigned.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  {unassigned.map(d => <DeviceRow key={d.device_id} d={d} />)}
                </div>
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
            <div className="space-y-1">
              <Label htmlFor="reg-serial">Serial number *</Label>
              <Input
                id="reg-serial"
                placeholder="SN-12345"
                value={regForm.device_serial}
                onChange={e => setRegForm(f => ({ ...f, device_serial: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="reg-type">Device type</Label>
              <Input
                id="reg-type"
                placeholder="sleep_monitor"
                value={regForm.device_type}
                onChange={e => setRegForm(f => ({ ...f, device_type: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="reg-firmware">Firmware version</Label>
              <Input
                id="reg-firmware"
                placeholder="v1.0.3"
                value={regForm.firmware_version}
                onChange={e => setRegForm(f => ({ ...f, firmware_version: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setRegisterOpen(false)}>Cancel</Button>
            <Button id="confirm-register" onClick={handleRegister} disabled={registering}>
              {registering ? "Registering…" : "Register"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign to hospital dialog */}
      <Dialog open={!!assignHospitalDeviceId} onOpenChange={() => setAssignHospitalDeviceId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Assign to hospital</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label htmlFor="assign-hosp-id">Hospital ID</Label>
              <Input
                id="assign-hosp-id"
                placeholder="hospital_abc123"
                value={assignHospitalId}
                onChange={e => setAssignHospitalId(e.target.value)}
              />
              <p className="text-xs text-slate-500">Copy from the Hospitals page.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setAssignHospitalDeviceId(null)}>Cancel</Button>
            <Button id="confirm-assign-hospital" onClick={handleAssignHospital} disabled={assigningHospital}>
              {assigningHospital ? "Assigning…" : "Assign"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign to patient dialog */}
      <Dialog open={!!assignPatientDeviceId} onOpenChange={() => setAssignPatientDeviceId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Assign device to patient</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label htmlFor="assign-pat-id">Patient ID</Label>
              <Input
                id="assign-pat-id"
                placeholder="user_abc123"
                value={assignPatientId}
                onChange={e => setAssignPatientId(e.target.value)}
              />
              <p className="text-xs text-slate-500">Copy from the Patients page.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setAssignPatientDeviceId(null)}>Cancel</Button>
            <Button id="confirm-assign-patient" onClick={handleAssignPatient} disabled={assigningPatient}>
              {assigningPatient ? "Assigning…" : "Assign to patient"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
