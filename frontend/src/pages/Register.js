// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/pages/Register.js
// PURPOSE: One-time bootstrap form to create the first superadmin account.
//          Redirects to /login if a superadmin already exists.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { authFetch } from "@/utils/authFetch";
import { useAuth } from "@/context/AuthContext";
import { emailError, passwordError, confirmPasswordError, requiredError, firstError } from "@/utils/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function Register() {
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const [checking, setChecking] = useState(true);  // checking if admin already exists
  const [loading,  setLoading]  = useState(false);
  const [form, setForm] = useState({
    company_name: "",
    name: "",
    email: "",
    username: "",
    password: "",
    confirm_password: "",
  });

  // ─── Guard: if superadmin already exists, send to login ─────────────────
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const res = await authFetch(`${process.env.REACT_APP_BACKEND_URL}/api/auth/check-admin`);
        if (res.ok) {
          const { admin_exists } = await res.json();
          if (admin_exists) {
            toast.info("System already configured. Please sign in.");
            navigate("/login", { replace: true });
          }
        }
      } catch {
        // Network error — show the form anyway and let submit handle it
      } finally {
        setChecking(false);
      }
    };
    checkAdmin();
  }, [navigate]);

  // ─── Field updater ────────────────────────────────────────────────────────
  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Client-side validation
    const err = firstError(
      requiredError(form.company_name, "Company / Hospital name"),
      requiredError(form.name, "Full name"),
      emailError(form.email),
      requiredError(form.username, "Username"),
      passwordError(form.password),
      confirmPasswordError(form.password, form.confirm_password),
    );
    if (err) {
      toast.error(err);
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/auth/register-admin`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          // confirm_password is NOT sent — backend doesn't need it
          body: JSON.stringify({
            company_name: form.company_name,
            name:         form.name,
            email:        form.email,
            username:     form.username,
            password:     form.password,
          }),
        }
      );

      if (res.ok) {
        const userData = await res.json();
        // Store session token from login response
        if (userData.session_token) {
          localStorage.setItem("session_token", userData.session_token);
        }
        setUser(userData);  // update global auth context immediately
        toast.success("Superadmin account created! Welcome to VitalSync.");
        navigate("/hospitals", { replace: true });
      } else {
        const err = await res.json().catch(() => ({ detail: "Registration failed" }));
        toast.error(err.detail ?? "Registration failed");
      }
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  // ─── Loading state while checking existing admin ─────────────────────────
  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  // ─── Registration form ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center mx-auto mb-3">
            <span className="text-white text-xl font-bold">V</span>
          </div>
          <CardTitle className="text-2xl">Set up VitalSync</CardTitle>
          <CardDescription>
            Create the first superadmin account. This can only be done once.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label>Company name</Label>
              <Input
                placeholder="Acme Health Solutions"
                value={form.company_name}
                onChange={set("company_name")}
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <Label>Your full name</Label>
              <Input
                placeholder="Dr. Jane Smith"
                value={form.name}
                onChange={set("name")}
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="admin@company.com"
                value={form.email}
                onChange={set("email")}
                disabled={loading}
              />
            </div>

            <div className="space-y-1">
              <Label>Username</Label>
              <Input
                placeholder="admin_username"
                value={form.username}
                onChange={set("username")}
                disabled={loading}
                autoComplete="username"
              />
            </div>

            <div className="space-y-1">
              <Label>Password</Label>
              <Input
                type="password"
                placeholder="Minimum 6 characters"
                value={form.password}
                onChange={set("password")}
                disabled={loading}
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-1">
              <Label>Confirm password</Label>
              <Input
                type="password"
                placeholder="Re-enter password"
                value={form.confirm_password}
                onChange={set("confirm_password")}
                disabled={loading}
                autoComplete="new-password"
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account…" : "Create superadmin account"}
            </Button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-4">
            Already set up?{" "}
            <Link to="/login" className="text-indigo-600 hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
