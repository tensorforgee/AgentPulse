import { AuthForm } from "@/components/auth-form";

export default async function SignupPage({
  searchParams,
}: PageProps<"/signup">) {
  const { next } = await searchParams;
  return <AuthForm mode="signup" redirectTo={safeAppPath(next)} />;
}

function safeAppPath(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  return path === "/app" || path?.startsWith("/app/") ? path : "/app";
}
