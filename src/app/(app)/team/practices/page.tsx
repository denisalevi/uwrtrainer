import { redirect } from "next/navigation";

/** Practice management moved into Settings (trainer group). Keep old links working. */
export default function PracticesPage() {
  redirect("/settings");
}
