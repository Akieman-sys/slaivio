import { clerkMiddleware } from "@clerk/nextjs/server";
import createIntlMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import { isPilotV1, isPilotVisiblePath, pilotRedirectTarget } from "@/config/product-profile";

const hasClerkKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const hasApiUrl = Boolean(
  process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL,
);
const isProduction = process.env.NODE_ENV === "production";
const intlMiddleware = createIntlMiddleware(routing);

const protectedPrefixes = [
  "/app",
  "/onboarding",
];

const clerkProtection = clerkMiddleware(async (auth) => {
  await auth.protect();
});

function isProtectedRoute(pathname: string) {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isPublicI18nRoute(pathname: string) {
  return pathname === "/" || pathname === "/landing" || /^\/(fr|en)(\/.*)?$/.test(pathname);
}

export default function middleware(request: NextRequest, event: Parameters<typeof clerkProtection>[1]) {
  const { pathname } = request.nextUrl;

  if (isProtectedRoute(pathname)) {
    if (isProduction && (!hasClerkKey || !hasApiUrl)) {
      return new NextResponse(
        "SLAIVIO is temporarily unavailable because its production configuration is incomplete.",
        {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    if (isPilotV1() && pathname.startsWith("/app/") && !isPilotVisiblePath(pathname)) {
      const destination = request.nextUrl.clone();
      destination.pathname = pilotRedirectTarget(pathname);
      destination.search = "";
      return NextResponse.redirect(destination, 307);
    }

    if (hasClerkKey) {
      return clerkProtection(request, event);
    }

    return NextResponse.next();
  }

  if (isPublicI18nRoute(pathname)) {
    return intlMiddleware(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
