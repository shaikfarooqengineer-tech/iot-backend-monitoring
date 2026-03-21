import { useState, useEffect } from 'react';
import { authFetch } from '@/utils/authFetch';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, CheckSquare, Building, CalendarDays, FileText, FolderOpen, Activity, UserCog, Users, Umbrella, Book, BarChart3, Settings as SettingsIcon, LogOut, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await authFetch(`${BACKEND_URL}/api/auth/me`);
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
      }
    };
    fetchUser();
  }, []);

  const handleLogout = async () => {
    try {
      await authFetch(`${BACKEND_URL}/api/auth/logout`, {
        method: 'POST'
      });
      localStorage.removeItem('session_token');
      toast.success('Logged out successfully');
      navigate('/login');
    } catch (error) {
      toast.error('Logout failed');
    }
  };

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Projects', href: '/projects', icon: FolderKanban },
    { name: 'Tasks', href: '/tasks', icon: CheckSquare },
    { name: 'Clients', href: '/clients', icon: Building },
    { name: 'Calendar', href: '/calendar', icon: CalendarDays },
    { name: 'Reports', href: '/reports', icon: FileText },
    { name: 'Documents', href: '/documents', icon: FolderOpen },
    { name: 'Activity', href: '/activity', icon: Activity },
    { name: 'Leaves', href: '/leaves', icon: Umbrella },
    { name: 'Knowledge', href: '/knowledge', icon: Book },
  ];

  if (user?.role === 'superadmin') {
    navigation.push({ name: 'Analytics', href: '/analytics', icon: BarChart3 });
    navigation.push({ name: 'HR', href: '/hr', icon: UserCog });
    navigation.push({ name: 'Users', href: '/users', icon: Users });
  }

  return (
    <div className="app-container">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-white border-r border-slate-200">
        <div className="flex items-center h-16 px-6 border-b border-slate-200">
          <h1 className="text-xl font-bold text-indigo-600">OLT Innovations</h1>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                data-testid={`nav-${item.name.toLowerCase()}`}
                className={`flex items-center px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-50 to-transparent text-indigo-600 border-l-2 border-indigo-600'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className="w-5 h-5 mr-3" strokeWidth={isActive ? 2 : 1.5} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center space-x-3 mb-3">
            <Avatar>
              <AvatarImage src={user?.picture} />
              <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
          {user?.role === 'superadmin' && (
            <div className="mb-3">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100">
                Super Admin
              </span>
            </div>
          )}
          <div className="space-y-1">
            <Link to="/settings">
              <Button
                variant="ghost"
                className="w-full justify-start text-slate-600 hover:text-indigo-600 hover:bg-indigo-50"
              >
                <SettingsIcon className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </Link>
            <Button
              data-testid="logout-button"
              onClick={handleLogout}
              variant="ghost"
              className="w-full justify-start text-slate-600 hover:text-red-600 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-900/50" onClick={() => setSidebarOpen(false)}>
          <aside className="fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between h-16 px-6 border-b border-slate-200">
              <h1 className="text-xl font-bold text-indigo-600">OLT Innovations</h1>
              <button onClick={() => setSidebarOpen(false)} className="text-slate-500 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <nav className="px-4 py-6 space-y-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-gradient-to-r from-indigo-50 to-transparent text-indigo-600 border-l-2 border-indigo-600'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-5 h-5 mr-3" strokeWidth={isActive ? 2 : 1.5} />
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200">
              <div className="flex items-center space-x-3 mb-3">
                <Avatar>
                  <AvatarImage src={user?.picture} />
                  <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{user?.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                </div>
              </div>
              {user?.role === 'admin' && (
                <div className="mb-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100">
                    Admin
                  </span>
                </div>
              )}
              <div className="space-y-1">
                <Link to="/settings" onClick={() => setSidebarOpen(false)}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-slate-600 hover:text-indigo-600 hover:bg-indigo-50"
                  >
                    <SettingsIcon className="w-4 h-4 mr-2" />
                    Settings
                  </Button>
                </Link>
                <Button
                  onClick={handleLogout}
                  variant="ghost"
                  className="w-full justify-start text-slate-600 hover:text-red-600 hover:bg-red-50"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 h-16 flex items-center px-4 lg:px-8 sticky top-0 z-40">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden mr-4 text-slate-600 hover:text-slate-900"
            data-testid="mobile-menu-button"
          >
            <Menu className="w-6 h-6" />
          </button>
          <h2 className="text-xl font-semibold text-slate-900">
            {navigation.find(item => item.href === location.pathname)?.name || 'Dashboard'}
          </h2>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}