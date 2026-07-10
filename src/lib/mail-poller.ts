import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { MailAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/mail-crypto";
import { logOperatorAction, notifyAdmins } from "@/lib/notifications";
import { createLogger } from "@/lib/logger";

const log = createLogger("mail-poller");

const POLL_INTERVAL_MS = Number(process.env.MAIL_POLL_INTERVAL_MS || 120_000);
const MAX_FAILURES_BEFORE_BACKOFF = 5;
const BACKOFF_MS = 30 * 60_000;

let running = false;

export function startMailPoller() {
  const g = globalThis as unknown as { __mailPollerStarted?: boolean };
  if (g.__mailPollerStarted) return;
  g.__mailPollerStarted = true;

  log.info({ intervalMs: POLL_INTERVAL_MS }, "Mail poller starting");
  pollAllMailboxes().catch((err) => log.error({ err }, "Initial mail poll failed"));
  setInterval(() => {
    pollAllMailboxes().catch((err) => log.error({ err }, "Mail poll cycle failed"));
  }, POLL_INTERVAL_MS);
}

async function pollAllMailboxes() {
  if (running) return;
  running = true;
  try {
    const accounts = await prisma.mailAccount.findMany({
      where: {
        enabled: true,
        OR: [{ pausedUntil: null }, { pausedUntil: { lt: new Date() } }],
      },
    });
    for (const account of accounts) {
      try {
        await pollOneMailbox(account);
      } catch (err) {
        await handlePollFailure(account, err);
      }
    }
  } finally {
    running = false;
  }
}

async function pollOneMailbox(account: MailAccount) {
  const host = process.env.MAIL_IMAP_HOST;
  const port = Number(process.env.MAIL_IMAP_PORT || "993");
  if (!host) throw new Error("MAIL_IMAP_HOST no está configurado");

  const password = decrypt(account.encryptedPassword);
  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user: account.mailAddress, pass: password },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mailbox = client.mailbox;
      if (!mailbox) throw new Error("No se pudo abrir INBOX");

      const uidValidity = Number(mailbox.uidValidity);
      let lastUid = account.imapLastUid;

      // Mailbox was rebuilt server-side — old UIDs no longer mean anything.
      if (account.imapUidValidity !== null && uidValidity !== account.imapUidValidity) {
        lastUid = 0;
      }

      let maxUidSeen = lastUid;

      if (mailbox.exists > 0) {
        for await (const msg of client.fetch(
          `${lastUid + 1}:*`,
          { uid: true, source: true },
          { uid: true }
        )) {
          if (msg.uid <= lastUid || !msg.source) continue;
          await persistInboundEmail(account, msg.uid, msg.source);
          if (msg.uid > maxUidSeen) maxUidSeen = msg.uid;
        }
      }

      await prisma.mailAccount.update({
        where: { id: account.id },
        data: {
          imapUidValidity: uidValidity,
          imapLastUid: maxUidSeen,
          lastPolledAt: new Date(),
          lastPollError: null,
          consecutiveFailures: 0,
          pausedUntil: null,
        },
      });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function matchContact(fromAddress: string, ownerUserId: string) {
  if (!fromAddress) return null;
  const candidates = await prisma.contact.findMany({
    where: { email: fromAddress },
    select: { id: true, assignedToId: true },
    orderBy: { updatedAt: "desc" },
  });
  if (candidates.length === 0) return null;
  return candidates.find((c) => c.assignedToId === ownerUserId) || candidates[0];
}

async function persistInboundEmail(account: MailAccount, uid: number, source: Buffer) {
  const parsed = await simpleParser(source);
  const messageId = parsed.messageId || `uid-${uid}-${account.id}@synthetic.local`;

  const existing = await prisma.email.findUnique({
    where: { userId_messageId: { userId: account.userId, messageId } },
    select: { id: true },
  });
  if (existing) return;

  const fromAddress = parsed.from?.value?.[0]?.address?.trim().toLowerCase() || "";
  const toAddress = Array.isArray(parsed.to)
    ? parsed.to.flatMap((t) => t.value.map((a) => a.address)).filter(Boolean).join(", ")
    : parsed.to?.value.map((a) => a.address).filter(Boolean).join(", ") || "";
  const ccAddress = parsed.cc
    ? (Array.isArray(parsed.cc)
        ? parsed.cc.flatMap((c) => c.value.map((a) => a.address))
        : parsed.cc.value.map((a) => a.address)
      ).filter(Boolean).join(", ") || null
    : null;

  const contact = await matchContact(fromAddress, account.userId);
  const htmlContent = typeof parsed.html === "string" ? parsed.html : null;
  // Never render raw inbound HTML in the browser (XSS risk from external senders) —
  // bodyHtml is kept only as an audit record; the UI always shows this derived plain text.
  const bodyText = parsed.text || (htmlContent ? stripHtml(htmlContent) : null);

  const email = await prisma.email.create({
    data: {
      userId: account.userId,
      contactId: contact?.id ?? null,
      direction: "IN",
      status: "RECEIVED",
      subject: parsed.subject || null,
      bodyHtml: htmlContent,
      bodyText,
      fromAddress,
      toAddress,
      ccAddress,
      messageId,
      inReplyTo: parsed.inReplyTo || null,
      imapUid: uid,
      read: false,
      receivedAt: parsed.date || new Date(),
    },
  });

  if (contact) {
    await prisma.leadActivity.create({
      data: {
        contactId: contact.id,
        userId: account.userId,
        type: "EMAIL_RECEIVED",
        title: `Email recibido: ${parsed.subject || "(sin asunto)"}`,
        description: fromAddress,
      },
    });
    await logOperatorAction({
      userId: account.userId,
      action: "RECEIVE_EMAIL",
      entityType: "EMAIL",
      entityId: email.id,
      description: `Recibió email de ${fromAddress}: "${parsed.subject || "(sin asunto)"}"`,
      link: `/leads/${contact.id}`,
    });
  }
}

async function handlePollFailure(account: MailAccount, err: unknown) {
  const consecutiveFailures = account.consecutiveFailures + 1;
  const message = err instanceof Error ? err.message : String(err);
  log.error({ err, mailAddress: account.mailAddress }, "Mail poll failed for account");

  const crossedThreshold = consecutiveFailures === MAX_FAILURES_BEFORE_BACKOFF;

  await prisma.mailAccount.update({
    where: { id: account.id },
    data: {
      consecutiveFailures,
      lastPollError: message,
      lastPolledAt: new Date(),
      ...(consecutiveFailures >= MAX_FAILURES_BEFORE_BACKOFF
        ? { pausedUntil: new Date(Date.now() + BACKOFF_MS) }
        : {}),
    },
  });

  if (crossedThreshold) {
    await notifyAdmins({
      type: "MAIL_ACCOUNT_FAILING",
      title: "Casilla de correo con errores",
      message: `La casilla ${account.mailAddress} falló ${consecutiveFailures} veces seguidas al revisar el correo entrante. Revisar la contraseña configurada en Configuración.`,
    });
  }
}
