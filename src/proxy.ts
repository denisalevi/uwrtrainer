import { NextResponse, type NextRequest } from "next/server";
import { decrypt, SESSION_COOKIE } from "@/lib/session";

// Optimistic auth gating only (reads the cookie, no DB). The authoritative
// checks live in the Data Access Layer (src/lib/dal.ts) used by pages/actions.
const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify",
  "/check-email",
]);

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.has(pathname);
  const isRoot = pathname === "/";

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await decrypt(token);

  if (!session) {
    if (isPublic) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  // Authenticated: keep users out of auth pages and send root to the dashboard.
  // /verify stays reachable so an emailed confirmation link works even mid-session.
  if ((isPublic && pathname !== "/verify") || isRoot) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  // Run on everything except API routes, Next internals, and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
