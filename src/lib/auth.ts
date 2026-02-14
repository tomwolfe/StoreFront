import { auth as clerkAuth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

export type AppAuth = {
  userId: string | null;
  role?: string;
  source: 'clerk' | 'bridge' | null;
  sessionClaims?: any;
};

export async function getAppAuth(): Promise<AppAuth> {
  // 1. Try Clerk first
  try {
    const { userId, sessionClaims } = await clerkAuth();
    if (userId) {
      return { 
        userId, 
        source: 'clerk',
        sessionClaims,
        role: (sessionClaims as any)?.metadata?.role
      };
    }
  } catch (error) {
    // clerkAuth() might throw if clerkMiddleware wasn't run or keys are missing
    console.debug("Clerk auth failed or skipped:", error);
  }

  // 2. Try Bridge session
  const cookieStore = await cookies();
  const bridgeSession = cookieStore.get('app_bridge_session');
  
  if (bridgeSession?.value) {
    try {
      const payload = JSON.parse(bridgeSession.value);
      if (payload && payload.clerkUserId) {
        return { 
          userId: payload.clerkUserId, 
          role: payload.role,
          source: 'bridge' 
        };
      }
    } catch (e) {
      console.error("Failed to parse bridge session cookie:", e);
    }
  }

  return { userId: null, source: null };
}
