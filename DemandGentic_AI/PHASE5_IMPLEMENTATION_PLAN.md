# Phase 5: LinkedIn Sales Navigator Integration Plan

## Overview
Phase 5 focuses on integrating LinkedIn Sales Navigator into the Pivotal platform. This allows users to connect their LinkedIn accounts, search for prospects directly within the CRM (or import from Sales Navigator), and sync lead data.

## Features
1. **LinkedIn Account Connection**: OAuth flow or secure credential management to connect Sales Navigator accounts.
2. **Lead Search & Import**: Interface to search LinkedIn prospects and import them as Contacts/Leads.
3. **Data Enrichment**: Enrich existing contacts with LinkedIn profile data.

## Technical Architecture

### 1. Database Schema Updates
We will introduce a `linkedin_accounts` table to manage connections, similar to `mailbox_accounts`.
- `id`: UUID
- `userId`: Reference to User
- `createAt`: Timestamp
- `accessToken`: Encrypted token
- `refreshToken`: Encrypted token
- `expiresAt`: Timestamp
- `status`: 'active' | 'expired' | 'disconnected'

### 2. Backend Services
- **`server/services/linkedin-service.ts`**: Service to handle LinkedIn API interactions (Authentication, Profile Search, Profile Details). *Note: Due to LinkedIn API restrictions, this will be designed to work with official partner APIs or simulation tools.*
- **`server/routes/linkedin-routes.ts`**: Express routes for frontend interaction.

### 3. Frontend Components
- **`LinkedinIntegrationPage`**: Main dashboard for LinkedIn tools.
- **`LinkedinConnectButton`**: Component to initiate connection.
- **`LinkedinSearch`**: Search interface for prospects.
- **`ImportWizard`**: To map LinkedIn fields to CRM Contact fields.

## Implementation Steps

### Step 1: Schema Definition
Update `shared/schema.ts` to include `linkedinAccounts` table and related Zod schemas.

### Step 2: Backend Logic
Create the service and routes to handle authentication and data fetching. We will include a "Mock Mode" for development/demo since live LinkedIn API access requires strict app verification.

### Step 3: Frontend UI
Build the integration page, connection flow, and import UI using the existing design system (Carbon/Shadcn).

### Step 4: Integration
Connect the frontend to the backend endpoints and verify the flow from "Connect" -> "Search" -> "Import" -> "Contact Created".