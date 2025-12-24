# Loan Management API Documentation
## Base URL
```
http://localhost:5001/api
```
## Authentication
All endpoints require a Bearer token in the Authorization header.

## 🎯 Frontend Implementation Guide

### **What Your Frontend Team Needs to Build:**

#### **Borrower App Features:**
1. **Payment Screen**: Form to select payment mode (cash/online) and type (one-time/installment)
2. **File Upload**: Allow borrowers to upload payment proof (receipts, bank statements)
3. **Payment History**: Display all payments with their confirmation status
4. **Loan Status Dashboard**: Show current balance, payment status, overdue alerts

#### **Lender App Features:**
1. **Pending Payments Dashboard**: List all payments waiting for approval
2. **Payment Review Screen**: View payment details and proof documents
3. **Approve/Reject Actions**: Buttons to confirm or reject payments with notes
4. **Loan Management**: View loan status, payment history, overdue tracking

#### **Key UI Components Needed:**
- File upload component (images/PDFs)
- Payment form with validation
- Status badges (pending/confirmed/rejected)
- Notification system for payment updates
- Pagination for payment lists

#### **Important Notes for Frontend:**
- Use `multipart/form-data` for payment submissions (file uploads)
- Handle file size limits (5MB max)
- Show loading states during payment submission
- Implement proper error handling for all API responses
- Use pagination for lender's pending payments list

---

**Header Format:**
```
Authorization: Bearer <your-jwt-token>
```

---

## 📋 Table of Contents

