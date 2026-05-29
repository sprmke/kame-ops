# Tech Stack Recommendations

## Overview

This document outlines the recommended technology stack for **KameOps**, considering scalability, developer experience, and long-term maintainability.

## Backend Platform Decision (2026-04)

For a detailed platform comparison (current multi-stack vs full Supabase vs hybrid), see:

- [Backend Platform Evaluation](./backend-platform-evaluation.md)
- [Supabase Storage Integration Plan](./supabase-storage-integration-plan.md)

Current recommended direction:

- Keep **Next.js + tRPC + Drizzle + TypeScript service layer** for core business logic.
- Use **Supabase Postgres and Supabase Storage** to reduce infrastructure overhead.
- Use **Supabase Auth** as the default authentication platform for web and mobile clients.
- Use Supabase Edge/Cron selectively for isolated jobs, not primary domain orchestration.

## Mobile Readiness (Framework-Agnostic)

For full guidance, see [Mobile Readiness Plan](./mobile-readiness.md).

- Do not couple business rules to web-only components.
- Keep workflow-critical logic in service layer + protected APIs.
- Keep shared DTO/domain typing in `packages/types`.
- Preserve provider abstractions (storage/email/payments) so mobile clients can reuse backend capabilities.
- Decide mobile framework later using product and team constraints, not current UI implementation convenience.

## Frontend Stack

### Core Framework

**Next.js 16+ (App Router with Turbopack)**

- **Why**: Server-side rendering, API routes, excellent developer experience
- **Benefits**:
  - Built-in routing and API endpoints
  - Server Components for better performance
  - Turbopack stable for both dev and build (faster builds)
  - React Compiler stable (automatic memoization)
  - Image optimization
  - TypeScript support out of the box
  - Easy deployment on Vercel
  - Built-in DevTools MCP for AI-assisted debugging

**React 19+**

- **Why**: Latest React features and performance improvements
- **Benefits**:
  - Server Components fully stable
  - `use` hook for async data
  - `ref` as prop (no more forwardRef)
  - Document metadata in components
  - Activity component for pre-rendering
  - useEffectEvent hook

### Language

**TypeScript**

- **Why**: Type safety, better IDE support, fewer runtime errors
- **Benefits**:
  - Catch errors during development
  - Better code documentation
  - Enhanced refactoring capabilities

### UI Framework & Styling

**Tailwind CSS + Shadcn UI**

- **Why**: Utility-first CSS with pre-built accessible components
- **Benefits**:
  - Fast development
  - Consistent design system
  - Highly customizable
  - Built-in accessibility
  - Small bundle size

### State Management

**Zustand + TanStack Query v5**

- **Zustand**: For client-side UI state
- **TanStack Query v5**: For server state management and caching
- **Why**:
  - Simple and lightweight
  - Excellent TypeScript support
  - Built-in caching and optimistic updates
  - First-class Suspense support with `useSuspenseQuery`
  - Reduces boilerplate
  - ~20% smaller bundle than v4

**TanStack Table v8**

- **Why**: Headless, powerful data tables
- **Benefits**:
  - Framework agnostic with React adapter
  - Excellent TypeScript support
  - Built-in sorting, filtering, pagination
  - Column helper for type-safe column definitions

### Form Management

**React Hook Form + Zod**

- **Why**: Best performance for complex forms (Guest Form Editor)
- **Benefits**:
  - Minimal re-renders
  - Built-in validation
  - Type-safe schemas with Zod
  - Easy integration with custom fields

### Calendar Component

**FullCalendar or React Big Calendar**

- **Why**: Robust calendar functionality with customization options
- **Alternative**: Build custom calendar for maximum control over styling

### Drag & Drop (Form Editor)

**@dnd-kit/core**

- **Why**: Modern, accessible drag-and-drop toolkit
- **Benefits**:
  - Excellent TypeScript support
  - Accessibility built-in
  - Touch screen support
  - Better performance than react-beautiful-dnd

### Rich Text/Form Preview

**Lexical or Tiptap**-

- **Why**: Modern WYSIWYG editors for rich content
- **Use case**: If guest forms need rich text input

### Charts & Visualization

**Recharts or Chart.js**

- **Why**: For payment analytics and reporting
- **Benefits**:
  - React-friendly
  - Responsive
  - Customizable

## Backend Stack

### Framework

