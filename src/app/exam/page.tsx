import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExamForm } from "./ExamForm";

export default async function ExamPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/exam");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, department, employee_no")
    .eq("id", user.id)
    .single();

  return (
    <ExamForm
      initialProfile={{
        name: profile?.full_name ?? "",
        empId: profile?.employee_no ?? "",
        dept: profile?.department ?? "",
      }}
    />
  );
}
