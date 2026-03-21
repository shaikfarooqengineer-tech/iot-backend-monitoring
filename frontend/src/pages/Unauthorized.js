// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/pages/Unauthorized.js
// PURPOSE: Shown when a user navigates to a route they don't have access to.
//          "Go home" button redirects to the user's role-appropriate home.
// ═══════════════════════════════════════════════════════════════════════════

import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ROLE_HOME } from "@/constants/roles";
import { Button } from "@/components/ui/button";
import { ShieldOff } from "lucide-react";

export default function Unauthorized() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4">
      <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
        <ShieldOff className="w-8 h-8 text-red-400" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Access denied</h1>
      <p className="text-slate-500 max-w-sm text-sm">
        You don't have permission to view this page.
        Contact your administrator if you think this is a mistake.
      </p>
      <Button onClick={() => navigate(ROLE_HOME[user?.role] ?? "/login", { replace: true })}>
        Go to my home page
      </Button>
    </div>
  );
}
