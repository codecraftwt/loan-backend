# API Documentation: Recent Activities

## Overview

This documentation covers three separate API endpoints for retrieving recent activities for different user roles:
- **Admin Recent Activities** - Activities related to plan management and subscription purchases
- **Lender Recent Activities** - Activities related to loans given, payments received, and overdue loans
- **Borrower Recent Activities** - Activities related to loans received, payments made, and overdue loans

Each endpoint returns a chronological list of recent activities with detailed information and relative timestamps.

---

# 1. Admin Recent Activities

## Endpoint Information

| Method | Endpoint | Authentication | Access Level |
|--------|----------|----------------|--------------|
| `GET` | `/api/admin/recent-activities` | Required | Admin Only |

**Base URL:** `https://your-domain.com` (or your server base URL)

**Full Endpoint:** `GET /api/admin/recent-activities`

---

## Authentication

This endpoint requires authentication via JWT token.

### Headers

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Note:** The JWT token must belong to a user with Admin role (roleId: 0)

---

## Query Parameters

| Parameter | Type | Required | Default | Description | Example |
|-----------|------|----------|---------|-------------|---------|
| `limit` | integer | No | `10` | Maximum number of activities to return (must be >= 1) | `?limit=20` |

---

## Request Examples

### Example 1: Basic Request
```http
GET /api/admin/recent-activities
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Example 2: With Custom Limit
```http
GET /api/admin/recent-activities?limit=20
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Response Format

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Recent activities fetched successfully",
  "count": 8,
  "data": [
    {
      "type": "subscription_purchased",
      "shortMessage": "Subscription Purchased",
      "message": "John Doe purchased \"Premium Plan\" subscription (₹999/month)",
      "userId": "507f1f77bcf86cd799439011",
      "userName": "John Doe",
      "userEmail": "john@example.com",
      "planId": "507f1f77bcf86cd799439012",
      "planName": "Premium Plan",
      "priceMonthly": 999,
      "duration": "3 months",
      "paymentId": "pay_1234567890abcdef",
      "timestamp": "2024-03-15T10:00:00.000Z",
      "relativeTime": "2 hours ago"
    },
    {
      "type": "plan_updated",
      "shortMessage": "Plan Updated",
      "message": "Plan \"Premium Plan\" was updated",
      "planId": "507f1f77bcf86cd799439012",
      "planName": "Premium Plan",
      "priceMonthly": 999,
      "duration": "3 months",
      "timestamp": "2024-03-14T15:30:00.000Z",
      "relativeTime": "1 day ago"
    },
    {
      "type": "plan_created",
      "shortMessage": "Plan Created",
      "message": "Plan \"Basic Plan\" (₹499/month) was created",
      "planId": "507f1f77bcf86cd799439013",
      "planName": "Basic Plan",
      "priceMonthly": 499,
      "duration": "1 month",
      "timestamp": "2024-03-10T09:00:00.000Z",
      "relativeTime": "5 days ago"
    }
  ]
}
```

---

## Activity Types

### 1. `plan_created`
**Description:** A new subscription plan was created by admin.

**Fields:**
- `type`: "plan_created"
- `shortMessage`: "Plan Created"
- `message`: Description of the created plan
- `planId`: Plan ID
- `planName`: Name of the plan
- `priceMonthly`: Monthly price
- `duration`: Plan duration
- `timestamp`: Creation timestamp
- `relativeTime`: Human-readable relative time

### 2. `plan_updated`
**Description:** An existing subscription plan was updated by admin.

**Fields:**
- `type`: "plan_updated"
- `shortMessage`: "Plan Updated"
- `message`: Description of the updated plan
- `planId`: Plan ID
- `planName`: Name of the plan
- `priceMonthly`: Monthly price
- `duration`: Plan duration
- `timestamp`: Update timestamp
- `relativeTime`: Human-readable relative time

### 3. `subscription_purchased`
**Description:** A lender purchased a subscription plan.

**Fields:**
- `type`: "subscription_purchased"
- `shortMessage`: "Subscription Purchased"
- `message`: Description of the purchase
- `userId`: Lender user ID
- `userName`: Lender name
- `userEmail`: Lender email
- `planId`: Plan ID
- `planName`: Name of the purchased plan
- `priceMonthly`: Monthly price
- `duration`: Plan duration
- `paymentId`: Razorpay payment ID
- `timestamp`: Purchase timestamp
- `relativeTime`: Human-readable relative time

---

# 2. Lender Recent Activities

## Endpoint Information

| Method | Endpoint | Authentication | Access Level |
|--------|----------|----------------|--------------|
| `GET` | `/api/lender/loans/recent-activities` | Required | Lender Only |

**Base URL:** `https://your-domain.com` (or your server base URL)

