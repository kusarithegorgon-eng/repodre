import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { RootPage } from "@/pages/RootPage";
import { HomePage } from "@/pages/HomePage";
import { StudioPage } from "@/pages/StudioPage";
import { AuthCallbackPage } from "@/pages/AuthCallbackPage";
import { PrivacyPage } from "@/pages/PrivacyPage";
import { TermsPage } from "@/pages/TermsPage";

const rootRoute = createRootRoute({
  component: RootPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const studioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/studio",
  validateSearch: (search: Record<string, unknown>) => ({
    demo: typeof search.demo === "boolean" ? search.demo : undefined,
    draft: typeof search.draft === "boolean" ? search.draft : undefined,
    project: typeof search.project === "string" ? search.project : undefined,
  }) as { demo?: boolean; draft?: boolean; project?: string },
  component: StudioPage,
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

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
