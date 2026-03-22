// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/components/CreatePatientModal.js
// PURPOSE: Dedicated patient admission form with standard + medical fields.
//          Posts to POST /api/patients.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { toast } from "sonner";
import { authFetch } from "@/utils/authFetch";
import { emailError, passwordError, requiredError, firstError } from "@/utils/validation";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { Label }  from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const initialForm = {
  username: "", password: "", email: "", name: "",
  room: "", age: "", status: "Admitted",
};

export function CreatePatientModal({ open, onClose, onCreated }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(initialForm);

  const set = (field) => (e) =>
    setForm(f => ({ ...f, [field]: e.target?.value ?? e }));

  const handleSubmit = async () => {
    const err = firstError(
      requiredError(form.name, "Patient name"),
      emailError(form.email),
      requiredError(form.username, "Username"),
      passwordError(form.password),
    );
    if (err) { toast.error(err); return; }

    setLoading(true);
    try {
      const payload = {
        ...form,
        age: form.age ? parseInt(form.age, 10) : null,
      };
      const res = await authFetch(`${BACKEND_URL}/api/patients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const newPatient = await res.json();
        toast.success(`Patient "${newPatient.name}" admitted successfully`);
        onCreated(newPatient);
        onClose();
        setForm(initialForm);
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed to create patient" }));
        toast.error(err.detail ?? "Failed to create patient");
      }
    } catch { toast.error("Network error — please try again"); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Admit new patient</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Full name *</Label>
              <Input placeholder="Mary Johnson" value={form.name} onChange={set("name")} />
            </div>
            <div className="space-y-1">
              <Label>Email *</Label>
              <Input type="email" placeholder="patient@email.com" value={form.email} onChange={set("email")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Username *</Label>
              <Input placeholder="patient_username" value={form.username} onChange={set("username")} />
            </div>
            <div className="space-y-1">
              <Label>Password *</Label>
              <Input type="password" placeholder="Min. 6 characters" value={form.password} onChange={set("password")} />
            </div>
          </div>

          <div className="border-t border-slate-200 pt-3">
            <p className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wider">Medical Details</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Room</Label>
                <Input placeholder="Room 102" value={form.room} onChange={set("room")} />
              </div>
              <div className="space-y-1">
                <Label>Age</Label>
                <Input type="number" placeholder="72" value={form.age} onChange={set("age")} />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={set("status")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Admitted">Admitted</SelectItem>
                    <SelectItem value="Under Observation">Under Observation</SelectItem>
                    <SelectItem value="Stable">Stable</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                    <SelectItem value="Discharged">Discharged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Admitting…" : "Admit patient"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
