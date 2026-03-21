// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/components/CreateUserModal.js
// PURPOSE: Role-aware add-user modal. Role dropdown only shows roles the
//          current user is permitted to create. hospital_id field only
//          appears when superadmin creates a hospital_admin.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { toast } from "sonner";
import { authFetch } from "@/utils/authFetch";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { CREATABLE_ROLES, ROLE_META, ROLES } from "@/constants/roles";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

export function CreateUserModal({ open, onClose, onCreated }) {
  const { user } = useAuth();
  const { role, isSuperAdmin } = usePermissions();
  const creatableRoles = CREATABLE_ROLES[role] ?? [];

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    username:    "",
    password:    "",
    email:       "",
    name:        "",
    role:        creatableRoles[0] ?? "",
    hospital_id: user?.hospital_id ?? "",
  });

  const set = (field) => (e) =>
    setForm(f => ({ ...f, [field]: e.target?.value ?? e }));

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.username || !form.password || !form.email || !form.name || !form.role) {
      toast.error("All fields are required");
      return;
    }
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    // Superadmin creating hospital_admin must supply a hospital_id
    if (isSuperAdmin && form.role === ROLES.HOSPITAL_ADMIN && !form.hospital_id) {
      toast.error("Please enter the hospital ID for this admin");
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/auth/create-user`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(form),
        }
      );
      if (res.ok) {
        const newUser = await res.json();
        toast.success(`"${newUser.name}" created successfully`);
        onCreated(newUser);
        onClose();
        setForm({ username: "", password: "", email: "", name: "",
          role: creatableRoles[0] ?? "", hospital_id: user?.hospital_id ?? "" });
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed to create user" }));
        if (res.status === 401) {
          toast.error("Session expired. Please log in again.");
        } else if (res.status === 403) {
          toast.error("You don't have permission to do this.");
        } else {
          toast.error(err.detail ?? "Failed to create user");
        }
      }
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add new user</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label>Full name</Label>
            <Input placeholder="Dr. Sarah Chen" value={form.name} onChange={set("name")} />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" placeholder="user@hospital.com" value={form.email} onChange={set("email")} />
          </div>
          <div className="space-y-1">
            <Label>Username</Label>
            <Input placeholder="login_username" value={form.username} onChange={set("username")} />
          </div>
          <div className="space-y-1">
            <Label>Password</Label>
            <Input type="password" placeholder="Min. 6 characters" value={form.password} onChange={set("password")} />
          </div>

          {/* Role selector — only shows creatable roles for current user's level */}
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={set("role")}>
              <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                {creatableRoles.map(r => (
                  <SelectItem key={r} value={r}>{ROLE_META[r]?.label ?? r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* hospital_id only shown when superadmin creates a hospital_admin */}
          {isSuperAdmin && form.role === ROLES.HOSPITAL_ADMIN && (
            <div className="space-y-1">
              <Label>Hospital ID</Label>
              <Input
                placeholder="hospital_abc123"
                value={form.hospital_id}
                onChange={set("hospital_id")}
              />
              <p className="text-xs text-slate-500">
                Copy the hospital_id from the Hospitals page.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Creating…" : "Create user"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
