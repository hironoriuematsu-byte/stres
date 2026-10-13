import { stripeConfigured } from "@/lib/stripe";
import { ApplyForm } from "./ApplyForm";

export const metadata = { title: "お申込み | ストレスチェックWeb" };
export const dynamic = "force-dynamic";

export default function ApplyPage({ searchParams }: { searchParams: { seats?: string; canceled?: string } }) {
  const seats = Number(searchParams.seats);
  return (
    <ApplyForm
      enabled={stripeConfigured()}
      initialSeats={Number.isInteger(seats) && seats > 0 ? String(seats) : ""}
      canceled={searchParams.canceled === "1"}
    />
  );
}
