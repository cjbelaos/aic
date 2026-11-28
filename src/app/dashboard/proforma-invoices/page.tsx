import { redirect } from "next/navigation";
import { getSession, isAdminUser } from "@/lib/auth/session";
import ProformaInvoicesClient from "./proforma-invoices-client";

export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/");
  return <ProformaInvoicesClient isAdmin={isAdminUser(session)} />;
}
