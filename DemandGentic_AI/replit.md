# Pivotal B2B CRM

## Overview
Pivotal CRM is an enterprise B2B customer relationship management platform designed to optimize sales and marketing through Account-Based Marketing (ABM) and multi-channel campaign management (Email & Telemarketing). It features advanced lead qualification, robust compliance (DNC/Unsubscribe), comprehensive lead QA workflows, and a "bridge model" linking campaigns to orders via a client portal. The platform aims to drive sales growth and operational efficiency for B2B enterprises by providing a comprehensive, intelligent solution for customer engagement.

## User Preferences
- Clean, minimal enterprise design
- Professional blue color scheme (trust, reliability)
- Dense information display with clear hierarchy
- Fast, keyboard-friendly workflows
- Comprehensive but not overwhelming

## System Architecture
The system utilizes a modern web stack: **React 18 + Vite, TypeScript, TailwindCSS, and shadcn/ui** for the frontend, and **Node.js + Express + TypeScript** with **PostgreSQL (Neon) via Drizzle ORM** for the backend. JWT authentication provides role-based access control. The architecture is optimized for 3+ million contacts with multi-tier connection pooling, advanced retry logic, and high-throughput CSV imports, utilizing a dual-pool architecture for database connections and 6 concurrent BullMQ workers for CSV imports. It operates as a single-tenant architecture where accounts and contacts are shared across all users, with pipelines using a 'default-tenant'.

**Database Migrations:** Explicit SQL migrations (in `server/migrations/`) are used for schema changes, with schema initialization functions running on server startup to ensure runtime constraints.

**Background Jobs:** AI Quality Jobs (transcription, analysis), System Maintenance (Lock Sweeper), and On-Demand Jobs (Email Validation, AI Enrichment, M365 Email Sync).

**UI/UX Design:** Features a Royal Blue with Teal accent color scheme, Inter font for text and JetBrains Mono for data. shadcn/ui components ensure consistency, including role-based sidebar navigation, global search, data tables, and step wizards. Key features include advanced filtering, dual-view architecture for accounts with state preservation, enterprise-standard navigation, and mobile-first responsive design.

**Technical Implementations & Features:**
- **AI-Powered Quality Assurance:** Integrates with AssemblyAI and OpenAI for lead qualification, account enrichment, and pipeline insights.
- **3-Tier Phone Enrichment System:** Optimizes phone coverage with a cost-efficient hybrid approach involving company-level phone reuse, lowered AI confidence thresholds, and multi-query consensus validation.
- **LinkedIn Profile Image Verification:** Uses Gemini 2.0 Flash Vision AI for verification with S3 storage and a BullMQ pipeline.
- **Companies House UK API Integration:** Automates company validation with caching.
- **AI-Driven Custom Qualification System:** Allows campaign managers to define natural language qualification criteria for dynamic evaluation.
- **Telnyx Recording Sync:** Automated webhook-based recording synchronization.
- **Data Management:** Unified CSV Import/Export with deduplication, dynamic custom fields, company name normalization, RBAC, and AI-powered smart mapping (GPT-4o-mini). High-performance contact upload uses PostgreSQL COPY.
- **Compliance & Suppression:** Multi-tier suppression for emails and phones with API support.
- **Campaign Management:** Supports Email campaigns (HTML editor, personalization) and Telemarketing campaigns (dual dialer, call scripts, Telnyx integration, intelligent retry scheduling).
- **ElevenLabs AI Voice Agent System:** Autonomous AI outbound calling with campaign compliance checks, disposition handling (including voicemail caps), DNC auto-suppression, qualified lead auto-creation, and phone normalization.
- **OpenAI Realtime Voice API Integration:** Production-ready AI calling via OpenAI's GPT-4o Realtime API with g711_ulaw audio (direct Telnyx compatibility), function-calling for real-time disposition detection (submit_disposition, schedule_callback, transfer_to_human), comprehensive session validation (run/campaign/contact/queue_item/virtualAgentId chain), idempotent call termination with proper lock release, and 10-second connection timeout with automatic cleanup. WebSocket endpoint at `/openai-realtime-dialer`.
- **Hybrid Campaign Agent System:** Unifies workflow for both AI and human agents within the same campaign queue, allowing flexible assignment and routing.
- **Lead QA Workflow:** Multi-stage workflow with checklist validation, recording sync, and asynchronous email validation.
- **Client Portal (Bridge Model):** Configurable webhooks for client campaign order requirements.
- **Lead Delivery Template System:** Automatic webhook-based lead delivery with configurable templates and retry logic.
- **3-Layer Hybrid Email Verification System:** Cost-optimized email validation combining in-house fast validation with Kickbox deep verification and smart caching.
- **Smart Workflow Trigger System:** Triggers automated processing (eligibility, email validation, enrichment) only when verification campaigns reach a 20% job title coverage threshold.
- **Intelligent Sales Operating System:** AI-powered deal intelligence with an append-only `deal_activities` ledger, multi-touchpoint lead capture, AI scoring fields, AI-generated `deal_insights`, M365 email conversation tracking, and a score audit trail.
- **Microsoft 365 Integration:** PKCE-secured OAuth for email sync, automated sequences, and tracking, including an M365 Email Sync Engine and Inbox/Composer.
- **Email Communication Hub:** Enterprise-grade dual-inbox system with Primary/Other categorization, user-specific tracking, search, and bulk operations.
- **Email Sequence Engine:** Automated multi-step email campaigns using BullMQ.
- **Security & User Management:** JWT, bcrypt, multi-role RBAC with server-side ownership enforcement.
- **S3-First File Architecture:** Direct-to-S3 uploads, streaming CSV processing, presigned URLs.
- **BullMQ Job Queue System:** Redis-backed asynchronous job processing with configurable lock durations for long-running tasks.
- **Ultra-Fast Contact Import (PostgreSQL COPY):** Production-optimized CSV import with significant performance improvements.

## External Dependencies
- **Database:** Neon (PostgreSQL)
- **Object Storage:** AWS S3 / Cloudflare R2 / Wasabi / MinIO (S3-compatible)
- **Cache & Queue:** Redis (Upstash)
- **Frontend Framework:** React 18
- **UI Component Library:** shadcn/ui
- **Routing:** Wouter
- **Data Fetching:** TanStack Query
- **Form Management:** React Hook Form
- **Charting:** Recharts
- **Animations:** Framer Motion
- **Authentication:** JWT
- **Password Hashing:** bcrypt
- **Telephony Integration:** Telnyx WebRTC
- **AI Services:** AssemblyAI, Replit AI (OpenAI-compatible), Gemini AI (Google)
- **Email Service Providers:** SendGrid, AWS SES, Mailgun
- **Microsoft 365 Integration:** Microsoft Graph API
- **Job Queue:** BullMQ
- **Domain Parsing:** tldts
- **Companies House UK API:** Company validation and profile retrieval
- **Email Verification:** Kickbox API