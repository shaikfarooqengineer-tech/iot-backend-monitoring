// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/pages/UserManagement.js
// PURPOSE: Lists users scoped to the current user's hospital.
//          Superadmin sees all users. Hospital admin sees their hospital only.
//          Features: Add user, edit user, delete user, toggle permissions.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Users, UserPlus, Pencil, Trash2 } from "lucide-react";
import { authFetch } from "@/utils/authFetch";
import { usePermissions } from "@/hooks/usePermissions";
import { RoleBadge } from "@/components/RoleBadge";
import { CreateUserModal } from "@/components/CreateUserModal";
import { EditUserModal } from "@/components/EditUserModal";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function UserManagement() {
  const { isAdmin, isSuperAdmin, isHospitalAdmin, canCreate } = usePermissions();
  const [users,     setUsers]     = useState([]);
  const [filtered,  setFiltered]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [search,    setSearch]    = useState("");

  // Edit / Delete state
  const [editUser,   setEditUser]   = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);
  const [deleting,   setDeleting]   = useState(false);

  // ─── Load users ───────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch(`${BACKEND_URL}/api/users`);
        if (res.ok) {
          const data = await res.json();
          setUsers(data);
          setFiltered(data);
        } else toast.error("Failed to load users");
      } catch { toast.error("Network error"); }
      finally  { setLoading(false); }
    };
    load();
  }, []);

  // ─── Search filter ────────────────────────────────────────────────────────
  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      q ? users.filter(u =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.username?.toLowerCase().includes(q)
      ) : users
    );
  }, [search, users]);

  const handleUserCreated = (newUser) => setUsers(u => [newUser, ...u]);

  const handleUserUpdated = (updated) => {
    setUsers(prev => prev.map(u => u.user_id === updated.user_id ? { ...u, ...updated } : u));
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    setDeleting(true);
    try {
      const res = await authFetch(`${BACKEND_URL}/api/users/${deleteUser.user_id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(`"${deleteUser.name}" deleted successfully`);
        setUsers(prev => prev.filter(u => u.user_id !== deleteUser.user_id));
        setDeleteUser(null);
      } else {
        const err = await res.json().catch(() => ({ detail: "Delete failed" }));
        toast.error(err.detail ?? "Delete failed");
      }
    } catch { toast.error("Network error"); }
    finally { setDeleting(false); }
  };

  // ─── Toggle can_create_patients ───────────────────────────────────────────
  const togglePermission = async (userId, currentValue) => {
    try {
      const res = await authFetch(`${BACKEND_URL}/api/users/${userId}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ can_create_patients: !currentValue }),
      });
      if (res.ok) {
        setUsers(prev => prev.map(u =>
          u.user_id === userId ? { ...u, can_create_patients: !currentValue } : u
        ));
        toast.success(`Permission updated`);
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed" }));
        toast.error(err.detail ?? "Failed to update permission");
      }
    } catch { toast.error("Network error"); }
  };

  const showAddButton = isAdmin || canCreate("patient");

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-slate-600" />
          <h1 className="text-2xl font-bold text-slate-900">User management</h1>
        </div>
        {showAddButton && (
          <Button onClick={() => setModalOpen(true)} className="gap-2">
            <UserPlus className="w-4 h-4" /> Add user
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">
              {filtered.length} of {users.length} users
            </CardTitle>
            <Input
              placeholder="Search by name, email, username…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full sm:w-64"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-slate-500 text-sm">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-slate-400 text-sm">
              {search ? "No users match your search." : "No users yet."}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map(u => (
                <div key={u.user_id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900 truncate">{u.name}</p>
                    <p className="text-sm text-slate-500 truncate">{u.email}</p>
                    {u.username && (
                      <p className="text-xs text-slate-400">@{u.username}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Permission toggle for staff (visible to admins only) */}
                    {u.role === "staff" && (isSuperAdmin || isHospitalAdmin) && (
                      <div className="flex items-center gap-2 mr-2">
                        <span className="text-xs text-slate-500 whitespace-nowrap">Can create patients</span>
                        <Switch
                          checked={u.can_create_patients !== false}
                          onCheckedChange={() => togglePermission(u.user_id, u.can_create_patients !== false)}
                          data-testid={`permission-toggle-${u.user_id}`}
                        />
                      </div>
                    )}

                    <RoleBadge role={u.role} />

                    {isAdmin && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => setEditUser(u)} data-testid={`edit-user-${u.user_id}`}>
                          <Pencil className="w-4 h-4 text-slate-500" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteUser(u)} data-testid={`delete-user-${u.user_id}`}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateUserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleUserCreated}
      />

      <EditUserModal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        user={editUser}
        onUpdated={handleUserUpdated}
      />

      <DeleteConfirmDialog
        open={!!deleteUser}
        onClose={() => setDeleteUser(null)}
        onConfirm={handleDelete}
        userName={deleteUser?.name}
        loading={deleting}
      />
    </div>
  );
}
