# Temporary Unlock Feature - Implementation Summary

## Overview
Added a customizable temporary unlock feature to the document verification system. This allows users to access the travel desk for a configurable number of days after uploading their documents, even before admin approval.

## Key Features

### 1. **Configurable Unlock Duration**
- Default: 7 days
- Configurable range: 1-30 days
- Admins can adjust this in the Policy Configuration page

### 2. **Automatic Access Management**
- **When documents are uploaded**: Users get immediate access for the configured duration
- **During unlock period**: Full access to travel desk features
- **After unlock expires**: Access is locked until documents are approved
- **If rejected**: No temporary unlock (immediate lock)

### 3. **Visual Indicators**
Users see clear status messages showing:
- Days remaining in temporary access period
- Warning when access is about to expire (≤2 days)
- Notification when access has expired

## Technical Implementation

### Type Changes (`types.ts`)
```typescript
// Added to UserDocument
uploadedAt?: string; // Timestamp when document was uploaded/saved

// Added to PolicyConfig
temporaryUnlockDays: number; // Days to unlock access after document upload
```

### Logic Changes (`App.tsx`)

#### Enhanced `isUserVerified` Function
- Checks if documents are approved (permanent access)
- Falls back to temporary unlock check if not approved
- Calculates days since upload and compares with policy setting
- Rejected documents don't get temporary unlock

#### Updated `handleFileUpload`
- Sets `uploadedAt` timestamp when documents are saved
- Enables tracking of when temporary unlock period started

#### Policy Management UI
- New input field for "Temporary Unlock Duration"
- Only visible when "Enforce Verification" is enabled
- Includes helpful description of the feature

#### Profile/Onboarding View
- Shows countdown of days remaining
- Color-coded alerts (amber for active, rose for expired)
- Different messages based on urgency

## User Experience Flow

### Scenario 1: New User Upload
1. User uploads passport photo and ID proof
2. Clicks "Save Changes"
3. System grants 7-day temporary access (default)
4. User sees: "You have 7 days remaining to use the travel desk..."

### Scenario 2: Approaching Expiration
1. User has 2 days left in temporary period
2. Warning message appears: "Please ensure your documents are approved soon..."
3. User can still access all features

### Scenario 3: Expired Access
1. 7 days have passed without admin approval
2. User is locked out
3. Message: "Your temporary access period has ended..."
4. Access restored once admin approves documents

### Scenario 4: Admin Approval
1. Admin approves documents
2. User gets permanent access
3. No more countdown messages

## Testing

### Test Users in Mock Data
- **Priyanka Dangwal** (u1): Documents uploaded 2 days ago → 5 days remaining
- **Verification Test User** (u2): Documents uploaded 5 days ago → 2 days remaining

### How to Test
1. Switch to "Employee" role
2. Log in as Priyanka or Test User
3. View profile to see temporary unlock status
4. Switch to "Admin" role
5. Go to Policies → Adjust "Temporary Unlock Duration"
6. Switch back to Employee to see updated countdown

## Configuration

Admins can configure the unlock duration in:
**Admin → Policies → Compliance & Limits → Temporary Unlock Duration**

The setting only appears when "Enforce Verification" is enabled.

## Benefits

1. **Better User Experience**: Users don't have to wait for admin approval to start using the system
2. **Flexibility**: Admins can adjust the grace period based on their review capacity
3. **Security**: Still maintains verification requirements with time-bound access
4. **Transparency**: Users always know their access status and time remaining
