import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return <AuthForm mode="login" redirectTo={safeAppPath(next)} />;
}

function safeAppPath(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  return path === "/app" || path?.startsWith("/app/") ? path : "/app";
}