1. [Get All Borrowers](#1-get-all-borrowers)
2. [Search Borrowers](#2-search-borrowers)
3. [Create Loan](#3-create-loan)
4. [Verify Loan (OTP Verification)](#4-verify-loan-otp-verification)

---

## 1. Get All Borrowers

Get a paginated list of all borrowers in the system.

### Endpoint
```
GET /api/borrower/borrowers
```

### Headers
```
Authorization: Bearer <token>
Content-Type: application/json
```

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number for pagination |
| `limit` | number | No | 10 | Number of items per page |

### Request Example

```bash
GET http://localhost:5001/api/borrower/borrowers?page=1&limit=10
```

### Success Response (200 OK)

```json
{
  "message": "Borrowers fetched successfully",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "userName": "John Doe",
      "email": "john@example.com",
      "mobileNo": "+919876543210",
      "aadharCardNo": "123456789012",
      "address": "123 Main Street, City, State",
      "roleId": 2,
      "profileImage": "https://example.com/image.jpg",
      "panCardNumber": "ABCDE1234F",
      "isMobileVerified": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "totalDocuments": 50,
    "currentPage": 1,
    "totalPages": 5
  }
}
```

### Error Responses

**404 Not Found**
```json
{
  "message": "No borrowers found",
  "data": [],
  "pagination": {
    "totalDocuments": 0,
    "currentPage": 1,
    "totalPages": 0
  }
}
```

**500 Internal Server Error**
```json
{
  "message": "Server error. Please try again later.",
  "error": "Error message"
}
```

---

## 2. Search Borrowers

Search borrowers by name, Aadhar number, or phone number.

### Endpoint
```
GET /api/borrower/borrowers/search
```

### Headers
```
Authorization: Bearer <token>
Content-Type: application/json
```

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `search` | string | **Yes** | - | Search term (name, Aadhar, or phone) |
| `page` | number | No | 1 | Page number for pagination |
| `limit` | number | No | 10 | Number of items per page |

### Request Examples

**Search by Name:**
```bash
GET http://localhost:5001/api/borrower/borrowers/search?search=John&page=1&limit=10
```

**Search by Aadhar Number:**
```bash
GET http://localhost:5001/api/borrower/borrowers/search?search=123456789012
```

**Search by Phone Number:**
```bash
GET http://localhost:5001/api/borrower/borrowers/search?search=9876543210
```

### Success Response (200 OK)

```json
{
  "message": "Borrowers fetched successfully",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "userName": "John Doe",
      "email": "john@example.com",
      "mobileNo": "+919876543210",
      "aadharCardNo": "123456789012",
      "address": "123 Main Street, City, State",
      "roleId": 2,
      "profileImage": "https://example.com/image.jpg",
      "panCardNumber": "ABCDE1234F",
      "isMobileVerified": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "totalDocuments": 5,
    "currentPage": 1,
    "totalPages": 1
  }
}
```

### Error Responses

**400 Bad Request** (Missing search query)
```json
{
  "message": "Search query is required"
}
```

**404 Not Found**
```json
{
  "message": "No borrowers found matching the search criteria",
  "data": [],
  "pagination": {
    "totalDocuments": 0,
    "currentPage": 1,
    "totalPages": 0
  }
}
```

---

## 3. Create Loan

Create a new loan for a borrower. OTP will be sent to borrower's mobile number.

### Endpoint
```
POST /api/lender/loans/create
```

### Headers
```
Authorization: Bearer <lender-token>
Content-Type: application/json
```

### Request Body

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `name` | string | **Yes** | Borrower's full name | "John Doe" |
| `aadharCardNo` | string | **Yes** | Borrower's 12-digit Aadhar number | "123456789012" |
| `mobileNumber` | string | **Yes** | Borrower's 10-digit mobile number | "9876543210" |
| `address` | string | **Yes** | Borrower's complete address | "123 Main Street, City, State, PIN 123456" |
| `amount` | number | **Yes** | Loan amount (minimum ₹1000) | 50000 |
| `purpose` | string | **Yes** | Purpose of the loan | "Home renovation" |
| `loanGivenDate` | string (ISO date) | **Yes** | Date when loan is given | "2024-01-15T10:30:00.000Z" |
| `loanEndDate` | string (ISO date) | **Yes** | Loan due date (must be today or future) | "2024-12-31T23:59:59.000Z" |
| `loanMode` | string | **Yes** | Payment mode: "cash" or "online" | "cash" |

### Request Example

```json
{
  "name": "John Doe",
  "aadharCardNo": "123456789012",
  "mobileNumber": "9876543210",
  "address": "123 Main Street, City, State, PIN 123456",
  "amount": 50000,
  "purpose": "Home renovation",
  "loanGivenDate": "2024-01-15T10:30:00.000Z",
  "loanEndDate": "2024-12-31T23:59:59.000Z",
  "loanMode": "cash"
}
```

### Success Response (201 Created)

```json
{
  "success": true,
  "message": "Loan created successfully. OTP sent to borrower's mobile number.",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "aadhaarNumber": "123456789012",
    "mobileNumber": "9876543210",
    "address": "123 Main Street, City, State, PIN 123456",
    "amount": 50000,
    "purpose": "Home renovation",
    "loanGivenDate": "2024-01-15T10:30:00.000Z",
    "loanEndDate": "2024-12-31T23:59:59.000Z",
    "loanMode": "cash",
    "status": "pending",
    "borrowerAcceptanceStatus": "pending",
    "otp": "1234",
    "loanConfirmed": false,
    "otpExpiry": "2024-01-15T10:40:00.000Z",
    "loanStartDate": "2024-01-15T10:30:00.000Z",
    "agreement": "LOAN AGREEMENT\n\nThis agreement is made...",
    "lenderId": {
      "_id": "507f1f77bcf86cd799439012",
      "userName": "Lender Name",
      "email": "lender@example.com",
      "mobileNo": "+919876543210",
      "profileImage": "https://example.com/lender.jpg"
    },
    "borrowerId": "507f1f77bcf86cd799439013",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z",
    "otpMessage": "Use this OTP to confirm the loan. OTP is valid for 10 minutes."
  }
}
```

### Error Responses

**400 Bad Request** (Missing required fields)
```json
{
  "success": false,
  "message": "Missing required fields",
  "missingFields": ["loanGivenDate", "loanMode"]
}
```

**400 Bad Request** (Invalid loanMode)
```json
{
  "success": false,
  "message": "loanMode must be either 'cash' or 'online'"
}
```

**400 Bad Request** (Self-loan attempt)
```json
{
  "message": "You cannot give a loan to yourself"
}
```

**404 Not Found** (Borrower not found)
```json
{
  "success": false,
  "message": "Borrower with the provided Aadhar number does not exist or is not a borrower"
}
```

**403 Forbidden** (Not a lender)
```json
{
  "success": false,
  "message": "Access denied. Only lenders can perform this action.",
  "code": "FORBIDDEN"
}
```

**400 Bad Request** (Validation error)
```json
{
  "message": "Validation error",
  "errors": [
    "Loan amount must be at least 1000",
    "Loan end date cannot be in the past"
  ]
}
```

---

## 4. Verify Loan (OTP Verification)

Verify OTP and confirm the loan. When OTP is verified, borrower automatically accepts the loan.

### Endpoint
```
POST /api/lender/loans/verify-otp
```

### Headers
```
Authorization: Bearer <lender-token>
Content-Type: application/json
```

### Request Body

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `loanId` | string | **Yes** | Loan ID from create loan response | "507f1f77bcf86cd799439011" |
| `otp` | string | **Yes** | OTP code (static: "1234" for testing) | "1234" |

### Request Example

```json
{
  "loanId": "507f1f77bcf86cd799439011",
  "otp": "1234"
}
```

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Loan confirmed successfully. Borrower has accepted the loan.",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "aadhaarNumber": "123456789012",
    "mobileNumber": "9876543210",
    "address": "123 Main Street, City, State, PIN 123456",
    "amount": 50000,
    "purpose": "Home renovation",
    "loanGivenDate": "2024-01-15T10:30:00.000Z",
    "loanEndDate": "2024-12-31T23:59:59.000Z",
    "loanMode": "cash",
    "status": "pending",
    "borrowerAcceptanceStatus": "accepted",
    "loanConfirmed": true,
    "otpExpiry": "2024-01-15T10:40:00.000Z",
    "loanStartDate": "2024-01-15T10:30:00.000Z",
    "agreement": "LOAN AGREEMENT\n\nThis agreement is made...",
    "lenderId": {
      "_id": "507f1f77bcf86cd799439012",
      "userName": "Lender Name",
      "email": "lender@example.com",
      "mobileNo": "+919876543210",
      "profileImage": "https://example.com/lender.jpg"
    },
    "borrowerId": {
      "_id": "507f1f77bcf86cd799439013",
      "userName": "John Doe",
      "email": "john@example.com",
      "mobileNo": "+919876543210",
      "aadharCardNo": "123456789012"
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:35:00.000Z"
  }
}
```

### Error Responses

**400 Bad Request** (Missing fields)
```json
{
  "success": false,
  "message": "loanId and otp are required"
}
```

**404 Not Found** (Loan not found)
```json
{
  "success": false,
  "message": "Loan not found"
}
```

**403 Forbidden** (Not authorized)
```json
{
  "success": false,
  "message": "You can only confirm loans that you created",
  "code": "FORBIDDEN"
}
```

**400 Bad Request** (Loan already confirmed)
```json
{
  "success": false,
  "message": "Loan is already confirmed"
}
```

**400 Bad Request** (OTP expired)
```json
{
  "success": false,
  "message": "OTP has expired. Please create a new loan.",
  "code": "OTP_EXPIRED"
}
```

**400 Bad Request** (Invalid OTP)
```json
{
  "success": false,
  "message": "Invalid OTP",
  "code": "INVALID_OTP"
}
```

**500 Internal Server Error**
```json
{
  "success": false,
  "message": "Server error. Please try again later.",
  "error": "Error message"
}
```

---

## 📝 Important Notes

### OTP Information
- **Static OTP**: Currently using static OTP `"1234"` for all loans (for testing)
- **OTP Expiry**: OTP is valid for 10 minutes
- **OTP Verification**: When OTP is verified, `loanConfirmed` becomes `true` and `borrowerAcceptanceStatus` automatically becomes `"accepted"`

### Loan Status Flow
1. **Created** → `loanConfirmed: false`, `paymentStatus: "pending"`, `borrowerAcceptanceStatus: "pending"`
2. **OTP Verified** → `loanConfirmed: true`, `paymentStatus: "pending"`, `borrowerAcceptanceStatus: "accepted"` (automatic)
3. **Lender Marks Paid** → `paymentStatus: "paid"`

### Field Validations
- `aadharCardNo`: Must be exactly 12 digits (numbers only)
- `mobileNumber`: Must be exactly 10 digits
- `amount`: Minimum ₹1000
- `loanMode`: Only accepts `"cash"` or `"online"`
- `loanEndDate`: Must be today or future date (ISO 8601 format)

### Date Format
All dates should be in ISO 8601 format:
```
"2024-01-15T10:30:00.000Z"
```

---

## 🔐 Authentication Flow

1. **Sign Up/Login** → Get JWT token
2. **Use Token** → Include in Authorization header for all requests
3. **Token Format** → `Bearer <your-token>`

### Example Authentication Header
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 📊 Response Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error, missing fields) |
| 401 | Unauthorized (invalid/expired token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 500 | Internal Server Error |

---

## 🧪 Testing Examples

### cURL Examples

**Get All Borrowers:**
```bash
curl -X GET "http://localhost:5001/api/borrower/borrowers?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Search Borrowers:**
```bash
curl -X GET "http://localhost:5001/api/borrower/borrowers/search?search=John" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Create Loan:**
```bash
curl -X POST "http://localhost:5001/api/lender/loans/create" \
  -H "Authorization: Bearer YOUR_LENDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "aadharCardNo": "123456789012",
    "mobileNumber": "9876543210",
    "address": "123 Main Street, City, State",
    "amount": 50000,
    "purpose": "Home renovation",
    "loanGivenDate": "2024-01-15T10:30:00.000Z",
    "loanEndDate": "2024-12-31T23:59:59.000Z",
    "loanMode": "cash"
  }'
```

**Verify OTP:**
```bash
curl -X POST "http://localhost:5001/api/lender/loans/verify-otp" \
  -H "Authorization: Bearer YOUR_LENDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "loanId": "507f1f77bcf86cd799439011",
    "otp": "1234"
  }'
```

---

## 💰 Payment System APIs

### Overview
The payment system supports both cash and online payment modes with one-time and installment payment types. Borrowers can submit payments with optional proof uploads, and lenders can review and confirm/reject these payments.

### Payment Flow
1. **Borrower submits payment** with proof (optional for cash, recommended for both)
2. **Lender receives notification** of pending payment
3. **Lender reviews payment** and uploaded proof
4. **Lender confirms or rejects** the payment
5. **System updates loan status** and sends notifications

### Payment Statuses
- `pending`: Payment submitted, awaiting lender confirmation
- `confirmed`: Payment verified and accepted by lender
- `rejected`: Payment rejected by lender

### Loan Payment Statuses
- `pending`: Loan created, no payments made
- `part paid`: Some payments made but loan not fully paid
- `paid`: Loan fully paid
- `overdue`: Loan past due date with outstanding balance

---

## Borrower Loan APIs

### 1. Get My Loans
**Endpoint:** `GET /api/borrower/loans/my-loans`  
**Authentication:** Not Required  
**Query Parameters:** borrowerId required + pagination and filtering support

Get all loans for a borrower by borrower ID (no authentication token needed).

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `borrowerId` | string | Yes | - | Borrower ID (MongoDB ObjectId) |
| `page` | number | No | 1 | Page number |
| `limit` | number | No | 10 | Items per page |
| `startDate` | string | No | - | Filter loans from this date (YYYY-MM-DD) |
| `endDate` | string | No | - | Filter loans until this date (YYYY-MM-DD) |
| `status` | string | No | - | Filter by payment status ("pending", "part paid", "paid", "overdue") |
| `minAmount` | number | No | - | Minimum loan amount |
| `maxAmount` | number | No | - | Maximum loan amount |
| `search` | string | No | - | Search by lender name, email, or phone |

#### Example Request
```bash
curl -X GET "http://localhost:5001/api/borrower/loans/my-loans?borrowerId=507f1f77bcf86cd799439011&page=1&limit=10&status=part%20paid"
```

#### Success Response (200)
```json
{
  "message": "Borrower loans retrieved successfully",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Borrower Name",
      "amount": 5000,
      "paymentStatus": "part paid",
      "remainingAmount": 2500,
      "totalPaid": 2500,
      "loanEndDate": "2026-01-15T23:59:59.000Z",
      "lenderId": {
        "userName": "Lender Name",
        "email": "lender@example.com",
        "mobileNo": "+919999999999"
      }
    }
  ],
  "summary": {
    "totalLoans": 3,
    "activeLoans": 2,
    "completedLoans": 1,
    "overdueLoans": 0,
    "totalAmountBorrowed": 15000,
    "totalAmountPaid": 7500,
    "totalAmountRemaining": 7500
  },
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalItems": 3,
    "itemsPerPage": 10
  }
}
```

---

### 2. Get Loans by Aadhaar
**Endpoint:** `GET /api/borrower/loans/by-aadhar`  
**Authentication:** Required (Borrower)  
**Query Parameters:** Required `aadhaarNumber` + pagination and filtering

Get loans by Aadhaar number (alternative to my-loans if you want to specify Aadhaar).

#### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `aadhaarNumber` | string | Yes | Aadhaar number to search |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Items per page (default: 10) |
| `startDate` | string | No | Filter from date |
| `endDate` | string | No | Filter to date |
| `status` | string | No | Payment status filter |
| `minAmount` | number | No | Minimum amount |
| `maxAmount` | number | No | Maximum amount |
| `search` | string | No | Search lenders |

---

## Borrower Payment APIs

### 1. Make Loan Payment
**Endpoint:** `POST /api/borrower/loans/payment/:loanId`  
**Authentication:** Required (Borrower)  
**Content-Type:** `multipart/form-data`

Submit a payment for a loan. Supports both cash and online payments with optional proof upload.

#### Request Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `loanId` | string | Yes | Loan ID in URL path |
| `paymentMode` | string | Yes | "cash" or "online" |
| `paymentType` | string | Yes | "one-time" or "installment" |
| `amount` | number | Yes | Payment amount |
| `transactionId` | string | No | Transaction ID (for online payments) |
| `notes` | string | No | Additional notes |
| `paymentProof` | file | No | Payment proof (JPEG, JPG, PNG, PDF) |

#### Example Request
```bash
curl -X POST "http://localhost:5001/api/borrower/loans/payment/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer YOUR_BORROWER_TOKEN" \
  -F "paymentMode=cash" \
  -F "paymentType=one-time" \
  -F "amount=5000" \
  -F "notes=Paid via cash at lender's office" \
  -F "paymentProof=@receipt.jpg"
