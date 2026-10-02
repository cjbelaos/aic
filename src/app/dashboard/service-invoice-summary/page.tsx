import { redirect } from "next/navigation";
import { getSession, isAdminUser } from "@/lib/auth/session";

export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!isAdminUser(session)) redirect("/dashboard");
  redirect("/dashboard/service-invoices?tab=summary");
}