**Next.js API Routes + tRPC**

- **Why**: Type-safe API layer without code generation
- **Benefits**:
  - End-to-end type safety
  - No need for REST or GraphQL boilerplate
  - Automatic client generation
  - Perfect for TypeScript monorepo

### Database

**PostgreSQL (Primary Database)**

- **Why**:
  - Robust ACID compliance
  - Excellent for relational data
  - JSON support for flexible schemas
  - Mature ecosystem
  - Supports complex queries

**Redis (Caching & Sessions)**

- **Why**: Fast in-memory caching for session management
- **Use cases**:
  - Session storage
  - Rate limiting
  - Caching frequently accessed data

### ORM

**Drizzle ORM**

- **Why**: Lightweight, SQL-like, type-safe database access
- **Benefits**:
  - Excellent TypeScript support with zero runtime overhead
  - SQL-like syntax (easier for SQL-familiar developers)
  - Smaller bundle size (~7.4KB vs Prisma's ~2MB)
  - No code generation step required
  - Drizzle Studio for visual database browsing
  - Better performance (closer to raw SQL)
  - Drizzle Kit for migrations

### Authentication

**Supabase Auth**

- **Why**: Native integration with Supabase Postgres, Storage, and mobile SDKs
- **Features**:
  - Multiple providers (Email, Google, Facebook, etc.)
  - Session management
  - JWT or database sessions
  - Built-in security best practices
  - First-party support for email/password, OAuth, and magic links
  - JWT-based sessions that work across web and mobile clients
  - Works well with Next.js App Router and server-side auth checks

### File Storage

**Supabase Storage**

- **Why**: Integrated object storage with simpler operations and generous free tier for current stage
- **Use cases**:
  - Guest documents and ID uploads
  - Property images and media
  - Calendar images
  - Exported reports
- **Benefits**:
  - Built-in CDN delivery on public assets
  - Signed upload/download URLs for private buckets
  - Tight integration with Supabase Postgres metadata
  - Straightforward bucket policies and access control
  - Lower initial ops overhead with unified storage tooling
  - Easy to keep provider-agnostic via `upload.service` abstraction

### Email Service

**Resend or SendGrid**

- **Why**: Transactional emails for booking notifications, invitations
- **Resend benefits**:
  - Modern API
  - React Email support
  - Better developer experience

### Payment Processing

**PayMongo or Stripe**

- **PayMongo**: If focusing on Philippine market (supports GCash, etc.)
- **Stripe**: For international support and better developer experience
- **Use cases**:
  - Subscription billing
  - Per-booking payments

### Background Jobs

**BullMQ + Redis**

- **Why**: Reliable job queue system
- **Use cases**:
  - Email sending
  - Calendar sync
  - Payment processing
  - AI agent message processing

### AI Integration

**OpenAI API or Anthropic Claude**

- **Why**: For AI Agent feature
- **Use cases**:
  - Auto-reply system
  - Message analysis
  - FAQ matching

## Infrastructure & DevOps

### Hosting

**Vercel (Frontend & API)**

- **Why**:
  - Best Next.js hosting experience
  - Automatic deployments
  - Edge functions
  - Built-in analytics
  - Preview deployments

### Database Hosting

**Supabase Postgres**

- **Why**: Managed PostgreSQL tightly integrated with Supabase platform services
- **Benefits**:
  - Serverless with auto-scaling
  - Built-in project-level integration with Supabase Auth and Storage
  - Generous free tier for early-stage applications
  - Built-in connection pooling
  - Instant database provisioning
  - Native Drizzle ORM support
  - Strong operational tooling through Supabase dashboard

### Monitoring & Analytics

**Sentry (Error Tracking)**

- Real-time error monitoring
- Performance tracking

**Vercel Analytics**

- Web vitals
- User analytics

**PostHog (Optional)**

- Product analytics
- Feature flags
- Session recording

### Version Control & CI/CD

**GitHub**

- Version control
- GitHub Actions for CI/CD
- Automated testing
- Deployment workflows

## Development Tools

### Runtime & Package Manager

**Bun**

- **Why**: All-in-one JavaScript runtime, bundler, and package manager
- **Benefits**:
  - Extremely fast package installation
  - Built-in TypeScript support (no transpilation needed)
  - Native test runner
  - Drop-in Node.js replacement
  - Excellent monorepo support
  - Faster script execution

### Code Quality

**ESLint + Prettier**

- Code formatting and linting
- Consistent code style

**Husky + lint-staged**

- Pre-commit hooks
- Run linters before commits

**Commitlint**

- Enforce conventional commits
- Better changelog generation

### Testing

**Vitest (Unit Tests)**

- Fast, Vite-powered testing
- Compatible with Jest APIs

**Playwright (E2E Tests)**

- Reliable end-to-end testing
- Cross-browser support

**Testing Library**

- Component testing
- User-centric testing approach

### API Documentation

**tRPC automatically generates types**

- No need for Swagger with tRPC
- Type-safe API client

## Project Structure (Monorepo)

### Workspace Setup

**Turborepo with Bun workspaces**

- **Why**: Manage multiple packages efficiently
- **Structure**:
  ```
  apps/
    web/              # Main Next.js application
    admin/            # Admin dashboard (optional separate app)
  packages/
    database/         # Drizzle schema and client
    ui/               # Shared UI components
    config/           # Shared configs (ESLint, TS, Tailwind)
    types/            # Shared TypeScript types
    emails/           # Email templates (React Email)
    utils/            # Shared utilities
  ```

## Security Considerations

### Authentication & Authorization

- Row-level security with Drizzle query helpers
- Role-based access control (RBAC)
- Organization-level data isolation
- JWT with refresh tokens

### Data Protection

- Input validation with Zod
- SQL injection prevention (Drizzle parameterized queries)
- XSS prevention (React by default)
- CSRF protection (Supabase Auth token flow + server-side boundary checks)
- Rate limiting (Upstash Rate Limit)

### Compliance

- GDPR considerations for guest data
- Data encryption at rest
- Secure file uploads
- Audit logs for sensitive actions

## Scalability Considerations

### Database

- Connection pooling (via database provider or pooler like PgBouncer)
- Read replicas for heavy read operations
- Proper indexing strategy
- Query optimization (Drizzle's SQL-like syntax enables fine-tuned queries)

### Caching Strategy

- Redis for session data
- TanStack Query for client-side caching
- Next.js ISR for static content
- CDN-backed storage delivery for static assets

### File Storage

- Supabase Storage bucket strategy (public vs private by asset class)
- Signed URLs for secure access to private assets
- Optional image transformation at upload/read layer

## Cost Estimates (Starting)

### Free Tier Available

- Vercel: Free for hobby projects
- Supabase: Free PostgreSQL + auth + storage baseline tier
- Upstash: Free Redis tier
- Resend: Free tier for emails
- GitHub: Free for public/private repos

### Paid Services (After Launch)

- PayMongo/Stripe: Transaction fees
- OpenAI: Pay per API call
- Vercel Pro: ~$20/month (when needed)
- Database: ~$10-30/month (scale as needed)

## Migration Strategy for Existing Guest Form

### Analysis Requirements

1. Export current schema/structure
2. Map to new database schema
3. Create migration scripts
4. Ensure backward compatibility
5. Test thoroughly before deployment

### Integration Points

- Guest form data → New booking system
- Form configurations → New form editor
- Guest submissions → New database schema

## Recommended VS Code Extensions

- ESLint
- Prettier
- Tailwind CSS IntelliSense
- Drizzle ORM (if available) or SQL syntax highlighting
- GitLens
- Error Lens
- TypeScript Error Translator
- Console Ninja
- Bun for VS Code

## Next Steps

1. Set up development environment with Bun
2. Initialize Next.js + TypeScript project
3. Configure Drizzle ORM with PostgreSQL
4. Set up tRPC
5. Implement authentication
6. Create base project structure
7. Start with core features

---

**Last Updated**: 2026-04-30
**Version**: 4.2

### Version History

- **4.2** (2026-04-30): Switched storage standard to Supabase Storage and aligned scaling guidance
- **4.1** (2026-04-30): Updated auth recommendation to Supabase Auth and aligned security notes
- **4.0** (2026-01-20): Finalized Supabase Postgres/Auth/Storage platform baseline
- **3.0** (2026-01-20): Switched to Drizzle ORM and Bun runtime
- **2.0** (2026-01-20): Updated to Next.js 16+, React 19+, TanStack Query v5, TanStack Table v8
- **1.0** (2025-11-24): Initial tech stack documentation
