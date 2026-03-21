// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/pages/UserManagement.js
// PURPOSE: Lists users scoped to the current user's hospital.
//          Superadmin sees all users. Hospital admin sees their hospital only.
//          "Add user" button opens CreateUserModal.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Users, UserPlus } from "lucide-react";
import { authFetch } from "@/utils/authFetch";
import { usePermissions } from "@/hooks/usePermissions";
import { RoleBadge } from "@/components/RoleBadge";
import { CreateUserModal } from "@/components/CreateUserModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function UserManagement() {
  const { isAdmin, canCreate } = usePermissions();
  const [users,     setUsers]     = useState([]);
  const [filtered,  setFiltered]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [search,    setSearch]    = useState("");

  // ─── Load users ───────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch(`${process.env.REACT_APP_BACKEND_URL}/api/users`);
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

  // Show Add user button if the user can create any role
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
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{u.name}</p>
                    <p className="text-sm text-slate-500 truncate">{u.email}</p>
                    {u.username && (
                      <p className="text-xs text-slate-400">@{u.username}</p>
                    )}
                  </div>
                  <RoleBadge role={u.role} />
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
    </div>
  );
}
