
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { username } from "better-auth/plugins";

import {
  ACCOUNT_LINKING_POLICY,
  looksLikeToken,
  RATE_LIMIT_RULES,
  RESEND_COOLDOWN_SECONDS,
  RESEND_MAX_PER_HOUR,
  VERIFICATION_LINK_TTL_SECONDS,
} from "./auth-policy";
import { sendMail } from "./email/mailer";
import { ADMIN_ROLE_LABEL, isAdminRole } from "./admin/permissions";
import { adminInviteEmail, changeEmailConfirmation, existingAccountNotice, passwordResetEmail, verificationEmail } from "./email/templates";
import { createSendThrottle } from "./email/throttle";
import { consumeToken } from "./email/token-use";
import { resolveAppOrigin, trustedOriginsFor } from "./app-config";
import { prismaTokenStore } from "./email/token-store";
import { prisma } from "./prisma";

const EXPIRES_IN_MINUTES = Math.round(VERIFICATION_LINK_TTL_SECONDS / 60);

/** Per-address limit on verification mail, on top of Better Auth's per-IP limits. */
const verificationThrottle = createSendThrottle({ cooldownMs: RESEND_COOLDOWN_SECONDS * 1000, maxPerHour: RESEND_MAX_PER_HOUR });

/** Per-address limit on password reset mail. */
const resetThrottle = createSendThrottle({ cooldownMs: RESEND_COOLDOWN_SECONDS * 1000, maxPerHour: RESEND_MAX_PER_HOUR });

function appOrigin(): string {
  return resolveAppOrigin(process.env);
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  // Local addresses only in development or when the app itself runs locally; extra ones (a test tunnel) come from TRUSTED_ORIGINS.
  trustedOrigins: trustedOriginsFor(process.env),

  emailAndPassword: {
    enabled: true,
    // Password sign-in is refused until the address is verified. A new sign-up gets no session.
    requireEmailVerification: true,
    // Choosing a new password signs the person out everywhere else.
    revokeSessionsOnPasswordReset: true,
    // Opening the emailed reset link and choosing a password proves the person controls the inbox.
    onPasswordReset: async ({ user }) => {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
    },
    sendResetPassword: async ({ user, url }) => {
      if (!resetThrottle.take(user.email).allowed) return;
      try {
        // An admin invitation is a reset link for an account that has no password yet, so it gets its own wording.
        const profile = await prisma.user.findUnique({ where: { id: user.id }, select: { adminProfile: { select: { role: true } }, accounts: { where: { providerId: "credential" }, select: { id: true } } } });
        const role = profile?.adminProfile?.role;
        const invited = role && isAdminRole(role) && profile.accounts.length === 0;
        await sendMail(user.email, invited ? adminInviteEmail({ name: user.name, roleLabel: ADMIN_ROLE_LABEL[role], url, expiresInMinutes: 60 }) : passwordResetEmail({ name: user.name, url, expiresInMinutes: 60 }));
      } catch (error) {
        resetThrottle.refund(user.email);
        console.error("Could not send the password reset email:", error);
        throw error;
      }
    },
    // Signing up with an address that already has an account looks the same as a new sign-up
    // (so the form cannot be used to find out who is registered); the real owner is told by email.
    onExistingUserSignUp: async ({ user }) => {
      await sendMail(user.email, existingAccountNotice({ name: user.name, signInUrl: `${appOrigin()}/login` }));
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    // Someone who already has an unverified account and tries to sign in is sent a fresh link.
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: VERIFICATION_LINK_TTL_SECONDS,
    sendVerificationEmail: async ({ user, url }) => {
      const decision = verificationThrottle.take(user.email);
      // Inside the cooldown the earlier email is still valid, so a second one adds nothing.
      if (!decision.allowed) return;
      try {
        await sendMail(user.email, verificationEmail({ name: user.name, url, expiresInMinutes: EXPIRES_IN_MINUTES }));
      } catch (error) {
        verificationThrottle.refund(user.email);
        console.error("Could not send the verification email:", error);
        throw error;
      }
    },
  },

  socialProviders: {
    google: {
      // Empty when not configured: Google sign-in then fails with a clear error instead of passing `undefined` along.
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },

  account: {
    accountLinking: {
      ...ACCOUNT_LINKING_POLICY,
      trustedProviders: [],
    },
  },

  user: {
    changeEmail: {
      enabled: true,
      // The current address approves first, then the new address must confirm. The email never changes before both.
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        await sendMail(user.email, changeEmailConfirmation({ name: user.name, newEmail, url, expiresInMinutes: EXPIRES_IN_MINUTES }));
      },
    },
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: { ...RATE_LIMIT_RULES },
  },

  hooks: {
    // Every verification and change-email link works once: the first time a token is presented it is recorded.
    before: createAuthMiddleware(async (ctx) => {
      // A sign-in method can only be disconnected while a password remains, so nobody is locked out.
      if (ctx.path === "/unlink-account") {
        const session = await getSessionFromCtx(ctx);
        if (!session) return;
        const passwords = await prisma.account.count({ where: { userId: session.user.id, providerId: "credential", password: { not: null } } });
        if (passwords === 0) throw new APIError("BAD_REQUEST", { message: "Set a password before disconnecting Google." });
        return;
      }
      if (ctx.path !== "/verify-email") return;
      const token = ctx.query?.token;
      if (!looksLikeToken(token)) return;
      const first = await consumeToken(prismaTokenStore, token);
      if (!first) throw ctx.redirect("/verify-email?error=token_used");
    }),
  },

  plugins: [
    username({
      displayUsername: false,
    }),
  ],
});
