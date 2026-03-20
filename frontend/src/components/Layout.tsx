import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  LayoutDashboard, KanbanSquare, Users, Mail, Search, Settings, LogOut, Bug, ChevronDown, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";

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
  const ws = useWorkspace();
  const active = ws.active();

  const [wsOpen, setWsOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setWsOpen(false);
        setAdding(false);
        setNewName("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    ws.create(newName.trim());
    setNewName("");
    setAdding(false);
    setWsOpen(false);
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

        {/* Workspace switcher */}
        <div className="px-3 py-3 border-b border-slate-700 relative" ref={dropRef}>
          <button
            onClick={() => setWsOpen(v => !v)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors group"
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: active.color }}
            />
            <span className="flex-1 text-xs font-medium text-slate-200 truncate text-left">
              {active.name}
            </span>
            <ChevronDown
              size={12}
              className={cn("text-slate-400 transition-transform shrink-0", wsOpen && "rotate-180")}
            />
          </button>

          {wsOpen && (
            <div className="absolute left-3 right-3 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
              {ws.workspaces.map(w => (
                <button
                  key={w.id}
                  onClick={() => { ws.setActive(w.id); setWsOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left",
                    w.id === ws.activeId
                      ? "bg-slate-700 text-white font-medium"
                      : "text-slate-300 hover:bg-slate-700"
                  )}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                  <span className="flex-1 truncate">{w.name}</span>
                  {w.id === ws.activeId && (
                    <span className="text-[10px] text-slate-400 shrink-0">actif</span>
                  )}
                </button>
              ))}

              <div className="border-t border-slate-700">
                {adding ? (
                  <div className="px-3 py-2 flex gap-1.5">
                    <input
                      autoFocus
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleCreate()}
                      placeholder="Nom de la société…"
                      className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button onClick={handleCreate}
                      className="px-2 py-1 bg-blue-600 text-white text-[10px] rounded hover:bg-blue-700 font-medium">
                      OK
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAdding(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                  >
                    <Plus size={12} /> Nouveau workspace
                  </button>
                )}
              </div>
            </div>
          )}
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
