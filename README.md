# DemandEarn-AI Project

This project contains various scripts for managing AI campaigns and leads.

## How to run scripts

To run the TypeScript scripts in this project, you need to have Node.js and npm installed. The required dependencies are listed in `package.json`.

First, install the dependencies:
```bash
npm install
```

Then, you can run a specific script using `npx tsx`:
```bash
npx tsx <script-name>.ts
```

For example, to find and create missed qualified leads, run:
```bash
npx tsx find-missed-qualified-leads.ts
```

To check for potentially qualified calls, run:
```bash
npx tsx check-qualified-calls.ts
```