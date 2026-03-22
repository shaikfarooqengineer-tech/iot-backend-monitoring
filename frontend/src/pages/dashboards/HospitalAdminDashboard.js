// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/pages/dashboards/HospitalAdminDashboard.js
// PURPOSE: Hospital-scoped overview for hospital admins.
//          Shows staff/patient counts, quick admit, management links.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Users, UserCircle, Stethoscope, ArrowRight, UserPlus } from "lucide-react";
import { authFetch } from "@/utils/authFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function HospitalAdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [usersRes, patientsRes] = await Promise.all([
          authFetch(`${BACKEND_URL}/api/users`),
          authFetch(`${BACKEND_URL}/api/patients`),
        ]);
        const users    = usersRes.ok ? await usersRes.json() : [];
        const patients = patientsRes.ok ? await patientsRes.json() : [];

        setStats({
          totalUsers: users.length,
          staff: users.filter(u => u.role === "staff").length,
          admins: users.filter(u => u.role === "hospital_admin").length,
          patients: patients.length,
          critical: patients.filter(p => p.status === "Critical").length,
          admitted: patients.filter(p => p.status === "Admitted").length,
        });
      } catch { toast.error("Failed to load dashboard data"); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Hospital Dashboard</h1>
        <p className="text-slate-500 mt-1">Operational overview of your hospital</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Staff</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.staff ?? 0}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <Stethoscope className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Patients</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.patients ?? 0}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center">
                <UserCircle className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Currently Admitted</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.admitted ?? 0}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                <Users className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={stats?.critical > 0 ? "border-red-200 bg-red-50/30" : ""}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Critical</p>
                <p className={`text-3xl font-bold mt-1 ${stats?.critical > 0 ? "text-red-600" : "text-slate-900"}`}>
                  {stats?.critical ?? 0}
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center">
                <UserCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link to="/patients">
            <Button variant="outline" className="gap-2">
              <UserPlus className="w-4 h-4" /> Admit Patient <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
          <Link to="/users">
            <Button variant="outline" className="gap-2">
              <Users className="w-4 h-4" /> Manage Staff <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
          <Link to="/devices">
            <Button variant="outline" className="gap-2">
              <Stethoscope className="w-4 h-4" /> View Devices <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
