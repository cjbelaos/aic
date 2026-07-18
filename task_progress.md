# Implementation Checklist - Quotation Management System

## Phase 1: Database/Sheet Layer Changes

- [ ] Add `status` field to Quotation type
- [ ] Extend sheet range to include status column (A2:K)
- [ ] Implement `getQuotationsByDate()` for daily sequence generation
- [ ] Implement `generateQuotationNumber()` in quotationSheets.ts
- [ ] Modify `addQuotation` to include status field
- [ ] Add `updateQuotationStatus()` function
- [ ] Fix `addQuotation` to use append on proper rows (not fixed ranges)
- [ ] Fix `logQuotationWorkflow` to include proper status handling

## Phase 2: API Routes

- [ ] Create `/api/quotations/approve` route
- [ ] Create `/api/users/[username]` route for user lookup by username
- [ ] Rewrite `/api/quotations/save-and-email` for role-based workflow
  - [ ] vcarmona: Send to client
  - [ ] Regular user: Send approval request to vcarmona

## Phase 3: Service Layer

- [ ] Add `getUserByUsername()` to frontend user.service.ts
- [ ] Add `approveQuotation()` to frontend quotation.service.ts

## Phase 4: Frontend Components

- [ ] Update `QuotationTemplate` to handle role-specific actions
- [ ] Update `QuotationForm` to use proper status flow
- [ ] Update `QuotationsPage` for approval workflow UI
- [ ] Add proper email templates in save-and-email route

## Phase 5: Permission & Polish

- [ ] Ensure delete/update permission checks for non-vcarmona users
- [ ] Add toast notifications for all actions
- [ ] Final testing and verification
