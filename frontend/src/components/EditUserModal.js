// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/components/EditUserModal.js
// PURPOSE: Dual-mode edit modal. Shows standard user fields for all users,
//          plus medical fields (room, age, status) when editing a patient.
//          PATCHes to /api/users/:id or /api/patients/:id.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { authFetch } from "@/utils/authFetch";
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

export function EditUserModal({ open, onClose, user, onUpdated }) {
  const isPatient = user?.role === "patient";
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || "",
        email: user.email || "",
        username: user.username || "",
        ...(isPatient ? {
          room: user.room || "",
          age: user.age ?? "",
          status: user.status || "Admitted",
        } : {})
      });
    }
  }, [user, isPatient]);

  const set = (field) => (e) =>
    setForm(f => ({ ...f, [field]: e.target?.value ?? e }));

  const handleSubmit = async () => {
    if (!form.name?.trim()) { toast.error("Name is required"); return; }

    setLoading(true);
    try {
      const endpoint = isPatient
        ? `${BACKEND_URL}/api/patients/${user.user_id}`
        : `${BACKEND_URL}/api/users/${user.user_id}`;

      const payload = { ...form };
      if (isPatient && payload.age) payload.age = parseInt(payload.age, 10);

      const res = await authFetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const updated = await res.json();
        toast.success(`"${updated.name}" updated successfully`);
        onUpdated(updated);
        onClose();
      } else {
        const err = await res.json().catch(() => ({ detail: "Update failed" }));
        toast.error(err.detail ?? "Update failed");
      }
    } catch { toast.error("Network error"); }
    finally { setLoading(false); }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {isPatient ? "patient" : "user"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label>Full name</Label>
            <Input value={form.name || ""} onChange={set("name")} />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={form.email || ""} onChange={set("email")} />
          </div>
          <div className="space-y-1">
            <Label>Username</Label>
            <Input value={form.username || ""} onChange={set("username")} />
          </div>

          {isPatient && (
            <div className="border-t border-slate-200 pt-3">
              <p className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wider">Medical Details</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Room</Label>
                  <Input value={form.room || ""} onChange={set("room")} placeholder="Room 102" />
                </div>
                <div className="space-y-1">
                  <Label>Age</Label>
                  <Input type="number" value={form.age ?? ""} onChange={set("age")} />
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={form.status || "Admitted"} onValueChange={set("status")}>
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
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
