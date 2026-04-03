// src/pages/HospitalManagement.js

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Copy, Building2, Trash2 } from "lucide-react";
import { authFetch } from "@/utils/authFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API = process.env.REACT_APP_BACKEND_URL;

// ─── Inline toggle switch (no external dep) ───────────────────────────────────
function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-indigo-500 focus-visible:ring-offset-2
        disabled:cursor-not-allowed disabled:opacity-50
        ${checked ? "bg-green-500" : "bg-slate-300"}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow
          ring-0 transition-transform duration-200 ease-in-out
          ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

// ─── Shake animation injected once ────────────────────────────────────────────
const SHAKE_STYLE = `
@keyframes hm-shake {
  0%,100% { transform: translateX(0); }
  20%      { transform: translateX(-6px); }
  40%      { transform: translateX(6px); }
  60%      { transform: translateX(-4px); }
  80%      { transform: translateX(4px); }
}
.hm-shake { animation: hm-shake 0.4s ease-in-out; }
`;

export default function HospitalManagement() {
  // ── inject shake keyframe once ──
  useEffect(() => {
    const id = "hm-shake-style";
    if (!document.getElementById(id)) {
      const s = document.createElement("style");
      s.id = id;
      s.textContent = SHAKE_STYLE;
      document.head.appendChild(s);
    }
  }, []);

  // ── list state ──
  const [hospitals, setHospitals]   = useState([]);
  const [loading,   setLoading]     = useState(true);

  // ── form state ──
  const [form,     setForm]     = useState({ name: "", address: "" });
  const [errors,   setErrors]   = useState({ name: "", address: "" });
  const [creating, setCreating] = useState(false);
  const [shake,    setShake]    = useState(false);
  const nameRef = useRef(null);

  // ── per-hospital pending states (for toggle / delete) ──
  const [toggling, setToggling] = useState({});  // { hospitalId: true }
  const [deleting, setDeleting] = useState({});  // { hospitalId: true }

  // ─── Load hospitals ──────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch(`${API}/api/hospitals`);
        if (res.ok) setHospitals(await res.json());
        else        toast.error("Failed to load hospitals");
      } catch {
        toast.error("Network error — could not load hospitals");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ─── Field validation ────────────────────────────────────────────────────
  const validate = (field, value) => {
    if (field === "name") {
      if (!value.trim())              return "Please enter hospital name";
      if (value.trim().length < 2)    return "Hospital name must be at least 2 characters";
      if (value.trim().length > 100)  return "Hospital name cannot exceed 100 characters";
    }
    return "";
  };

  const handleChange = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    // Clear error as soon as user types
    if (errors[field]) {
      setErrors(e => ({ ...e, [field]: validate(field, value) }));
    }
  };

  const handleBlur = (field) => {
    setErrors(e => ({ ...e, [field]: validate(field, form[field]) }));
  };

  // ─── Create hospital ─────────────────────────────────────────────────────
  const handleCreate = async () => {
    const nameErr = validate("name", form.name);
    if (nameErr) {
      setErrors(e => ({ ...e, name: nameErr }));
      // Shake + focus
      setShake(true);
      setTimeout(() => setShake(false), 450);
      nameRef.current?.focus();
      return;
    }

    setCreating(true);
    try {
      const res = await authFetch(`${API}/api/hospitals`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: form.name.trim(), address: form.address.trim() || undefined }),
      });
      if (res.ok) {
        const h = await res.json();
        setHospitals(prev => [h, ...prev]);
        setForm({ name: "", address: "" });
        setErrors({ name: "", address: "" });
        toast.success(`Hospital "${h.name}" created`);
      } else {
        const err = await res.json().catch(() => ({}));
        if (res.status === 401) toast.error("Session expired — please log in again.");
        else if (res.status === 403) toast.error("Permission denied — superadmin only.");
        else toast.error(err.detail ?? "Failed to create hospital");
      }
    } catch {
      toast.error("Network error — check your connection.");
    } finally {
      setCreating(false);
    }
  };

  // ─── Toggle active/inactive (optimistic) ────────────────────────────────
  const handleToggle = async (hospitalId, currentActive) => {
    const newActive = !currentActive;

    // Optimistic update
    setHospitals(prev => prev.map(h =>
      h.hospital_id === hospitalId ? { ...h, is_active: newActive } : h
    ));
    setToggling(t => ({ ...t, [hospitalId]: true }));

    try {
      const res = await authFetch(`${API}/api/hospitals/${hospitalId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ is_active: newActive }),
      });
      if (!res.ok) throw new Error("api");
    } catch {
      // Revert
      setHospitals(prev => prev.map(h =>
        h.hospital_id === hospitalId ? { ...h, is_active: currentActive } : h
      ));
      toast.error("Failed to update hospital status");
    } finally {
      setToggling(t => ({ ...t, [hospitalId]: false }));
    }
  };

  // ─── Delete hospital ─────────────────────────────────────────────────────
  const handleDelete = async (hospitalId, hospitalName) => {
    const confirmed = window.confirm(
      `Delete "${hospitalName}"?\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(d => ({ ...d, [hospitalId]: true }));
    try {
      const res = await authFetch(`${API}/api/hospitals/${hospitalId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setHospitals(prev => prev.filter(h => h.hospital_id !== hospitalId));
        toast.success(`"${hospitalName}" deleted`);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail ?? "Failed to delete hospital");
      }
    } catch {
      toast.error("Network error — could not delete hospital");
    } finally {
      setDeleting(d => ({ ...d, [hospitalId]: false }));
    }
  };

  // ─── Copy to clipboard ───────────────────────────────────────────────────
  const copyId = (id) => {
    navigator.clipboard.writeText(id)
      .then(() => toast.success("Hospital ID copied"))
      .catch(() => toast.error("Copy failed"));
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Building2 className="w-6 h-6 text-slate-600" />
        <h1 className="text-2xl font-bold text-slate-900">Hospitals</h1>
      </div>

      {/* ── Create form ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add new hospital</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Hospital Name */}
            <div className="space-y-1">
              <Label htmlFor="hospital-name">Hospital name *</Label>
              <Input
                id="hospital-name"
                ref={nameRef}
                value={form.name}
                onChange={e => handleChange("name", e.target.value)}
                onBlur={() => handleBlur("name")}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                placeholder="City General Hospital"
                disabled={creating}
                className={`${shake ? "hm-shake" : ""} ${errors.name ? "border-red-500 focus-visible:ring-red-400" : ""}`}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "name-error" : undefined}
              />
              {errors.name && (
                <p id="name-error" className="text-red-500 text-xs mt-1 flex items-center gap-1">
                  <span>⚠</span> {errors.name}
                </p>
              )}
            </div>

            {/* Address (optional) */}
            <div className="space-y-1">
              <Label htmlFor="hospital-address">Address <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Input
                id="hospital-address"
                value={form.address}
                onChange={e => handleChange("address", e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                placeholder="123 Medical Drive"
                disabled={creating}
              />
            </div>
          </div>

          <Button
            onClick={handleCreate}
            disabled={creating}
            className="min-w-[140px]"
          >
            {creating ? "Creating…" : "Create hospital"}
          </Button>
        </CardContent>
      </Card>

      {/* ── Hospital list ── */}
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
                <div key={h.hospital_id} className="py-4 flex items-center justify-between gap-4">

                  {/* Left: info */}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{h.name}</p>
                    {h.address && (
                      <p className="text-sm text-slate-500 mt-0.5">{h.address}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs text-slate-400 font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        {h.hospital_id}
                      </code>
                      <button
                        onClick={() => copyId(h.hospital_id)}
                        className="text-slate-400 hover:text-indigo-600 transition-colors"
                        title="Copy hospital ID"
                        aria-label={`Copy ID for ${h.name}`}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-4 shrink-0">

                    {/* Toggle */}
                    <div className="flex items-center gap-2">
                      <ToggleSwitch
                        checked={h.is_active}
                        onChange={() => handleToggle(h.hospital_id, h.is_active)}
                        disabled={toggling[h.hospital_id]}
                      />
                      <span className={`text-sm font-medium w-14 ${h.is_active ? "text-green-600" : "text-slate-400"}`}>
                        {h.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(h.hospital_id, h.name)}
                      disabled={deleting[h.hospital_id]}
                      className="text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
                      title="Delete hospital"
                      aria-label={`Delete ${h.name}`}
                    >
                      {deleting[h.hospital_id]
                        ? <span className="text-xs text-slate-400">…</span>
                        : <Trash2 className="w-4 h-4" />
                      }
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
