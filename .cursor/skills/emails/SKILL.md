---
name: emails
description: Resend and React Email skill for transactional emails (invitations, welcome, booking notifications). Use when implementing email sending, templates in packages/emails, or RESEND_API_KEY integration.
---

# Emails Skill (Resend + React Email)

This skill covers transactional emails for KameOps using Resend and React Email.

## Tech Stack

- **Provider**: Resend
- **Templates**: React Email (`@react-email/components`)
- **Package**: `packages/emails/` (shared email components and exports)

## File Locations

- Email components: `packages/emails/emails/` (e.g. `WelcomeEmail.tsx`)
- Package entry: `packages/emails/src/index.ts`
- Server-side sending: typically in `apps/web/src/server/services/` (e.g. `email.service.ts`)

## React Email Template Pattern

```tsx
// packages/emails/emails/WelcomeEmail.tsx
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components';

interface WelcomeEmailProps {
  name?: string;
}

export function WelcomeEmail({ name = 'there' }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to KameOps</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Welcome, {name}!</Heading>
          <Text style={paragraph}>...</Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: '#f6f9fc', fontFamily: '...' };
const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '560px',
};
const heading = { fontSize: '24px', fontWeight: '700', color: '#1a1a1a' };
const paragraph = { fontSize: '16px', lineHeight: '26px', color: '#484848' };
```

## Sending with Resend

```typescript
// Server-side (e.g. email.service.ts)
import { Resend } from 'resend';
import { WelcomeEmail } from '@kame-ops/emails';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWelcomeEmail(to: string, name: string) {
  const { data, error } = await resend.emails.send({
    from: 'KameOps <noreply@yourdomain.com>',
    to,
    subject: 'Welcome to KameOps',
    react: WelcomeEmail({ name }),
  });
  if (error) throw new Error(error.message);
  return data;
}
```

## Environment

- `RESEND_API_KEY` – Required for sending. Use Resend dashboard to create.
- From address must be a verified domain in Resend.

## Use Cases (from roadmap/specs)

- Invitation emails (team invite)
- Welcome email after registration
- Booking confirmation and status change notifications
- Password reset (if using Resend for auth emails)

## Reference

- `docs/reference/feature-specifications.md` – Notification and email requirements per feature
- `docs/implementation/roadmap.md` – Phase 1 includes "Email Notifications" (Resend, React Email, invitation/welcome)
