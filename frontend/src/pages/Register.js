import { useState, useEffect } from 'react';
import { authFetch } from '@/utils/authFetch';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function Register() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    name: '',
    company_name: ''
  });

  useEffect(() => {
    const checkAdminExists = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/auth/check-admin`);
        const data = await response.json();
        if (data.admin_exists) {
          navigate('/login');
        }
      } catch (error) {
        console.error('Error checking admin:', error);
      }
    };
    checkAdminExists();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const response = await authFetch(`${BACKEND_URL}/api/auth/register-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
          email: formData.email,
          name: formData.name,
          company_name: formData.company_name
        })
      });

      if (response.ok) {
        const userData = await response.json();
        toast.success('Admin account created successfully!');
        navigate('/dashboard', { state: { user: userData } });
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Registration failed');
      }
    } catch (error) {
      toast.error('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center"
      style={{ backgroundImage: `url('https://images.unsplash.com/photo-1685602729277-54538940a06c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBtaW5pbWFsJTIwb2ZmaWNlJTIwYWJzdHJhY3QlMjBiYWNrZ3JvdW5kfGVufDB8fHx8MTc3MjcwOTI4Mnww&ixlib=rb-4.1.0&q=85')` }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-slate-900/30 to-violet-900/40"></div>
      
      <div className="relative w-full max-w-md">
        <div className="bg-white/90 backdrop-blur-md border border-slate-200 shadow-2xl rounded-2xl p-8">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Create Admin Account</h1>
            <p className="text-slate-600">Set up your ERP system</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="company_name">Company Name *</Label>
              <Input
                id="company_name"
                data-testid="company-name-input"
                value={formData.company_name}
                onChange={(e) => setFormData({...formData, company_name: e.target.value})}
                required
                placeholder="OLT Innovations"
              />
            </div>

            <div>
              <Label htmlFor="name">Your Full Name *</Label>
              <Input
                id="name"
                data-testid="name-input"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
                placeholder="John Doe"
              />
            </div>

            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                data-testid="email-input"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                required
                placeholder="admin@company.com"
              />
            </div>

            <div>
              <Label htmlFor="username">Username *</Label>
              <Input
                id="username"
                data-testid="username-input"
                value={formData.username}
                onChange={(e) => setFormData({...formData, username: e.target.value})}
                required
                placeholder="admin"
              />
            </div>

            <div>
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                data-testid="password-input"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                required
                placeholder="Minimum 6 characters"
              />
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <Input
                id="confirmPassword"
                type="password"
                data-testid="confirm-password-input"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                required
                placeholder="Re-enter password"
              />
            </div>

            <Button
              type="submit"
              data-testid="register-button"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-6 text-lg rounded-md shadow-sm"
            >
              {loading ? 'Creating Account...' : 'Create Admin Account'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
