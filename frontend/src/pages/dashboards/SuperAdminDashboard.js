// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/pages/dashboards/SuperAdminDashboard.js
// PURPOSE: System overview dashboard for superadmins.
//          Shows hospital count, user counts by role, quick action links.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Building2, Users, UserCircle, Shield, Stethoscope, ArrowRight
} from "lucide-react";
import { authFetch } from "@/utils/authFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [hosRes, usersRes, patientsRes] = await Promise.all([
          authFetch(`${BACKEND_URL}/api/hospitals`),
          authFetch(`${BACKEND_URL}/api/users`),
          authFetch(`${BACKEND_URL}/api/patients`),
        ]);
        const hospitals = hosRes.ok ? await hosRes.json() : [];
        const users     = usersRes.ok ? await usersRes.json() : [];
        const patients  = patientsRes.ok ? await patientsRes.json() : [];

        setStats({
          hospitals: hospitals.length,
          totalUsers: users.length,
          admins: users.filter(u => u.role === "hospital_admin").length,
          staff: users.filter(u => u.role === "staff").length,
          patients: patients.length,
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

  const cards = [
    { label: "Hospitals",      value: stats?.hospitals ?? 0,   icon: Building2,   color: "text-purple-600 bg-purple-100", link: "/hospitals" },
    { label: "Total Users",    value: stats?.totalUsers ?? 0,  icon: Users,        color: "text-blue-600 bg-blue-100",     link: "/users" },
    { label: "Hospital Admins",value: stats?.admins ?? 0,      icon: Shield,       color: "text-teal-600 bg-teal-100",     link: "/users" },
    { label: "Staff",          value: stats?.staff ?? 0,       icon: Stethoscope,  color: "text-green-600 bg-green-100",   link: "/users" },
    { label: "Patients",       value: stats?.patients ?? 0,    icon: UserCircle,   color: "text-orange-600 bg-orange-100", link: "/patients" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">System Overview</h1>
        <p className="text-slate-500 mt-1">Global view across all hospitals</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(c => (
          <Link key={c.label} to={c.link}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">{c.label}</p>
                    <p className="text-3xl font-bold text-slate-900 mt-1">{c.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${c.color}`}>
                    <c.icon className="w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link to="/hospitals">
            <Button variant="outline" className="gap-2">
              <Building2 className="w-4 h-4" /> Manage Hospitals <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
          <Link to="/users">
            <Button variant="outline" className="gap-2">
              <Users className="w-4 h-4" /> Manage Users <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
          <Link to="/devices">
            <Button variant="outline" className="gap-2">
              <Shield className="w-4 h-4" /> Manage Devices <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
