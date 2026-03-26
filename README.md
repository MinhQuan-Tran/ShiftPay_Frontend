# ShiftPay Frontend

ShiftPay is a shift and earnings tracker for hourly work. This repository contains the Vue client that lets users log shifts, review schedules, estimate earnings, keep data locally, and sync to the backend after sign-in.

## Live demo

[https://shiftpay-mqtran.netlify.app/](https://shiftpay-mqtran.netlify.app/)

## What this frontend covers

- Daily and weekly schedule views for recorded shifts
- Earnings, billable time, total time, and break-time calculations
- Shift creation, editing, deletion, and import flows
- Local-first persistence for signed-out use
- Sync flows for shifts, templates, and workplace data after authentication
- Onboarding, changelog, and app-shell interactions built into the main experience

## Tech stack

- Vue 3
- Vite
- TypeScript
- Pinia
- Azure MSAL Browser

## Repository layout

The application source lives under the `ShiftPay/` directory inside this repository.

- `ShiftPay/src/App.vue` — app shell, navigation menu, sync flow, and top-level schedule composition
- `ShiftPay/src/stores/` — state management for auth, shifts, templates, workplace info, and session state
- `ShiftPay/src/models/` — parsing, validation, and pay/time calculation logic
- `ShiftPay/src/components/` — reusable UI for weekly and daily schedule views, dialogs, and controls
- `ShiftPay/src/api.ts` — authenticated API wrapper used by the stores

## Local development

### Prerequisites

- Node.js
- npm
- A running ShiftPay backend instance

### Run locally

1. Open the app directory:
   ```bash
   cd ShiftPay
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env.local` file:
   ```bash
   VITE_API_URL=https://localhost:7222
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

### Useful scripts

```bash
npm run dev
npm run build
npm run test
npm run lint
```

## Related repositories

- [ShiftPay Backend](https://github.com/MinhQuan-Tran/ShiftPay_Backend)
- [ShiftPay Documentation](https://github.com/MinhQuan-Tran/ShiftPay_Document)
