import { config } from "@/lib/config";
import { RegisterForm } from "@/components/auth/register-form";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return <RegisterForm googleEnabled={config.google.enabled} />;
}