**Full Endpoint:** `GET /api/lender/loans/recent-activities`

---

## Authentication

This endpoint requires authentication via JWT token.

### Headers

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Note:** The JWT token must belong to a user with Lender role (roleId: 1)

---

## Query Parameters

| Parameter | Type | Required | Default | Description | Example |
|-----------|------|----------|---------|-------------|---------|
| `limit` | integer | No | `10` | Maximum number of activities to return (must be >= 1) | `?limit=20` |

---

## Request Examples

### Example 1: Basic Request
```http
GET /api/lender/loans/recent-activities
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Example 2: With Custom Limit
```http
GET /api/lender/loans/recent-activities?limit=15
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Response Format

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Recent activities fetched successfully",
  "count": 10,
  "data": [
    {
      "type": "payment_received",
      "shortMessage": "Payment Received",
      "message": "You received ₹5000 payment from John Doe",
      "loanId": "507f1f77bcf86cd799439020",
      "loanName": "John Doe",
      "amount": 5000,
      "paymentMode": "online",
      "timestamp": "2024-03-15T14:30:00.000Z",
      "relativeTime": "1 hour ago"
    },
    {
      "type": "loan_created",
      "shortMessage": "Loan Created",
      "message": "You created a loan of ₹10000 for Jane Smith",
      "loanId": "507f1f77bcf86cd799439021",
      "loanName": "Jane Smith",
      "amount": 10000,
      "timestamp": "2024-03-15T10:00:00.000Z",
      "relativeTime": "5 hours ago"
    },
    {
      "type": "loan_accepted",
      "shortMessage": "Loan Accepted",
      "message": "John Doe accepted your loan of ₹5000",
      "loanId": "507f1f77bcf86cd799439020",
      "loanName": "John Doe",
      "amount": 5000,
      "timestamp": "2024-03-14T16:00:00.000Z",
      "relativeTime": "1 day ago"
    },
    {
      "type": "loan_overdue",
      "shortMessage": "Loan Overdue",
      "message": "Loan of ₹15000 to Mike Johnson is overdue by 5 days",
      "loanId": "507f1f77bcf86cd799439022",
      "loanName": "Mike Johnson",
      "amount": 15000,
      "overdueAmount": 15000,
      "overdueDays": 5,
      "timestamp": "2024-03-13T12:00:00.000Z",
      "relativeTime": "2 days ago"
    },
    {
      "type": "loan_paid",
      "shortMessage": "Loan Fully Paid",
      "message": "Loan of ₹8000 to Sarah Williams has been fully paid",
      "loanId": "507f1f77bcf86cd799439023",
      "loanName": "Sarah Williams",
      "amount": 8000,
      "timestamp": "2024-03-12T09:00:00.000Z",
      "relativeTime": "3 days ago"
    },
    {
      "type": "loan_rejected",
      "shortMessage": "Loan Rejected",
      "message": "Tom Brown rejected your loan of ₹12000",
      "loanId": "507f1f77bcf86cd799439024",
      "loanName": "Tom Brown",
      "amount": 12000,
      "timestamp": "2024-03-10T11:00:00.000Z",
      "relativeTime": "5 days ago"
    }
  ]
}
```

---

## Activity Types

### 1. `loan_created`
**Description:** Lender created a new loan for a borrower.

**Fields:**
- `type`: "loan_created"
- `shortMessage`: "Loan Created"
- `message`: Description of the created loan
- `loanId`: Loan ID
- `loanName`: Borrower name
- `amount`: Loan amount
- `timestamp`: Creation timestamp
- `relativeTime`: Human-readable relative time

### 2. `payment_received`
**Description:** Lender received a payment from a borrower.

**Fields:**
- `type`: "payment_received"
- `shortMessage`: "Payment Received"
- `message`: Description of the payment
- `loanId`: Loan ID
- `loanName`: Borrower name
- `amount`: Payment amount
- `paymentMode`: Payment mode ("cash" or "online")
- `timestamp`: Payment confirmation timestamp
- `relativeTime`: Human-readable relative time

### 3. `loan_paid`
**Description:** A loan has been fully paid by the borrower.

**Fields:**
- `type`: "loan_paid"
- `shortMessage`: "Loan Fully Paid"
- `message`: Description of the fully paid loan
- `loanId`: Loan ID
- `loanName`: Borrower name
- `amount`: Loan amount
- `timestamp`: Payment completion timestamp
- `relativeTime`: Human-readable relative time

### 4. `loan_accepted`
**Description:** Borrower accepted a loan from the lender.

**Fields:**
- `type`: "loan_accepted"
- `shortMessage`: "Loan Accepted"
- `message`: Description of the accepted loan
- `loanId`: Loan ID
- `loanName`: Borrower name
- `amount`: Loan amount
- `timestamp`: Acceptance timestamp
- `relativeTime`: Human-readable relative time

### 5. `loan_rejected`
**Description:** Borrower rejected a loan from the lender.

**Fields:**
- `type`: "loan_rejected"
- `shortMessage`: "Loan Rejected"
- `message`: Description of the rejected loan
- `loanId`: Loan ID
- `loanName`: Borrower name
- `amount`: Loan amount
- `timestamp`: Rejection timestamp
- `relativeTime`: Human-readable relative time

### 6. `loan_overdue`
**Description:** A loan has become overdue.

**Fields:**
- `type`: "loan_overdue"
- `shortMessage`: "Loan Overdue"
- `message`: Description of the overdue loan
- `loanId`: Loan ID
- `loanName`: Borrower name
- `amount`: Loan amount
- `overdueAmount`: Overdue amount
- `overdueDays`: Number of days overdue
- `timestamp`: Overdue check timestamp
- `relativeTime`: Human-readable relative time

---

# 3. Borrower Recent Activities

## Endpoint Information

| Method | Endpoint | Authentication | Access Level |
|--------|----------|----------------|--------------|
| `GET` | `/api/borrower/loans/recent-activities` | Required | Borrower Only |

**Base URL:** `https://your-domain.com` (or your server base URL)

