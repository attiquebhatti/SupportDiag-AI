import { config } from "@/lib/config";
import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm googleEnabled={config.google.enabled} />;
}
