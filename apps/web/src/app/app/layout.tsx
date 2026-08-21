import { AppShell } from "@/components/app-shell";
import { WorkspaceProvider } from "@/components/workspace-context";

export default function ApplicationLayout({ children }: LayoutProps<"/app">) {
  return (
    <WorkspaceProvider>
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  );
}
