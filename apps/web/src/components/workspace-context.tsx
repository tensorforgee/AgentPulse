"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { requestJson } from "@/lib/client-api";
import type { Organization, Project, User } from "@/lib/types";

interface WorkspaceContextValue {
  user: User | null;
  organizations: Organization[];
  projects: Project[];
  selectedOrganization: Organization | null;
  selectedProject: Project | null;
  loading: boolean;
  loadingProjects: boolean;
  error: string;
  selectOrganization: (organizationId: string) => Promise<void>;
  selectProject: (projectId: string) => void;
  createOrganization: (input: {
    name: string;
    slug: string;
  }) => Promise<void>;
  createProject: (input: {
    name: string;
    slug: string;
    description?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [error, setError] = useState("");

  const loadProjects = useCallback(async (organizationId: string) => {
    if (!organizationId) {
      setProjects([]);
      setSelectedProjectId("");
      return;
    }

    setLoadingProjects(true);
    try {
      const result = await requestJson<Project[]>(
        `/api/organizations/${organizationId}/projects`,
      );
      setProjects(result);
      setSelectedProjectId((current) =>
        result.some((project) => project.id === current)
          ? current
          : (result[0]?.id ?? ""),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load projects");
      setProjects([]);
      setSelectedProjectId("");
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const currentUser = await requestJson<User>("/api/session");
        const userOrganizations =
          await requestJson<Organization[]>("/api/organizations");
        if (!active) return;

        setUser(currentUser);
        setOrganizations(userOrganizations);
        const organizationId = userOrganizations[0]?.id ?? "";
        setSelectedOrganizationId(organizationId);
        await loadProjects(organizationId);
      } catch {
        if (active) {
          router.replace("/login");
          router.refresh();
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, [loadProjects, router]);

  async function selectOrganization(organizationId: string) {
    setError("");
    setSelectedOrganizationId(organizationId);
    await loadProjects(organizationId);
  }

  function selectProject(projectId: string) {
    setSelectedProjectId(projectId);
  }

  async function createOrganization(input: { name: string; slug: string }) {
    setError("");
    const organization = await requestJson<Organization>("/api/organizations", {
      method: "POST",
      body: JSON.stringify(input),
    });
    setOrganizations((current) => [organization, ...current]);
    setSelectedOrganizationId(organization.id);
    await loadProjects(organization.id);
  }

  async function createProject(input: {
    name: string;
    slug: string;
    description?: string;
  }) {
    if (!selectedOrganizationId) throw new Error("Select an organization first");
    setError("");
    const project = await requestJson<Project>(
      `/api/organizations/${selectedOrganizationId}/projects`,
      { method: "POST", body: JSON.stringify(input) },
    );
    setProjects((current) => [project, ...current]);
    setSelectedProjectId(project.id);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const selectedOrganization =
    organizations.find(({ id }) => id === selectedOrganizationId) ?? null;
  const selectedProject =
    projects.find(({ id }) => id === selectedProjectId) ?? null;

  const value: WorkspaceContextValue = {
    user,
    organizations,
    projects,
    selectedOrganization,
    selectedProject,
    loading,
    loadingProjects,
    error,
    selectOrganization,
    selectProject,
    createOrganization,
    createProject,
    logout,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  }
  return context;
}
