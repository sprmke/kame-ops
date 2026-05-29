---
name: supabase-storage
description: Supabase Storage skill for implementing secure uploads, signed URLs, and provider-agnostic storage architecture. Use when working with file storage and media uploads.
---

# Supabase Storage Skill

This skill standardizes storage on Supabase while preserving future portability via `upload.service`.

## Tech Stack Context

- **Storage**: Supabase Storage
- **Database**: Supabase Postgres + Drizzle
- **API Layer**: tRPC
- **Architecture Rule**: all upload/read/delete operations go through `upload.service`

## Environment Variables

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET_PUBLIC=
SUPABASE_STORAGE_BUCKET_PRIVATE=
```

## Required Architecture Pattern

1. Keep provider-specific code inside `src/server/services/upload.service.ts`.
2. Never call Supabase storage directly from feature components.
3. Expose provider-agnostic methods:
   - `createUploadUrl()`
   - `getPublicUrl()`
   - `createSignedDownloadUrl()`
   - `removeObject()`
4. Persist only `storageKey` + bucket classification in DB, not provider-specific URLs.

## Bucket Strategy

- `public` bucket: property photos and marketing assets.
- `private` bucket: IDs, contracts, receipts, and sensitive documents.
- Use signed URLs for all private asset access.

## tRPC Integration Pattern

```typescript
// server/routers/uploads.ts
export const uploadsRouter = router({
  createPropertyImageUploadUrl: protectedProcedure
    .input(
      z.object({ propertyId: z.string().uuid(), filename: z.string(), contentType: z.string() })
    )
    .mutation(async ({ ctx, input }) => {
      await checkPermission(ctx.user.id, 'properties:write', input.propertyId);
      return uploadService.createUploadUrl({
        scope: 'property-image',
        entityId: input.propertyId,
        filename: input.filename,
        contentType: input.contentType,
      });
    }),
});
```

## Security Requirements

- Validate MIME type and max file size before issuing upload URL.
- Verify tenant/property ownership before generating any upload or download URL.
- Use short TTL signed URLs for private assets.
- Ensure private bucket paths are non-guessable (e.g. UUID + random suffix).

## Migration Notes

- New implementations must use Supabase Storage terminology and API patterns.
