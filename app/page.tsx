import { redirect } from "next/navigation";

/** Redirect root to the admin orders inbox */
export default function Home() {
  redirect("/admin/orders");
}
