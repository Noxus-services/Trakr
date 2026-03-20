import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/Login";
import RegisterPage from "@/pages/Register";
import DashboardPage from "@/pages/Dashboard";
import PipelinePage from "@/pages/Pipeline";
import ProspectsPage from "@/pages/Prospects";
import SequencesPage from "@/pages/Sequences";
import ScraperPage from "@/pages/Scraper";
import SettingsPage from "@/pages/Settings";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="prospects" element={<ProspectsPage />} />
        <Route path="sequences" element={<SequencesPage />} />
        <Route path="scraper" element={<ScraperPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
