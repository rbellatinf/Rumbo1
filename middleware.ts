import { NextRequest, NextResponse } from "next/server";

const REFERRAL_COOKIE = "rumbo_referral";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const referral = request.nextUrl.searchParams.get("ref")?.trim().toUpperCase();

  if (referral && /^RUMBO-[A-Z0-9-]{3,34}$/.test(referral)) {
    response.cookies.set(REFERRAL_COOKIE, referral, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
