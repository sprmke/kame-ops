# Mobile App Readiness Plan (Framework-Agnostic)

## Goal

Keep KameOps ready for a future mobile client without locking into React Native or any specific framework today.

## Decision Status

- **Web remains primary:** Next.js + tRPC + Drizzle + service layer.
- **Mobile client framework:** Deferred (React Native, Flutter, Kotlin/Swift, etc.).
- **Architecture direction:** Prepare stable backend/domain boundaries so any client can integrate safely.

## Core Principles

1. **Domain logic stays server-side**
   - Keep business rules in service layer and tRPC procedures.
   - Mobile clients should not implement critical workflow rules locally.

2. **Client-neutral API contracts**
   - Keep tRPC contracts stable and validation-first (Zod).
   - Introduce REST/BFF endpoints only when a non-TypeScript mobile stack requires it.

3. **Shared identity model**
   - Use Supabase Auth-compatible JWT/session model as the common auth baseline.
   - Keep authorization checks in server services, not in client assumptions.

4. **Provider abstractions**
   - Keep storage, notifications, and payment integrations behind service abstractions.
   - Prevent SDK lock-in inside feature UI code.

## Repo Readiness Checklist

### 1) API and service boundaries

- Keep all privileged write operations behind protected server procedures.
- Ensure every mutation enforces organization/property scoping.
- Define input/output schemas with explicit version-safe fields.

### 2) Shared domain packages

- Use `packages/types` for cross-client DTO/domain types.
- Keep business enums/status definitions reusable and backend-owned.
- Avoid importing web-only UI types into shared packages.

### 3) Auth and session posture

- Standardize bearer token extraction in server context.
- Maintain role + tenancy checks in service layer.
- Keep onboarding/auth flows documented for both web and potential mobile.

### 4) Storage and media

- Centralize storage logic in upload/storage service modules.
- Keep bucket/path naming deterministic and client-agnostic.
- Use signed URLs for private assets and short-lived access.

### 5) Notification and async jobs

- Keep email/SMS/push trigger points in backend services/jobs.
- Prefer event-driven internal contracts so new channels can be added later.

### 6) Observability and reliability

- Add consistent error codes/messages from services.
- Log workflow transitions and permission denials for cross-client debugging.
- Track API latency/error metrics per endpoint.

## Candidate Mobile Paths (When You Decide)

### Path A: React Native + TypeScript

- Best reuse of TypeScript mental model and domain types.
- Can share validation/constants from `packages/*`.
- Keep using server APIs for privileged operations.

### Path B: Flutter or Native (Kotlin/Swift)

- Keep backend unchanged.
- Add a thin public/mobile API adapter if direct tRPC consumption is not ideal.
- Reuse backend contracts and workflow states exactly.

## Trigger Criteria for Choosing Mobile Framework

Choose framework only when these are defined:

- Primary user persona for mobile (host ops, guest booking, or both)
- Offline requirements and push notification depth
- Team hiring profile and maintenance budget
- Native capability needs (camera, background sync, location, biometrics)

## Delivery Sequence (Future)

1. **Stabilize server contracts** (complete core feature APIs and tests).
2. **Introduce API compatibility layer** only if needed by chosen mobile stack.
3. **Build mobile MVP** around highest-value journeys:
   - Host: bookings + calendar + notifications
   - Guest: search + booking + form submission
4. **Expand parity** with dashboard/public web features in phases.

## Definition of "Mobile-Ready" for This Repo

This repo is considered mobile-ready when:

- Core business workflows are fully enforceable server-side.
- API contracts are documented and stable.
- Auth/session and tenancy checks are centralized.
- Shared types are reusable without web-specific coupling.
- Docs and rules explicitly enforce client-agnostic architecture.

---

**Status:** Active guidance  
**Date:** 2026-04-30
