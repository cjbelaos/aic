import { redirect } from "next/navigation";
import { getSession, isAdminUser } from "@/lib/auth/session";
import ServiceInvoiceSummaryClient from "./summary-client";

export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!isAdminUser(session)) redirect("/dashboard");
  return <ServiceInvoiceSummaryClient />;
}
