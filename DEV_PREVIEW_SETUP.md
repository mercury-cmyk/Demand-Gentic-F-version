# Development Preview Setup Guide

## Quick Start

The Pivotal Marketing Platform requires a PostgreSQL database to run. Follow one of the options below:

### Option 1: Use Neon (Recommended for Quick Demo)

1. **Create a free Neon account:**
   - Go to https://console.neon.tech
   - Sign up with your email

2. **Create a new PostgreSQL project:**
   - Click "New Project"
   - Fill in project name: `pivotal_marketing`
   - Select region closest to you
   - Click "Create project"

3. **Get your connection string:**
   - On the project dashboard, click "Connection string"
   - Copy the `postgresql://` connection string
   - **Make sure to add `?sslmode=require` at the end if not present**

4. **Update the .env.local file:**
   - Open `.env.local` in the root directory
   - Replace the `DATABASE_URL` line with your Neon connection string:
   ```
   DATABASE_URL=postgresql://user:password@ep-xxxxx.region.neon.tech/dbname?sslmode=require
   ```

5. **Start the dev server:**
   ```bash
   npm run dev
   ```
   The server will start on **http://localhost:5000**

### Option 2: Use Docker (Requires Docker Desktop)

If you have Docker installed on your Windows machine:

```bash
# From the project root directory:
docker-compose up -d postgres

# Then start the dev server:
npm run dev
```

This will:
- Start a PostgreSQL 16 container
- Create the database automatically
- Run the server on **http://localhost:5000**

### Option 3: Use Local PostgreSQL

If you have PostgreSQL installed locally:

1. Create a database:
   ```bash
   createdb pivotal_marketing_dev
   ```

2. Update `.env.local`:
   ```
   DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/pivotal_marketing_dev
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

## What You'll See

Once the server starts, you'll see output like:

```
[DB] Development mode - using DATABASE_URL from environment
[DB-INIT] Checking database initialization status...
[DB-INIT] No users found. Initializing with default admin user...
[DB-INIT] ✅ Default admin user created successfully
[DB-INIT] Username: admin
[DB-INIT] Email: admin@crm.local
Setting up Vite development server...
Vite development server ready
serving on port 5000
```

## Accessing the Application

1. **Open your browser to:** http://localhost:5000

2. **Login with:**
   - Username: `admin`
   - Password: `Admin123!`

3. **Explore Phase 6 Features:**
   - **A/B Testing:** Create email variants and track performance
   - **Conditional Personalization:** Use `{{if}}` syntax for dynamic content
   - **Analytics Dashboard:** View campaign metrics and trends
   - **Webhooks:** Register event subscriptions
   - **CRM Integrations:** HubSpot and Salesforce sync

## Troubleshooting

### `DATABASE_URL must be set`
- Make sure you've set the DATABASE_URL in `.env.local`
- Restart the dev server after changes

### `Cannot find module 'email-worker'`
- This has been fixed! The email-worker.ts was created automatically.
- Try running: `npm install` again

### `ECONNREFUSED` or `Connection refused`
- Check if the PostgreSQL database is running
- For Neon: Verify your connection string is correct
- For Docker: Run `docker ps` to check if container is up

### Port 5000 already in use
- Change the port: `PORT=3000 npm run dev`
- Or kill the process using port 5000

## Next Steps

After starting the dev server:

1. **Create a Campaign:** 
   - Go to Campaigns → New Campaign
   - Fill in campaign details
   - Add email content with Phase 6 features

2. **Set up A/B Testing:**
   - Create email variants
   - Compare performance metrics
   - View statistical significance

3. **Use Personalization:**
   - Add `{{if contact.firstName}}` blocks
   - Test conditional rendering
   - Preview personalized emails

4. **View Analytics:**
   - Track opens, clicks, conversions
   - See geographic and device breakdowns
   - Export reports

## Architecture

The Pivotal Marketing Platform consists of:

- **Frontend:** React + Vite (TypeScript)
- **Backend:** Express.js + TypeScript
- **Database:** PostgreSQL with Drizzle ORM
- **Task Queue:** BullMQ (for async email processing)
- **Email Builder:** GrapesJS + Monaco Editor
- **Integrations:** HubSpot, Salesforce, M365, AI services

## Phase 6 Features Implemented

✅ **A/B Testing System**
- Statistical significance testing (Chi-square)
- Multi-metric tracking
- Auto-winner detection

✅ **Conditional Personalization**
- `{{if}}` syntax support
- 7 condition operators
- 4 block types (text, image, button, CTA)

✅ **Analytics Dashboard**
- 11 core metrics
- Daily trending
- Engagement segmentation
- Geographic and device breakdown

✅ **Webhook Events**
- 8 event types
- Exponential backoff retry
- HMAC-SHA256 signature verification

✅ **HubSpot Integration**
- Contact sync
- Campaign event logging
- Deal creation

✅ **Salesforce Integration**
- Lead sync
- Task creation
- Engagement logging

## Documentation

- [Phase 6 Implementation Guide](PHASE6_IMPLEMENTATION_GUIDE.md)
- [Complete Summary](PHASE6_COMPLETE_SUMMARY.md)
- [API Documentation](RESOURCES_CENTER_API_SPEC.md)

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the error messages in the console
3. Check the logs directory for detailed error information
4. Review the documentation files in the root directory

Happy building! 🚀
