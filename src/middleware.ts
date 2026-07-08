import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Edge middleware: gate app pages behind a valid session cookie. API auth is
// enforced separately in route handlers (which have DB access).

const PUBLIC_PATHS = ["/login", "/register"];
const secret = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "dev-insecure-secret-change-me"
);

async function hasValidSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("fl_session")?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow API, cron, static assets, and public auth pages through.
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  if (await hasValidSession(req)) return NextResponse.next();

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
