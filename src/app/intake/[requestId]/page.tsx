import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth-server";
import { IntakeChat } from "./IntakeChat";

export const metadata = { title: "面接指導の事前問診 | ストレスチェックWeb" };

export default async function IntakePage({ params }: { params: { requestId: string } }) {
  const { user } = await getSessionProfile();
  if (!user) redirect(`/login?next=/intake/${params.requestId}`);
  return <IntakeChat requestId={params.requestId} />;
}
