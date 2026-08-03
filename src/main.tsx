import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter, createRoute, createRootRoute } from "@tanstack/react-router";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { RootPage } from "./pages/RootPage";
import { LandingPage } from "./pages/LandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { StudioPage } from "./pages/StudioPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { TermsPage } from "./pages/TermsPage";

// Create route tree
const rootRoute = createRootRoute({
  component: RootPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
});

const studioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: DashboardPage,
});

const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/callback",
  component: AuthCallbackPage,
});

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy",
  component: PrivacyPage,
});

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terms",
  component: TermsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  studioRoute,
  authCallbackRoute,
  privacyRoute,
  termsRoute,
]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </React.StrictMode>
);

// Log uncaught render errors that escape the ErrorBoundary (e.g. errors thrown
// in hooks called outside the boundary's subtree, or during async rendering).
window.addEventListener("error", (e) => {
  console.error("[Uncaught] Render error:", e.error ?? e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[Uncaught] Unhandled promise rejection:", e.reason);
});
