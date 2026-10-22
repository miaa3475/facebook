import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import VerifyPage from "./pages/VerifyPage";
import FeedPage from "./pages/FeedPage";
import PostPage from "./pages/PostPage";
import ChatListPage from "./pages/ChatListPage";
import ChatPage from "./pages/ChatPage";
import FriendsPage from "./pages/FriendsPage";
import NotificationsPage from "./pages/NotificationsPage";
import ProfilePage from "./pages/ProfilePage";
import { ForgotPasswordPage, ResetPasswordPage } from "./pages/PasswordPages";
import { Spinner } from "./components/ui";
import "./index.css";

/** Blocks a route until we know whether the visitor is signed in. */
function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner label="載入中…" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

/** Sends signed-in visitors away from the login / register screens. */
function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner label="載入中…" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route
        path="/"
        element={
          <Protected>
            <Layout>
              <FeedPage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/friends"
        element={
          <Protected>
            <Layout>
              <FriendsPage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/notifications"
        element={
          <Protected>
            <Layout>
              <NotificationsPage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/chat"
        element={
          <Protected>
            <Layout>
              <ChatListPage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/chat/:id"
        element={
          <Protected>
            <Layout>
              <ChatPage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/post/:id"
        element={
          <Protected>
            <Layout>
              <PostPage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/profile/:id"
        element={
          <Protected>
            <Layout>
              <ProfilePage />
            </Layout>
          </Protected>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("#root element is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
