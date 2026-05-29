---
name: mobile-readiness
description: Framework-agnostic mobile readiness skill for keeping KameOps backend, docs, and architecture prepared for a future mobile app without locking into React Native early.
---

# Mobile Readiness Skill

Use this skill when you need to keep the repo future-ready for mobile while building web features.

## When to Use

- Introducing or changing APIs
- Updating service-layer workflows
- Adding auth/session logic
- Changing storage/upload/media flows
- Planning roadmap or architecture decisions

## Primary Goal

Keep domain logic and contracts client-neutral so a future mobile app (React Native, Flutter, Kotlin/Swift, etc.) can integrate without major rewrites.

## Checklist

1. **Business logic location**
   - Confirm critical workflow logic lives in server services.
   - Avoid implementing domain transitions only in UI components.

2. **API contract quality**
   - Require Zod validation for all new inputs.
   - Keep explicit, stable response shapes.
   - Return actionable error codes/messages for cross-client handling.

3. **Multi-tenant enforcement**
   - Verify organization/property scoping in every query/mutation.
   - Ensure server verifies access, not just client assumptions.

4. **Abstraction boundaries**
   - Keep storage/payment/notification providers behind service abstractions.
   - Avoid direct vendor SDK coupling in feature UI code.

5. **Shared contracts**
   - Move reusable domain contracts to `packages/types` where practical.
   - Keep shared packages free from Next.js/web-only imports.

## Decision Policy (React Native vs Other)

Do not choose a mobile framework by default. Decide only after:

- mobile user journeys are prioritized,
- native/offline/push requirements are documented,
- and backend contracts are stable and tested.

## References

- `docs/architecture/mobile-readiness.md`
- `docs/architecture/backend-platform-evaluation.md`
- `docs/architecture/tech-stack.md`
- `docs/implementation/roadmap.md`