**Full Endpoint:** `GET /api/borrower/loans/recent-activities`

---

## Authentication

This endpoint requires authentication via JWT token.

### Headers

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Note:** The JWT token must belong to a user with Borrower role (roleId: 2)

---

## Query Parameters

| Parameter | Type | Required | Default | Description | Example |
|-----------|------|----------|---------|-------------|---------|
| `limit` | integer | No | `10` | Maximum number of activities to return (must be >= 1) | `?limit=20` |

---

## Request Examples

### Example 1: Basic Request
```http
GET /api/borrower/loans/recent-activities
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Example 2: With Custom Limit
```http
GET /api/borrower/loans/recent-activities?limit=15
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Response Format

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Recent activities fetched successfully",
  "count": 10,
  "data": [
    {
      "type": "payment_made",
      "shortMessage": "Payment Made",
      "message": "You paid ₹3000 to John Lender",
      "loanId": "507f1f77bcf86cd799439030",
      "loanName": "Your Name",
      "lenderName": "John Lender",
      "lenderId": "507f1f77bcf86cd799439031",
      "amount": 3000,
      "paymentMode": "online",
      "paymentType": "installment",
      "timestamp": "2024-03-15T16:00:00.000Z",
      "relativeTime": "30 minutes ago"
    },
    {
      "type": "loan_received",
      "shortMessage": "Loan Received",
      "message": "You received a loan of ₹20000 from Jane Lender",
      "loanId": "507f1f77bcf86cd799439032",
      "loanName": "Your Name",
      "lenderName": "Jane Lender",
      "lenderId": "507f1f77bcf86cd799439033",
      "amount": 20000,
      "timestamp": "2024-03-15T10:00:00.000Z",
      "relativeTime": "6 hours ago"
    },
    {
      "type": "loan_accepted",
      "shortMessage": "Loan Accepted",
      "message": "You accepted loan of ₹15000 from Mike Lender",
      "loanId": "507f1f77bcf86cd799439034",
      "loanName": "Your Name",
      "lenderName": "Mike Lender",
      "lenderId": "507f1f77bcf86cd799439035",
      "amount": 15000,
      "timestamp": "2024-03-14T14:00:00.000Z",
      "relativeTime": "1 day ago"
    },
    {
      "type": "loan_overdue",
      "shortMessage": "Loan Overdue",
      "message": "Your loan of ₹25000 from Sarah Lender is overdue by 3 days",
      "loanId": "507f1f77bcf86cd799439036",
      "loanName": "Your Name",
      "lenderName": "Sarah Lender",
      "lenderId": "507f1f77bcf86cd799439037",
      "amount": 25000,
      "overdueAmount": 25000,
      "overdueDays": 3,
      "timestamp": "2024-03-13T08:00:00.000Z",
      "relativeTime": "2 days ago"
    },
    {
      "type": "loan_paid",
      "shortMessage": "Loan Fully Paid",
      "message": "You fully paid the loan of ₹10000 to Tom Lender",
      "loanId": "507f1f77bcf86cd799439038",
      "loanName": "Your Name",
      "lenderName": "Tom Lender",
      "lenderId": "507f1f77bcf86cd799439039",
      "amount": 10000,
      "timestamp": "2024-03-12T12:00:00.000Z",
      "relativeTime": "3 days ago"
    },
    {
      "type": "loan_rejected",
      "shortMessage": "Loan Rejected",
      "message": "You rejected loan of ₹18000 from Lisa Lender",
      "loanId": "507f1f77bcf86cd799439040",
      "loanName": "Your Name",
      "lenderName": "Lisa Lender",
      "lenderId": "507f1f77bcf86cd799439041",
      "amount": 18000,
      "timestamp": "2024-03-10T09:00:00.000Z",
      "relativeTime": "5 days ago"
    }
  ]
}
```

---

## Activity Types

### 1. `loan_received`
**Description:** Borrower received a loan from a lender.

**Fields:**
- `type`: "loan_received"
- `shortMessage`: "Loan Received"
- `message`: Description of the received loan
- `loanId`: Loan ID
- `loanName`: Borrower name
- `lenderName`: Lender name
- `lenderId`: Lender user ID
- `amount`: Loan amount
- `timestamp`: Loan creation timestamp
- `relativeTime`: Human-readable relative time

### 2. `payment_made`
**Description:** Borrower made a payment towards a loan.

**Fields:**
- `type`: "payment_made"
- `shortMessage`: "Payment Made"
- `message`: Description of the payment
- `loanId`: Loan ID
- `loanName`: Borrower name
- `lenderName`: Lender name
- `lenderId`: Lender user ID
- `amount`: Payment amount
- `paymentMode`: Payment mode ("cash" or "online")
- `paymentType`: Payment type ("one-time" or "installment")
- `timestamp`: Payment confirmation timestamp
- `relativeTime`: Human-readable relative time

### 3. `loan_paid`
**Description:** Borrower fully paid a loan.

**Fields:**
- `type`: "loan_paid"
- `shortMessage`: "Loan Fully Paid"
- `message`: Description of the fully paid loan
- `loanId`: Loan ID
- `loanName`: Borrower name
- `lenderName`: Lender name
- `lenderId`: Lender user ID
- `amount`: Loan amount
- `timestamp`: Payment completion timestamp
- `relativeTime`: Human-readable relative time

### 4. `loan_accepted`
**Description:** Borrower accepted a loan from a lender.

**Fields:**
- `type`: "loan_accepted"
- `shortMessage`: "Loan Accepted"
- `message`: Description of the accepted loan
- `loanId`: Loan ID
- `loanName`: Borrower name
- `lenderName`: Lender name
- `lenderId`: Lender user ID
- `amount`: Loan amount
- `timestamp`: Acceptance timestamp
- `relativeTime`: Human-readable relative time

### 5. `loan_rejected`
**Description:** Borrower rejected a loan from a lender.

**Fields:**
- `type`: "loan_rejected"
- `shortMessage`: "Loan Rejected"
- `message`: Description of the rejected loan
- `loanId`: Loan ID
- `loanName`: Borrower name
- `lenderName`: Lender name
- `lenderId`: Lender user ID
- `amount`: Loan amount
- `timestamp`: Rejection timestamp
- `relativeTime`: Human-readable relative time

### 6. `loan_overdue`
**Description:** A loan has become overdue.

**Fields:**
- `type`: "loan_overdue"
- `shortMessage`: "Loan Overdue"
- `message`: Description of the overdue loan
- `loanId`: Loan ID
- `loanName`: Borrower name
- `lenderName`: Lender name
- `lenderId`: Lender user ID
- `amount`: Loan amount
- `overdueAmount`: Overdue amount
- `overdueDays`: Number of days overdue
- `timestamp`: Overdue check timestamp
- `relativeTime`: Human-readable relative time

---

## Common Response Fields

All three endpoints share these common response fields:

### Root Level
| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Indicates if the request was successful |
| `message` | string | Human-readable message describing the result |
| `count` | integer | Number of activities in the response |
| `data` | array | Array of activity objects |

### Activity Object (Common Fields)
| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Type of activity (varies by endpoint) |
| `shortMessage` | string | Short description of the activity |
| `message` | string | Full description of the activity |
| `timestamp` | string (ISO 8601) | When the activity occurred |
| `relativeTime` | string | Human-readable relative time (e.g., "2 hours ago") |

---

## Error Responses

### 401 Unauthorized

**Scenario:** Missing or invalid authentication token

```json
{
  "success": false,
  "message": "Unauthorized. Please login first."
}
```

**HTTP Status Code:** `401`

---

### 403 Forbidden

**Scenario:** User is authenticated but doesn't have the required role

**For Admin endpoint:**
```json
{
  "success": false,
  "message": "Access denied. Only admins can perform this action.",
  "code": "FORBIDDEN"
}
```

**For Lender endpoint:**
```json
{
  "success": false,
  "message": "Access denied. Only lenders can perform this action.",
  "code": "FORBIDDEN"
}
```

**For Borrower endpoint:**
```json
{
  "success": false,
  "message": "Access denied. Only borrowers can perform this action.",
  "code": "FORBIDDEN"
}
```

**HTTP Status Code:** `403`

---

### 404 Not Found

**Scenario:** (Borrower only) Borrower profile not found or Aadhaar number missing

```json
{
  "success": false,
  "message": "Borrower profile not found or Aadhaar number missing"
}
```

**HTTP Status Code:** `404`

---

### 500 Internal Server Error

**Scenario:** Server-side error occurred

```json
{
  "success": false,
  "message": "Server error. Please try again later.",
  "error": "Error message details"
}
```

**HTTP Status Code:** `500`

---

## Use Cases

### Admin Use Cases

1. **Dashboard Activity Feed**
   - Display recent plan creations, updates, and subscription purchases
   - Monitor system activity and user engagement

2. **Plan Management Tracking**
   - Track when plans are created or modified
   - Monitor plan popularity through purchase activities

3. **Subscription Monitoring**
   - View recent subscription purchases
   - Track revenue-generating activities

### Lender Use Cases

1. **Loan Management Dashboard**
   - View all recent loan-related activities
   - Track loan creation, acceptance, and payments

2. **Payment Tracking**
   - Monitor payments received from borrowers
   - Identify fully paid loans

3. **Overdue Loan Alerts**
   - Get notified about overdue loans
   - Track overdue status and days

4. **Borrower Interaction**
   - See when borrowers accept or reject loans
   - Monitor loan status changes

### Borrower Use Cases

1. **Loan History Dashboard**
   - View all loans received from lenders
   - Track loan acceptance and rejection

2. **Payment Tracking**
   - Monitor payments made to lenders
   - Track payment history and status

3. **Overdue Loan Alerts**
   - Get notified about overdue loans
   - Track overdue status and take action

4. **Loan Status Monitoring**
   - See when loans are received
   - Track loan acceptance/rejection status

---

## Notes & Important Information

### Activity Sorting
- All activities are sorted by timestamp in descending order (most recent first)
- Activities are deduplicated to avoid showing the same activity multiple times

### Relative Time Format
The `relativeTime` field provides human-readable time differences:
- Seconds: "30 seconds ago"
- Minutes: "5 minutes ago"
- Hours: "2 hours ago"
- Days: "3 days ago"
- Months: "2 months ago"
- Years: "1 year ago"

### Activity Limits
- Default limit is 10 activities per request
- Maximum recommended limit is 50 to ensure good performance
- Activities are fetched from multiple sources and then sorted and limited

### Data Freshness
- Activities are based on real-time data from the database
- Payment activities show only confirmed payments
- Overdue loans are checked based on the last overdue check timestamp

### Performance Considerations
- For better performance, use appropriate limit values
- Activities are fetched from multiple collections and then merged
- Consider caching on the frontend for frequently accessed data

### Empty Results
If no activities exist:
- `count` will be `0`
- `data` will be an empty array `[]`
- The API still returns a successful response (200 OK)