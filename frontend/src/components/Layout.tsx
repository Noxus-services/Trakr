import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/hooks/useAuth";
import {
  LayoutDashboard, KanbanSquare, Users, Mail, Search, Settings, LogOut, Bug
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/pipeline", icon: KanbanSquare, label: "Pipeline" },
  { to: "/prospects", icon: Users, label: "Prospects" },
  { to: "/sequences", icon: Mail, label: "Séquences" },
  { to: "/scraper", icon: Search, label: "Collecte" },
  { to: "/settings", icon: Settings, label: "Paramètres" },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex flex-col bg-slate-900 text-slate-100 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-700">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
            <Bug size={16} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-white">Trakr</div>
            <div className="text-xs text-slate-400 leading-none">Prospector</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-blue-600 text-white font-medium"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-slate-700">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {user?.full_name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white truncate">{user?.full_name}</div>
              <div className="text-xs text-slate-400 truncate">{user?.email}</div>
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-white transition-colors"
              title="Déconnexion"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
