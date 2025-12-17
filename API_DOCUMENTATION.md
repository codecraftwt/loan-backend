# Loan Management API Documentation

## Base URL
```
http://localhost:5001/api
```

## Authentication
All endpoints require a Bearer token in the Authorization header.

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
1. **Created** → `loanConfirmed: false`, `status: "pending"`, `borrowerAcceptanceStatus: "pending"`
2. **OTP Verified** → `loanConfirmed: true`, `status: "pending"`, `borrowerAcceptanceStatus: "accepted"` (automatic)
3. **Lender Marks Paid** → `status: "paid"`

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

## 📞 Support

For any issues or questions, please contact the development team.


