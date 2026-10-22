import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, type Socket } from "socket.io";

import { auth } from "../auth";
import { prisma } from "../prisma";

type ChatMessageEvent = {
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

type JoinResponse = { ok: true } | { ok: false; error: string };
type RealtimeGlobal = typeof globalThis & { txmateSocketServer?: SocketIOServer };

const realtimeGlobal = globalThis as RealtimeGlobal;

function conversationRoom(conversationId: string) {
  return `conversation:${conversationId}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function authenticateSocket(socket: Socket) {
  const origin = socket.handshake.headers.origin;
  const host = socket.handshake.headers.host;

  // Browser clients connect to the same origin as the app. Reject cross-origin
  // browser handshakes before trusting the session cookie.
  if (origin) {
    try {
      if (!host || new URL(origin).host.toLowerCase() !== host.toLowerCase()) {
        throw new Error("Invalid socket origin.");
      }
    } catch {
      throw new Error("Invalid socket origin.");
    }
  }

  const cookie = socket.handshake.headers.cookie;
  if (!cookie) throw new Error("Authentication required.");

  const session = await auth.api.getSession({
    headers: new Headers({ cookie }),
  });

  if (!session?.user?.id) throw new Error("Authentication required.");
  socket.data.userId = session.user.id;
}

async function joinConversation(socket: Socket, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      request: {
        select: {
          studentProfile: { select: { userId: true } },
          offering: {
            select: {
              academicMateProfile: { select: { userId: true } },
            },
          },
        },
      },
    },
  });

  if (!conversation) return false;

  const studentUserId = conversation.request.studentProfile.userId;
  const academicMateUserId =
    conversation.request.offering.academicMateProfile.userId;
  const userId = socket.data.userId as string | undefined;

  if (userId !== studentUserId && userId !== academicMateUserId) return false;

  await socket.join(conversationRoom(conversationId));
  return true;
}

/** Attach Socket.IO to the same HTTP server that serves the Next.js app. */
export function attachSocketServer(httpServer: HttpServer) {
  const io = new SocketIOServer(httpServer, {
    path: "/socket.io",
    serveClient: false,
  });

  // The custom server and bundled Next route handlers may load this module in
  // separate module contexts, so the live server is stored on process globalThis.
  realtimeGlobal.txmateSocketServer = io;

  io.use((socket, next) => {
    void authenticateSocket(socket).then(
      () => next(),
      (error: unknown) => {
        console.warn("Socket.IO authentication rejected:", error instanceof Error ? error.message : "unknown error");
        next(new Error("Authentication required."));
      },
    );
  });

  io.on("connection", (socket) => {
    socket.on(
      "conversation:join",
      async (
        payload: unknown,
        acknowledge?: (response: JoinResponse) => void,
      ) => {
        if (
          !isPlainObject(payload) ||
          typeof payload.conversationId !== "string" ||
          !payload.conversationId.trim() ||
          payload.conversationId.length > 100
        ) {
          acknowledge?.({ ok: false, error: "A valid conversation ID is required." });
          return;
        }

        try {
          const allowed = await joinConversation(socket, payload.conversationId);
          acknowledge?.(
            allowed
              ? { ok: true }
              : { ok: false, error: "You are not authorised to join this conversation." },
          );
        } catch (error) {
          console.error("Socket.IO conversation join failed:", error);
          acknowledge?.({ ok: false, error: "Unable to join this conversation." });
        }
      },
    );

    socket.on("conversation:leave", (payload: unknown) => {
      if (
        isPlainObject(payload) &&
        typeof payload.conversationId === "string" &&
        payload.conversationId.length <= 100
      ) {
        void socket.leave(conversationRoom(payload.conversationId));
      }
    });
  });

  return io;
}

/** Broadcast only after the message and its notification have committed. */
export function emitConversationMessage(message: ChatMessageEvent) {
  realtimeGlobal.txmateSocketServer
    ?.to(conversationRoom(message.conversationId))
    .emit("message:new", message);
}



type ConversationReadReceiptEvent = {
  conversationId: string;
  readerUserId: string;
  messageIds: string[];
  readAt: string;
};

/** Broadcast persisted read receipts to both participants in the conversation room. */
export function emitConversationReadReceipt(receipt: ConversationReadReceiptEvent) {
  realtimeGlobal.txmateSocketServer
    ?.to(conversationRoom(receipt.conversationId))
    .emit("messages:read", receipt);
}
