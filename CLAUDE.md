# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (Next.js)
npm run build        # Production build
npm run lint         # ESLint via next lint

npm run db:push      # Apply schema changes to DB (use this — migrate dev is blocked by host permissions)
npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:seed      # Seed initial data (tsx prisma/seed.ts)
npm run db:studio    # Open Prisma Studio GUI
```

**Important:** `prisma migrate dev` will fail — the hosted MySQL instance at Hostinger (srv1434.hstgr.io) lacks shadow database permissions. Always use `db:push` for schema changes.

**Important:** After `db:push`, if the dev server is running the Prisma client DLL will be locked on Windows. The user must restart the dev server before `db:generate` can succeed.

## Architecture

### Stack
- **Next.js 16** (App Router) with **React 19**
- **Prisma 6** + MySQL (hosted on Hostinger)
- **NextAuth v5 beta** — JWT strategy, 8-hour sessions, credentials provider only
- **shadcn/ui** + **Tailwind CSS v4** — design tokens via OKLCH CSS variables in `globals.css`
- **Pino** for structured logging
- **Anthropic SDK** for AI features
- **Nodemailer** for SMTP email
- External WhatsApp service via `WHATSAPP_SERVICE_URL` + `WHATSAPP_API_KEY` env vars

### Role System
Three roles with cascading permissions: `SUPERADMIN > ADMIN > OPERATOR`.
- **OPERATOR**: CRUD on leads, clients, installers; create activities/visits/calls
- **ADMIN**: All above + delete contacts, access products/sales/quotes/payments/suppliers
- **SUPERADMIN**: All above + WhatsApp module, user management

Role is stored in JWT and re-validated on every token refresh against the DB (`auth.ts:62-68`). Always access it from the session: `session.user.role`.

### Unified Contact Model
Leads, Clients, and Installers are a **single `Contact` table** discriminated by `type: ContactType` (`LEAD | CLIENT | INSTALLER`). This means:
- Converting a lead to a client is a single `UPDATE` on the `type` field
- All shared relations (visits, calls, quotes, sales, payments, activities) work across all types
- Installer-specific fields (`hasLocalStore`, `storeAddress`, `installerCountry`, `installerProvince`, `installerDepartment`) are nullable columns on the same table
- Lead-specific fields (`contacted`, `contactMethod`, `vehicleFlowWeekly`, etc.) also live on the same table

### API Route Patterns
All API routes live in `src/app/api/`. Standard pattern for every route:
1. `await auth()` — get session
2. Check `session?.user?.id` → 401 if missing
3. Check role for protected operations
4. Use `prisma` client from `src/lib/prisma.ts`
5. Call `logOperatorAction()` from `src/lib/notifications.ts` for audit trail
6. Use `createLogger("api/module-name")` from `src/lib/logger.ts` for error logging

Route params are async in Next.js 16: always `await params` before destructuring.

### Contact Deletion
Contacts have many cascading relations. The safe deletion order (used in `src/app/api/contacts/[id]/route.ts`) is: payments → remitos → saleItems → sales → quoteItems → quotes → visits → calls → contactTags → activityLogs → leadActivities → contact. Use `prisma.$transaction()` for this. Do not delete contacts via any other path.

### Audit Trail
Every significant action must call `logOperatorAction()` from `src/lib/notifications.ts`. Signature:
```ts
logOperatorAction({ userId, action, entityType, entityId, description, link? })
```
This writes to `OperatorAuditLog`. For OPERATOR role actions that admins should see in real-time, also call `notifyAdmins()`.

### Key Library Files
| File | Purpose |
|---|---|
| `src/lib/auth.ts` | NextAuth config, exports `auth`, `signIn`, `signOut`, `handlers` |
| `src/lib/prisma.ts` | Singleton Prisma client |
| `src/lib/notifications.ts` | `logOperatorAction`, `notifyAdmins`, `buildAssignmentMessage`, `escapeHtml` |
| `src/lib/logger.ts` | Pino logger factory — `createLogger("module-name")` |
| `src/lib/mailer.ts` | Nodemailer transporter, `isSmtpConfigured()`, `FROM` |
| `src/lib/argentina-geo.ts` | `AR_PROVINCES`, `AR_CITIES`, `UY_DEPARTMENTS` |
| `src/lib/utils.ts` | `cn()`, `formatDate()`, `formatDateTime()` |
| `src/contexts/currency-context.tsx` | `CurrencyProvider` + `useCurrency()` hook — ARS/USD toggle, fetches live rate from `/api/dolar` |

### Frontend Architecture
- `src/app/(dashboard)/layout.tsx` wraps all authenticated pages in `<MainLayout>` (client component with sidebar + session check)
- `src/components/layout/app-sidebar.tsx` — navigation, renders items conditionally by role
- `src/components/providers.tsx` — wraps the app with SessionProvider, ThemeProvider, CurrencyProvider
- All dashboard pages are client components (`"use client"`) that fetch data directly from API routes via `fetch()`
- Filters are persisted in `sessionStorage` on list pages (leads, clients)

### Design System
Tailwind CSS v4 with no `tailwind.config.ts`. All design tokens are OKLCH CSS variables defined in `src/app/globals.css` (`:root` and `.dark`). Available semantic tokens: `bg-primary`, `bg-secondary`, `bg-muted`, `bg-card`, `bg-destructive`, `text-foreground`, `text-muted-foreground`, `text-primary`, `border-border`, `bg-background`, and sidebar variants. shadcn/ui components in `src/components/ui/` use these tokens correctly. **Page-level code frequently hardcodes Tailwind color classes (e.g. `bg-orange-500`, `bg-green-50`) instead of tokens — this is a known inconsistency to fix.**

### Environment Variables
Required in `.env`:
```
DATABASE_URL          # MySQL connection string
AUTH_SECRET           # NextAuth JWT secret
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM / SMTP_SECURE
WHATSAPP_SERVICE_URL  # External WhatsApp service base URL
WHATSAPP_API_KEY      # Auth key for WhatsApp service
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ANTHROPIC_API_KEY     # For AI features
```
