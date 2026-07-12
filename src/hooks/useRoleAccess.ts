import { useState, useEffect, useCallback } from "react";
import { fetchRole, roleToAccess, type RoleAccess, type ProjectRole } from "@/lib/rbac";

export function useRoleAccess(projectId: string | null | undefined): RoleAccess {
  const [role, setRole] = useState<ProjectRole | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) {
      setRole(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const r = await fetchRole(projectId);
    setRole(r);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  return roleToAccess(role, loading);
}
