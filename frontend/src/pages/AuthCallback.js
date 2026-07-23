import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '@/utils/authFetch';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser, saveToken } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // CRITICAL: Prevent double processing in StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processSession = async () => {
      try {
        const hash = window.location.hash;
        const sessionIdMatch = hash.match(/session_id=([^&]+)/);
        
        if (!sessionIdMatch) {
          toast.error('Invalid authentication response');
          navigate('/login');
          return;
        }

        const sessionId = sessionIdMatch[1];

        // Exchange session_id for session_token
        const response = await authFetch(`${BACKEND_URL}/api/auth/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId })
        });

        if (!response.ok) {
          throw new Error('Authentication failed');
        }

        const userData = await response.json();
        // Save session token for cross-domain auth
        if (userData.session_token) {
          saveToken(userData.session_token);
        }
        setUser(userData);
        toast.success(`Welcome back, ${userData.name}!`);
        
        // Navigate to dashboard with user data
        navigate('/dashboard', { state: { user: userData }, replace: true });
      } catch (error) {
        console.error('Auth error:', error);
        toast.error('Authentication failed. Please try again.');
        navigate('/login');
      }
    };

    processSession();
  }, [navigate, saveToken, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        <p className="mt-4 text-slate-600">Authenticating...</p>
      </div>
    </div>
  );
}