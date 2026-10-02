import { redirect } from "next/navigation";
import { getSession, isAdminUser } from "@/lib/auth/session";
import ServiceInvoicesClient from "./service-invoices-client";

export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/");
  return <ServiceInvoicesClient isAdmin={isAdminUser(session)} />;
}