```
#### Success Response (200)
```json
{
  "message": "Payment submitted successfully. Awaiting lender confirmation.",
  "data": {
    "loanId": "507f1f77bcf86cd799439011",
    "paymentAmount": 5000,
    "totalPaid": 5000,
    "remainingAmount": 5000,
    "paymentStatus": "part paid",
    "paymentHistory": {
      "_id": "507f1f77bcf86cd799439012",
      "amount": 5000,
      "paymentMode": "cash",
      "paymentType": "one-time",
      "paymentDate": "2024-01-15T10:30:00.000Z",
      "paymentStatus": "pending",
      "paymentProof": "/uploads/payment-proofs/payment-proof-123456789.jpg"
    }
  }
}
```
#### Error Responses
- `400`: Invalid payment data or loan already paid
- `403`: Not authorized to pay for this loan
- `404`: Loan not found

---

### 2. Get Payment History
**Endpoint:** `GET /api/borrower/loans/payment-history/:loanId`  
**Authentication:** Required (Borrower)

Get payment history and current payment status for a specific loan.

#### Request Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `loanId` | string | Yes | Loan ID in URL path |

#### Example Request
```bash
curl -X GET "http://localhost:5001/api/borrower/loans/payment-history/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer YOUR_BORROWER_TOKEN"
```

#### Success Response (200)
```json
{
  "message": "Payment history retrieved successfully",
  "data": {
    "loanId": "507f1f77bcf86cd799439011",
    "totalAmount": 10000,
    "totalPaid": 5000,
    "remainingAmount": 5000,
    "paymentStatus": "part paid",
    "paymentHistory": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "amount": 5000,
        "paymentMode": "cash",
        "paymentType": "one-time",
        "paymentDate": "2024-01-15T10:30:00.000Z",
        "paymentStatus": "confirmed",
        "confirmedAt": "2024-01-15T11:00:00.000Z",
        "paymentProof": "/uploads/payment-proofs/payment-proof-123456789.jpg"
      }
    ],
    "overdueDetails": {
      "isOverdue": false,
      "overdueAmount": 0,
      "overdueDays": 0
    }
  }
}
```

## Lender Payment APIs

### 1. Confirm Payment
**Endpoint:** `PATCH /api/lender/loans/payment/confirm/:loanId/:paymentId`  
**Authentication:** Required (Lender)

Confirm a borrower's payment after reviewing the proof.

#### Request Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `loanId` | string | Yes | Loan ID in URL path |
| `paymentId` | string | Yes | Payment ID in URL path |
| `notes` | string | No | Confirmation notes |

#### Example Request
```bash
curl -X PATCH "http://localhost:5001/api/lender/loans/payment/confirm/507f1f77bcf86cd799439011/507f1f77bcf86cd799439012" \
  -H "Authorization: Bearer YOUR_LENDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Payment confirmed. Receipt matches amount."
  }'
