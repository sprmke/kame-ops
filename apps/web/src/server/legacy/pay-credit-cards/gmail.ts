// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import type { gmail_v1 } from 'googleapis';
import { google } from 'googleapis';
import { projectPaths } from './config';

/** True when Google OAuth refresh failed (expired / revoked token, wrong client, etc.). */
export function isInvalidGrantError(err: unknown): boolean {
  const s =
    err instanceof Error
      ? `${err.message}\n${(err as NodeJS.ErrnoException).code ?? ''}`
      : String(err);
  if (/invalid_grant/i.test(s)) return true;
  const g = err as {
    response?: { data?: { error?: string; error_description?: string } };
  };
  const d = g.response?.data;
  if (d?.error === 'invalid_grant') return true;
  if (
    typeof d?.error_description === 'string' &&
    /invalid_grant/i.test(d.error_description)
  )
    return true;
  return false;
}

export function formatGmailAuthError(err: unknown): string {
  if (!isInvalidGrantError(err)) {
    return err instanceof Error ? err.message : String(err);
  }
  return [
    'Gmail OAuth failed: invalid_grant (refresh token expired, revoked, or not valid for this OAuth client).',
    `Fix: run  npm run gmail-auth  in pay-credit-cards to sign in again and refresh ${projectPaths.tokenJson}.`,
    'If it keeps failing, confirm configs/credentials.json matches the same Desktop OAuth client used when the token was created.',
  ].join('\n');
}

export type DownloadedPdf = {
  bankId: string;
  bankLabel: string;
  messageId: string;
  subject: string;
  fileName: string;
  filePath: string;
};

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  if (!headers) return '';
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

function collectAttachmentParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  out: gmail_v1.Schema$MessagePart[],
) {
  if (!part) return;
  if (part.parts) {
    for (const p of part.parts) collectAttachmentParts(p, out);
  }
  const mime = (part.mimeType ?? '').toLowerCase();
  const name = part.filename ?? '';
  if (part.body?.attachmentId && name.toLowerCase().endsWith('.pdf')) {
    out.push(part);
  } else if (part.body?.attachmentId && mime === 'application/pdf') {
    out.push(part);
  }
}

export async function getGmailClient() {
  if (!fs.existsSync(projectPaths.credentialsJson)) {
    throw new Error(`Missing ${projectPaths.credentialsJson}`);
  }
  if (!fs.existsSync(projectPaths.tokenJson)) {
    throw new Error(
      `Missing ${projectPaths.tokenJson}. Run: npm run gmail-auth`,
    );
  }
  const creds = JSON.parse(
    fs.readFileSync(projectPaths.credentialsJson, 'utf8'),
  );
  const installed = creds.installed ?? creds.web;
  const oauth2Client = new google.auth.OAuth2(
    installed.client_id,
    installed.client_secret,
    'http://127.0.0.1:8765/oauth2callback',
  );
  oauth2Client.setCredentials(
    JSON.parse(fs.readFileSync(projectPaths.tokenJson, 'utf8')),
  );
  try {
    await oauth2Client.getAccessToken();
  } catch (e) {
    throw new Error(formatGmailAuthError(e));
  }
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export async function searchAndDownloadPdfs(options: {
  gmail: gmail_v1.Gmail;
  query: string;
  bankId: string;
  bankLabel: string;
  downloadsDir: string;
  maxResults?: number;
}): Promise<DownloadedPdf[]> {
  const { gmail, query, bankId, bankLabel, downloadsDir } = options;
  const maxResults = options.maxResults ?? 15;
  const list = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
  });
  const ids = list.data.messages?.map((m) => m.id).filter(Boolean) ?? [];
  const results: DownloadedPdf[] = [];

  for (const id of ids) {
    if (!id) continue;
    const full = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'full',
    });
    const subject = getHeader(full.data.payload?.headers, 'Subject');
    const parts: gmail_v1.Schema$MessagePart[] = [];
    collectAttachmentParts(full.data.payload, parts);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const attachmentId = part.body?.attachmentId;
      if (!attachmentId) continue;
      const att = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: id,
        id: attachmentId,
      });
      const b64 = att.data.data ?? '';
      const buffer = Buffer.from(
        b64.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      );
      const safeName = (part.filename || `statement-${i + 1}.pdf`).replace(
        /[^\w.\-]+/g,
        '_',
      );
      const outName = `${bankId}-${id.slice(0, 8)}-${i}-${safeName}`;
      const filePath = path.join(downloadsDir, outName);
      fs.writeFileSync(filePath, buffer);
      results.push({
        bankId,
        bankLabel,
        messageId: id,
        subject,
        fileName: safeName,
        filePath,
      });
    }
  }

  return results;
}
