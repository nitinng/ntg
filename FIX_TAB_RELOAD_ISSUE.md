# Fix for Page Reloads on Tab Switch

## Problem
The application was experiencing hard reloads whenever you switched Chrome tabs or minimized/restored the browser window.

## Root Cause
This was likely caused by:
1. Vite's HMR (Hot Module Replacement) WebSocket disconnecting when the tab is inactive
2. Chrome's aggressive tab discarding to save memory
3. Vite's error overlay potentially triggering reloads

## Solutions Implemented

### 1. Updated Vite Configuration (`vite.config.ts`)
- **Disabled HMR overlay**: Prevents error overlays from causing full page reloads
- **Increased WebSocket timeout**: Extended to 60 seconds to prevent disconnections during tab switches
- **Optimized dependencies**: Pre-bundled React and React-DOM to prevent re-bundling
- **Configured file watching**: Disabled polling to reduce resource usage

### 2. Added Visibility Change Handler (`App.tsx`)
- Listens for tab visibility changes using the Page Visibility API
- Prevents unnecessary reloads when the tab becomes visible again
- Logs visibility changes for debugging

### 3. Implemented localStorage State Persistence (`MailTemplatesView.tsx`)
- Automatically saves form state to localStorage as you type
- Restores drafts when reopening the modal
- Provides a "Clear Draft" button for manual cleanup
- Clears drafts after successful save

## How to Apply the Fix

### Step 1: Restart the Dev Server
**IMPORTANT:** You must restart your dev server for the Vite config changes to take effect.

1. Stop the current dev server (Ctrl+C in the terminal running `npm run dev`)
2. Start it again: `npm run dev`

### Step 2: Test the Fix
1. Open your app in Chrome
2. Start creating a mail template (or do any work)
3. Switch to another Chrome tab
4. Wait a few seconds
5. Switch back to your app tab
6. **The page should NOT reload** - your state should be preserved

### Step 3: Verify in Console
Open Chrome DevTools Console (F12) and you should see:
- `"Tab became visible - maintaining state"` when you switch back to the tab
- No full page reload messages

## Additional Recommendations

If the problem persists after restarting the dev server, try these:

### Option 1: Check Chrome Extensions
Some Chrome extensions can cause tab reloads. Try:
1. Open an Incognito window (Ctrl+Shift+N)
2. Test if the reload still happens there
3. If it doesn't happen in Incognito, disable extensions one by one to find the culprit

### Option 2: Increase Chrome's Tab Memory
Chrome might be discarding your tab to save memory:
1. Go to `chrome://discards/` to see if your tab is being discarded
2. Close other tabs to free up memory
3. Restart Chrome

### Option 3: Build and Test Production Version
If the issue only happens in development:
```bash
npm run build
npm run preview
```
This will test if it's a Vite dev server issue.

## What Changed

### Files Modified:
1. **vite.config.ts** - Updated HMR and server configuration
2. **App.tsx** - Added visibility change handler
3. **MailTemplatesView.tsx** - Added localStorage persistence (already done)

### Key Changes:
- HMR overlay disabled
- WebSocket timeout increased from default (30s) to 60s
- Visibility change event listener added
- Form state persisted to localStorage
