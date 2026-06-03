import { useState, useEffect } from 'react';
import { authFetch } from '@/utils/authFetch';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { ROLE_HOME } from '@/constants/roles';
import { Eye, EyeOff } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;


export default function NewLogin() {
  const navigate = useNavigate();
  const { setUser, saveToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetUsername, setResetUsername] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [generatedToken, setGeneratedToken] = useState('');
  const [formData, setFormData] = useState({ username: '', password: '' });

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await authFetch(`${BACKEND_URL}/api/auth/me`);
        if (response.ok) navigate('/dashboard');
      } catch (error) { /* Not authenticated */ }
    };
    checkAuth();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const userData = await response.json();
        if (userData.session_token) saveToken(userData.session_token);
        setUser(userData);
        toast.success(`Welcome back, ${userData.name}!`);
        navigate(ROLE_HOME[userData.role] ?? '/dashboard', { replace: true });
      } else {
        const error = await response.json();
        setLoginError(error.detail || 'Invalid credentials');
      }
    } catch (error) {
      setLoginError('Login failed. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReset = async (e) => {
    e.preventDefault();
    if (!resetUsername.trim()) { toast.error('Please enter your username'); return; }
    setResetLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/request-password-reset`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: resetUsername })
      });
      const data = await response.json();
      if (response.ok) {
        if (data.token) { setGeneratedToken(data.token); toast.success('Reset token generated!'); }
        else toast.info(data.message);
        setResetStep(2);
      } else {
        toast.error(data.detail || 'Failed to request reset');
      }
    } catch (error) { toast.error('Failed to request password reset'); }
    finally { setResetLoading(false); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    const tokenToUse = resetToken || generatedToken;
    if (!tokenToUse?.trim()) { toast.error('Please enter the reset token'); return; }
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setResetLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenToUse, new_password: newPassword })
      });
      const data = await response.json();
      if (response.ok) { toast.success('Password reset successfully! You can now login.'); closeForgotPasswordModal(); }
      else toast.error(data.detail || 'Failed to reset password');
    } catch (error) { toast.error('Failed to reset password'); }
    finally { setResetLoading(false); }
  };

  const closeForgotPasswordModal = () => {
    setShowForgotPassword(false); setResetStep(1); setResetUsername('');
    setResetToken(''); setNewPassword(''); setConfirmPassword(''); setGeneratedToken('');
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center"
      style={{ backgroundImage: `url('https://images.unsplash.com/photo-1685602729277-54538940a06c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBtaW5pbWFsJTIwb2ZmaWNlJTIwYWJzdHJhY3QlMjBiYWNrZ3JvdW5kfGVufDB8fHx8MTc3MjcwOTI4Mnww&ixlib=rb-4.1.0&q=85')` }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-slate-900/30 to-violet-900/40"></div>

      <div className="relative w-full max-w-md">
        <div className="bg-white/90 backdrop-blur-md border border-slate-200 shadow-2xl rounded-2xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">VitalSync</h1>
            <p className="text-slate-600 font-medium">Health Monitoring Portal</p>
          </div>

          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-slate-800 mb-2">Welcome Back</h2>
              <p className="text-slate-600">Sign in to your account</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="username">Email or Username</Label>
                <Input
                  id="username"
                  data-testid="login-username-input"
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  required
                  placeholder="Enter email or username"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    data-testid="login-password-input"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    required
                    placeholder="Enter your password"
                    className="mt-1 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    data-testid="password-toggle"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {loginError && (
                <div
                  className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2"
                  data-testid="login-error-alert"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  {loginError}
                </div>
              )}

              <Button
                type="submit"
                data-testid="login-button"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-6 text-lg rounded-md shadow-sm"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <div className="text-center mt-4">
              <button
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                data-testid="forgot-password-link"
              >
                Forgot Password?
              </button>
            </div>

            {showForgotPassword && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-slate-800">
                      {resetStep === 1 ? 'Reset Password' : 'Enter New Password'}
                    </h3>
                    <button onClick={closeForgotPasswordModal} className="text-slate-400 hover:text-slate-600" data-testid="close-reset-modal">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {resetStep === 1 ? (
                    <form onSubmit={handleRequestReset} className="space-y-4">
                      <p className="text-sm text-slate-600 mb-4">Enter your username to request a password reset token.</p>
                      <div>
                        <Label htmlFor="reset-username">Username</Label>
                        <Input id="reset-username" data-testid="reset-username-input" value={resetUsername} onChange={(e) => setResetUsername(e.target.value)} placeholder="Enter your username" className="mt-1" />
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={closeForgotPasswordModal} className="flex-1">Cancel</Button>
                        <Button type="submit" disabled={resetLoading} className="flex-1 bg-indigo-600 hover:bg-indigo-700" data-testid="request-reset-btn">{resetLoading ? 'Processing...' : 'Request Reset'}</Button>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        Already have a token? <button type="button" onClick={() => setResetStep(2)} className="text-indigo-600 hover:underline">Enter it here</button>
                      </p>
                    </form>
                  ) : (
                    <form onSubmit={handleResetPassword} className="space-y-4">
                      {generatedToken && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-4">
                          <p className="text-sm text-green-800 font-medium mb-1">Your Reset Token:</p>
                          <code className="text-xs bg-green-100 px-2 py-1 rounded block break-all">{generatedToken}</code>
                          <p className="text-xs text-green-600 mt-2">Token is valid for 1 hour. Copy it if needed.</p>
                        </div>
                      )}
                      <div>
                        <Label htmlFor="reset-token">Reset Token</Label>
                        <Input id="reset-token" data-testid="reset-token-input" value={resetToken || generatedToken} onChange={(e) => setResetToken(e.target.value)} placeholder="Enter your reset token" className="mt-1" />
                      </div>
                      <div>
                        <Label htmlFor="new-password">New Password</Label>
                        <Input id="new-password" type="password" data-testid="new-password-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password (min 6 characters)" className="mt-1" />
                      </div>
                      <div>
                        <Label htmlFor="confirm-password">Confirm Password</Label>
                        <Input id="confirm-password" type="password" data-testid="confirm-password-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm your new password" className="mt-1" />
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => { setResetStep(1); setGeneratedToken(''); }} className="flex-1">Back</Button>
                        <Button type="submit" disabled={resetLoading} className="flex-1 bg-indigo-600 hover:bg-indigo-700" data-testid="reset-password-btn">{resetLoading ? 'Resetting...' : 'Reset Password'}</Button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}

            <div className="text-center text-sm text-slate-500 mt-4">
              <p className="mb-2">Login with your <strong>email</strong> or <strong>username</strong></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}