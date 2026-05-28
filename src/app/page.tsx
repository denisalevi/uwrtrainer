import { redirect } from "next/navigation";

// Proxy normally redirects "/" already; this is a safety net.
export default function Home() {
  redirect("/dashboard");
}
