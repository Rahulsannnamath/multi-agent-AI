// apps/web/src/components/Layout.tsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import {
  LayoutDashboard,
  Plus,
  FlaskConical,
  BookOpen,
  Cpu,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../store/app.store';
import { providersApi } from '../services/api';
import clsx from 'clsx';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/projects/new', icon: Plus, label: 'New Project' },
  { to: '/experiments', icon: FlaskConical, label: 'Experiments' },
  { to: '/providers', icon: Cpu, label: 'Providers' },
  { to: '/docs', icon: BookOpen, label: 'Documentation' },
];

export function Layout() {
  const { providerStatus, setProviderStatus } = useAppStore();
  const navigate = useNavigate();

  useEffect(() => {
    providersApi.status()
      .then((res) => setProviderStatus(res.data))
      .catch(console.error);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* Logo */}
        <div className="p-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-none">Multi-Agent</h1>
              <p className="text-xs text-gray-500 mt-0.5">AI App Builder</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(isActive ? 'sidebar-link-active' : 'sidebar-link-inactive')
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Provider Status */}
        <div className="p-3 border-t border-gray-800 space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide px-2">Providers</p>
          {providerStatus ? (
            <>
              <div
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800 cursor-pointer transition-colors"
                onClick={() => navigate('/providers')}
              >
                <span
                  className={clsx(
                    'status-dot',
                    providerStatus.ollama.available
                      ? 'bg-emerald-400'
                      : providerStatus.ollama.configured
                      ? 'bg-amber-400'
                      : 'bg-gray-600'
                  )}
                />
                <span className="text-xs text-gray-400">Ollama</span>
                <span className="text-xs text-gray-600 ml-auto truncate max-w-[80px]">
                  {providerStatus.ollama.defaultModel.split(':')[0]}
                </span>
              </div>
              <div
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800 cursor-pointer transition-colors"
                onClick={() => navigate('/providers')}
              >
                <span
                  className={clsx(
                    'status-dot',
                    providerStatus.openai.available ? 'bg-emerald-400' : 'bg-gray-600'
                  )}
                />
                <span className="text-xs text-gray-400">OpenAI</span>
                <span className="text-xs text-gray-600 ml-auto truncate max-w-[80px]">
                  {providerStatus.openai.defaultModel}
                </span>
              </div>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
                <span
                  className={clsx(
                    'status-dot',
                    providerStatus.daytona.configured ? 'bg-blue-400' : 'bg-gray-600'
                  )}
                />
                <span className="text-xs text-gray-400">Daytona</span>
                <span className="text-xs text-gray-600 ml-auto">
                  {providerStatus.daytona.configured ? 'ready' : 'n/a'}
                </span>
              </div>
            </>
          ) : (
            <div className="px-2 py-1 text-xs text-gray-600">Loading...</div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-800">
          <p className="text-xs text-gray-600 text-center">
            Final Year Project — MAASG
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="min-h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
