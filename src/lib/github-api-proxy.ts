/**
 * GitHub API Proxy
 *
 * Routes all GitHub API calls through Supabase Edge Functions to bypass CORS.
 * The token is passed securely in the Authorization header.
 * 
 * Uses lazy imports to avoid circular dependency issues.
 */
import { supabase } from "./supabase";
export interface ProxyRequest {
  method: "GET" | "POST";
  endpoint: string;
  body?: Record<string, unknown>;
}

export interface ProxyResponse<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

/**
 * Make a GitHub API call through the proxy function.
 * Automatically includes the auth token in the Authorization header.
 * 
 * Uses dynamic imports to avoid circular dependencies.
 */
export async function callGitHubAPI<T>(
  method: "GET" | "POST",
  endpoint: string,
  body?: Record<string, unknown>
): Promise<ProxyResponse<T>> {
  try {
    // Lazy import to avoid circular dependency
    const { supabase } = await import("./supabase");

    // Get the session to extract the GitHub token
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.provider_token;

    if (!token) {
      return {
        ok: false,
        status: 401,
        error: "No GitHub authentication token found. Please sign in.",
      };
    }

    // Call the edge function
    const { data, error } = await supabase.functions.invoke("github-api-proxy", {
      body: {
        method,
        endpoint,
        body,
        token,
      },
    });

    if (error) {
      console.error("Proxy error:", error);
      return {
        ok: false,
        status: 500,
        error: error.message || "Proxy function error",
      };
    }

    return data as ProxyResponse<T>;
  } catch (error) {
    console.error("GitHub API proxy error:", error);
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