```

#### Success Response (200)
```json
{
  "message": "Payment confirmed successfully",
  "data": {
    "loanId": "507f1f77bcf86cd799439011",
    "paymentId": "507f1f77bcf86cd799439012",
    "confirmedAmount": 5000,
    "totalPaid": 5000,
    "remainingAmount": 5000,
    "paymentStatus": "part paid"
  }
}
```

### 2. Reject Payment
**Endpoint:** `PATCH /api/lender/loans/payment/reject/:loanId/:paymentId`  
**Authentication:** Required (Lender)

Reject a borrower's payment with a reason.

#### Request Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `loanId` | string | Yes | Loan ID in URL path |
| `paymentId` | string | Yes | Payment ID in URL path |
| `reason` | string | Yes | Reason for rejection |

#### Example Request
```bash
curl -X PATCH "http://localhost:5001/api/lender/loans/payment/reject/507f1f77bcf86cd799439011/507f1f77bcf86cd799439012" \
  -H "Authorization: Bearer YOUR_LENDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Receipt amount does not match claimed payment"
  }'
```

#### Success Response (200)
```json
{
  "message": "Payment rejected successfully",
  "data": {
    "loanId": "507f1f77bcf86cd799439011",
    "paymentId": "507f1f77bcf86cd799439012",
    "rejectedAmount": 5000,
    "reason": "Receipt amount does not match claimed payment"
  }
}
```

---

### 3. Get Pending Payments
**Endpoint:** `GET /api/lender/loans/payments/pending`  
**Authentication:** Required (Lender)  
**Query Parameters:** Pagination support

Get all pending payments that require lender review.

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number |
| `limit` | number | No | 10 | Items per page |

#### Example Request
```bash
curl -X GET "http://localhost:5001/api/lender/loans/payments/pending?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_LENDER_TOKEN"
```

#### Success Response (200)
```json
{
  "message": "Pending payments retrieved successfully",
  "data": [
    {
      "loanId": "507f1f77bcf86cd799439011",
      "loanName": "John Doe",
      "totalAmount": 10000,
      "totalPaid": 0,
      "remainingAmount": 10000,
      "borrowerAadhaar": "123456789012",
      "pendingPayments": [
        {
          "_id": "507f1f77bcf86cd799439012",
          "amount": 5000,
          "paymentMode": "cash",
          "paymentType": "one-time",
          "paymentDate": "2024-01-15T10:30:00.000Z",
          "paymentProof": "/uploads/payment-proofs/payment-proof-123456789.jpg",
          "notes": "Paid via cash at office"
        }
      ]
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalItems": 1,
    "itemsPerPage": 10
  }
}
```

## Payment Business Logic

### One-time Payment
- **Full Payment**: If amount ≥ remaining balance → Status: "paid", Remaining: 0
- **Partial Payment**: Amount < remaining balance → Status: "part paid"

### Installment Payment
- Always sets status to "part paid"
- Tracks paid installments vs total installments
- Calculates next due date based on frequency

### Overdue Detection
- Automatically checks if loan end date has passed
- Updates status to "overdue" if balance remains
- Tracks overdue days and amount

### Payment Confirmation Flow
1. Borrower submits payment → Status: "pending"
2. Lender reviews → Confirms/Rejects
3. On confirmation → Updates loan totals and status
4. On rejection → Payment marked as rejected with reason

---

## 📋 Frontend Development Checklist

### **Borrower App Implementation:**
- [ ] Loan dashboard using `GET /api/borrower/loans/my-loans?borrowerId={id}`
- [ ] Payment form with mode selection (cash/online)
- [ ] Payment type selection (one-time/installment)
- [ ] File upload component for payment proofs
- [ ] Payment history screen with status indicators
- [ ] Current loan balance display
- [ ] Overdue payment alerts/notifications
- [ ] Loan filtering and search functionality
- [ ] Error handling for payment submissions

### **Lender App Implementation:**
- [ ] Pending payments dashboard with pagination
- [ ] Payment review screen with proof viewing
- [ ] Approve/reject buttons with confirmation dialogs
- [ ] Payment notes/reason input for rejections
- [ ] Real-time notifications for new payments
- [ ] Loan status overview with payment tracking

### **Shared Components:**
- [ ] File viewer for payment proofs (images/PDFs)
- [ ] Status badges (pending/confirmed/rejected/overdue)
- [ ] Amount formatting and currency display
- [ ] Date/time formatting for payment dates
- [ ] Loading states and error boundaries

### **API Integration Points:**
- [ ] Authentication token handling
- [ ] File upload with proper headers
- [ ] Error response parsing and user feedback
- [ ] Pagination handling for large lists
- [ ] Real-time updates (websockets/polling)

---

## 📞 Support

For any issues or questions, please contact the development team.