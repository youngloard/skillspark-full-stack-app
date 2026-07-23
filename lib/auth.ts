import "server-only";
import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { env } from "@/lib/env";
import { normalizeEmail } from "@/lib/identity";
import { type AppRole, resolveLogin, resolveRole } from "@/lib/login-resolution";

// NextAuth v5 (JWT strategy, no adapter — Admin/Student are our own tables;
// ARCHITECTURE §3). signIn delegates the whole decision to resolveLogin; the
// jwt callback re-resolves the role on refresh so blocking/expiry takes
// effect without waiting for token expiry.

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      role?: AppRole;
      adminId?: string;
      studentId?: string;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env().AUTH_SECRET,
  // Self-hosted behind our own reverse proxy (VPS) — the Host header is
  // controlled by our proxy config, so trusting it is correct here.
  trustHost: true,
  providers: [
    Google({
      clientId: env().AUTH_GOOGLE_ID,
      clientSecret: env().AUTH_GOOGLE_SECRET,
    }),
  ],
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const resolution = await resolveLogin(user.email, {
        superAdminEmail: env().SUPER_ADMIN_EMAIL,
      });
      // Uniform failure: denied logins all land on /login?error=AccessDenied.
      return resolution.outcome === "allowed";
    },

    async jwt({ token, user }) {
      const email = user?.email ?? token.email;
      if (!email) return token;
      // Read-only on refresh: no audit rows, no stamps (resolveLogin already
      // ran in signIn for the initial sign-in).
      const resolution = await resolveRole(normalizeEmail(email));
      if (resolution.outcome === "allowed") {
        token.role = resolution.role;
        token.adminId = resolution.adminId;
        token.studentId = resolution.studentId;
      } else {
        delete token.role;
        delete token.adminId;
        delete token.studentId;
      }
      return token;
    },

    async session({ session, token }) {
      if (token.role) session.user.role = token.role as AppRole;
      if (token.adminId) session.user.adminId = token.adminId as string;
      if (token.studentId) session.user.studentId = token.studentId as string;
      return session;
    },
  },
});
