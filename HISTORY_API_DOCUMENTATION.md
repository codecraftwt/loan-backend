# Loan and Borrower History API Documentation

## Base URL
```
http://localhost:5001/api/history
```

## Authentication
All endpoints require a Bearer token in the Authorization header.

**Header Format:**
```
Authorization: Bearer <your-jwt-token>
```

---

## 📋 Table of Contents

1. [Get All Borrowers History](#1-get-all-borrowers-history)
2. [Get Borrower History by Lender ID](#2-get-borrower-history-by-lender-id)
3. [Get Borrower History by Borrower ID](#3-get-borrower-history-by-borrower-id)
4. [Get Borrower History by Borrower ID and Lender ID](#4-get-borrower-history-by-borrower-id-and-lender-id)
5. [Get All Loans by Lender ID](#5-get-all-loans-by-lender-id)

---

## 1. Get All Borrowers History

Get all borrowers history without any lender or borrower ID filter. Returns all loans in the system with borrower and lender details.

### Endpoint
```
GET /api/history/borrowers
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
| `startDate` | string (ISO date) | No | - | Filter loans from this date onwards (loanGivenDate) |
| `endDate` | string (ISO date) | No | - | Filter loans up to this date (loanEndDate) |
| `paymentStatus` | string | No | - | Filter by loan payment status: "pending" or "paid" |
| `minAmount` | number | No | - | Minimum loan amount filter |
| `maxAmount` | number | No | - | Maximum loan amount filter |
| `search` | string | No | - | Search by borrower name (case-insensitive) |

### Request Example

```bash
GET http://localhost:5001/api/history/borrowers?page=1&limit=10&paymentStatus=pending
```

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "All borrowers history fetched successfully",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "aadhaarNumber": "123456789012",
      "mobileNumber": "9876543210",
      "address": "123 Main Street, City, State",
      "amount": 50000,
      "purpose": "Home renovation",
      "loanGivenDate": "2024-01-15T10:30:00.000Z",
      "loanEndDate": "2024-12-31T23:59:59.000Z",
      "loanMode": "cash",
      "paymentStatus": "pending",
      "borrowerAcceptanceStatus": "accepted",
      "loanConfirmed": true,
      "lenderId": {
        "_id": "507f1f77bcf86cd799439012",
        "userName": "Lender Name",
        "email": "lender@example.com",
        "mobileNo": "+919876543210",
        "profileImage": "https://example.com/lender.jpg",
        "aadharCardNo": "987654321098"
      },
      "borrowerId": {
        "_id": "507f1f77bcf86cd799439013",
        "userName": "John Doe",
        "email": "john@example.com",
        "mobileNo": "+919876543210",
        "profileImage": "https://example.com/borrower.jpg",
        "aadharCardNo": "123456789012"
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:35:00.000Z"
    }
  ],
  "pagination": {
    "totalDocuments": 50,
    "currentPage": 1,
    "totalPages": 5,
    "limit": 10
  }
}
```

### Error Responses

**404 Not Found**
```json
{
  "success": false,
  "message": "No borrower history found",
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
  "success": false,
  "message": "Server error. Please try again later.",
  "error": "Error message"
}
```

---

## 2. Get Borrower History by Lender ID

Get all loans given by a specific lender. Returns borrower history filtered by lender ID.

### Endpoint
```
GET /api/history/borrowers/lender/:lenderId
```

### Headers
```
Authorization: Bearer <token>
Content-Type: application/json
```

### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lenderId` | string (MongoDB ObjectId) | **Yes** | The ID of the lender |

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number for pagination |
| `limit` | number | No | 10 | Number of items per page |
| `startDate` | string (ISO date) | No | - | Filter loans from this date onwards |
| `endDate` | string (ISO date) | No | - | Filter loans up to this date |
| `paymentStatus` | string | No | - | Filter by loan payment status: "pending" or "paid" |
| `minAmount` | number | No | - | Minimum loan amount filter |
| `maxAmount` | number | No | - | Maximum loan amount filter |
| `search` | string | No | - | Search by borrower name (case-insensitive) |

### Request Example

```bash
GET http://localhost:5001/api/history/borrowers/lender/507f1f77bcf86cd799439012?page=1&limit=10&paymentStatus=pending
```

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Borrower history fetched successfully",
  "lender": {
    "_id": "507f1f77bcf86cd799439012",
    "userName": "Lender Name",
    "email": "lender@example.com",
    "mobileNo": "+919876543210"
  },
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "aadhaarNumber": "123456789012",
      "mobileNumber": "9876543210",
      "address": "123 Main Street, City, State",
      "amount": 50000,
      "purpose": "Home renovation",
      "loanGivenDate": "2024-01-15T10:30:00.000Z",
      "loanEndDate": "2024-12-31T23:59:59.000Z",
      "loanMode": "cash",
      "paymentStatus": "pending",
      "borrowerAcceptanceStatus": "accepted",
      "loanConfirmed": true,
      "lenderId": {
        "_id": "507f1f77bcf86cd799439012",
        "userName": "Lender Name",
        "email": "lender@example.com",
        "mobileNo": "+919876543210",
        "profileImage": "https://example.com/lender.jpg",
        "aadharCardNo": "987654321098"
      },
      "borrowerId": {
        "_id": "507f1f77bcf86cd799439013",
        "userName": "John Doe",
        "email": "john@example.com",
        "mobileNo": "+919876543210",
        "profileImage": "https://example.com/borrower.jpg",
        "aadharCardNo": "123456789012"
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:35:00.000Z"
    }
  ],
  "pagination": {
    "totalDocuments": 25,
    "currentPage": 1,
    "totalPages": 3,
    "limit": 10
  }
}
```

### Error Responses

**400 Bad Request** (Missing lenderId)
```json
{
  "success": false,
  "message": "Lender ID is required"
}
```

**404 Not Found** (Lender not found)
```json
{
  "success": false,
  "message": "Lender not found"
}
```

**404 Not Found** (No loans found)
```json
{
  "success": false,
  "message": "No borrower history found for lender ID: 507f1f77bcf86cd799439012",
  "data": [],
  "pagination": {
    "totalDocuments": 0,
    "currentPage": 1,
    "totalPages": 0
  }
}
```

---

## 3. Get Borrower History by Borrower ID

Get all loans taken by a specific borrower. Returns borrower history filtered by borrower ID with summary statistics.

### Endpoint
```
GET /api/history/borrowers/borrower/:borrowerId
```

### Headers
```
Authorization: Bearer <token>
Content-Type: application/json
```

### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `borrowerId` | string (MongoDB ObjectId) | **Yes** | The ID of the borrower |

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number for pagination |
| `limit` | number | No | 10 | Number of items per page |
| `startDate` | string (ISO date) | No | - | Filter loans from this date onwards |
| `endDate` | string (ISO date) | No | - | Filter loans up to this date |
| `paymentStatus` | string | No | - | Filter by loan payment status: "pending" or "paid" |
| `minAmount` | number | No | - | Minimum loan amount filter |
| `maxAmount` | number | No | - | Maximum loan amount filter |
| `search` | string | No | - | Search by borrower name (case-insensitive) |

### Request Example

```bash
GET http://localhost:5001/api/history/borrowers/borrower/507f1f77bcf86cd799439013?page=1&limit=10
```

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Borrower history fetched successfully",
  "borrower": {
    "_id": "507f1f77bcf86cd799439013",
    "userName": "John Doe",
    "email": "john@example.com",
    "mobileNo": "+919876543210",
    "aadharCardNo": "123456789012"
  },
  "summary": {
    "totalLoans": 5,
    "pendingLoans": 3,
    "paidLoans": 2,
    "totalPendingAmount": 150000,
    "totalPaidAmount": 100000
  },
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "aadhaarNumber": "123456789012",
      "mobileNumber": "9876543210",
      "address": "123 Main Street, City, State",
      "amount": 50000,
      "purpose": "Home renovation",
      "loanGivenDate": "2024-01-15T10:30:00.000Z",
      "loanEndDate": "2024-12-31T23:59:59.000Z",
      "loanMode": "cash",
      "paymentStatus": "pending",
      "borrowerAcceptanceStatus": "accepted",
      "loanConfirmed": true,
      "lenderId": {
        "_id": "507f1f77bcf86cd799439012",
        "userName": "Lender Name",
        "email": "lender@example.com",
        "mobileNo": "+919876543210",
        "profileImage": "https://example.com/lender.jpg",
        "aadharCardNo": "987654321098"
      },
      "borrowerId": {
        "_id": "507f1f77bcf86cd799439013",
        "userName": "John Doe",
        "email": "john@example.com",
        "mobileNo": "+919876543210",
        "profileImage": "https://example.com/borrower.jpg",
        "aadharCardNo": "123456789012"
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:35:00.000Z"
    }
  ],
  "pagination": {
    "totalDocuments": 5,
    "currentPage": 1,
    "totalPages": 1,
    "limit": 10
  }
}
```

### Error Responses

**400 Bad Request** (Missing borrowerId)
```json
{
  "success": false,
  "message": "Borrower ID is required"
}
```

**404 Not Found** (Borrower not found)
```json
{
  "success": false,
  "message": "Borrower not found"
}
```

**404 Not Found** (No loans found)
```json
{
  "success": false,
  "message": "No borrower history found for borrower ID: 507f1f77bcf86cd799439013",
  "data": [],
  "pagination": {
    "totalDocuments": 0,
    "currentPage": 1,
    "totalPages": 0
  }
}
```

---

## 4. Get Borrower History by Borrower ID and Lender ID

Get loans between a specific borrower and lender. Returns borrower history filtered by both borrower ID and lender ID with summary statistics.

### Endpoint
```
GET /api/history/borrowers/borrower/:borrowerId/lender/:lenderId
```

### Headers
```
Authorization: Bearer <token>
Content-Type: application/json
```

### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `borrowerId` | string (MongoDB ObjectId) | **Yes** | The ID of the borrower |
| `lenderId` | string (MongoDB ObjectId) | **Yes** | The ID of the lender |

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number for pagination |
| `limit` | number | No | 10 | Number of items per page |
| `startDate` | string (ISO date) | No | - | Filter loans from this date onwards |
| `endDate` | string (ISO date) | No | - | Filter loans up to this date |
| `paymentStatus` | string | No | - | Filter by loan payment status: "pending" or "paid" |
| `minAmount` | number | No | - | Minimum loan amount filter |
| `maxAmount` | number | No | - | Maximum loan amount filter |
| `search` | string | No | - | Search by borrower name (case-insensitive) |

### Request Example

```bash
GET http://localhost:5001/api/history/borrowers/borrower/507f1f77bcf86cd799439013/lender/507f1f77bcf86cd799439012?page=1&limit=10
```

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Borrower history fetched successfully",
  "borrower": {
    "_id": "507f1f77bcf86cd799439013",
    "userName": "John Doe",
    "email": "john@example.com",
    "mobileNo": "+919876543210"
  },
  "lender": {
    "_id": "507f1f77bcf86cd799439012",
    "userName": "Lender Name",
    "email": "lender@example.com",
    "mobileNo": "+919876543210"
  },
  "summary": {
    "totalLoans": 3,
    "pendingLoans": 2,
    "paidLoans": 1,
    "totalPendingAmount": 100000,
    "totalPaidAmount": 50000
  },
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "aadhaarNumber": "123456789012",
      "mobileNumber": "9876543210",
      "address": "123 Main Street, City, State",
      "amount": 50000,
      "purpose": "Home renovation",
      "loanGivenDate": "2024-01-15T10:30:00.000Z",
      "loanEndDate": "2024-12-31T23:59:59.000Z",
      "loanMode": "cash",
      "paymentStatus": "pending",
      "borrowerAcceptanceStatus": "accepted",
      "loanConfirmed": true,
      "lenderId": {
        "_id": "507f1f77bcf86cd799439012",
        "userName": "Lender Name",
        "email": "lender@example.com",
        "mobileNo": "+919876543210",
        "profileImage": "https://example.com/lender.jpg",
        "aadharCardNo": "987654321098"
      },
      "borrowerId": {
        "_id": "507f1f77bcf86cd799439013",
        "userName": "John Doe",
        "email": "john@example.com",
        "mobileNo": "+919876543210",
        "profileImage": "https://example.com/borrower.jpg",
        "aadharCardNo": "123456789012"
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:35:00.000Z"
    }
  ],
  "pagination": {
    "totalDocuments": 3,
    "currentPage": 1,
    "totalPages": 1,
    "limit": 10
  }
}
```

### Error Responses

**400 Bad Request** (Missing IDs)
```json
{
  "success": false,
  "message": "Both borrower ID and lender ID are required"
}
```

**404 Not Found** (Borrower not found)
```json
{
  "success": false,
  "message": "Borrower not found"
}
```

**404 Not Found** (Lender not found)
```json
{
  "success": false,
  "message": "Lender not found"
}
```

**404 Not Found** (No loans found)
```json
{
  "success": false,
  "message": "No loans found between borrower ID: 507f1f77bcf86cd799439013 and lender ID: 507f1f77bcf86cd799439012",
  "data": [],
  "pagination": {
    "totalDocuments": 0,
    "currentPage": 1,
    "totalPages": 0
  }
}
```

---

## 5. Get All Loans by Lender ID

Get all loans given by a specific lender. This endpoint is similar to endpoint #2 but provides additional summary statistics including total loan amounts.

### Endpoint
```
GET /api/history/loans/lender/:lenderId
```

### Headers
```
Authorization: Bearer <token>
Content-Type: application/json
```

### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lenderId` | string (MongoDB ObjectId) | **Yes** | The ID of the lender |

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number for pagination |
| `limit` | number | No | 10 | Number of items per page |
| `startDate` | string (ISO date) | No | - | Filter loans from this date onwards |
| `endDate` | string (ISO date) | No | - | Filter loans up to this date |
| `paymentStatus` | string | No | - | Filter by loan payment status: "pending" or "paid" |
| `minAmount` | number | No | - | Minimum loan amount filter |
| `maxAmount` | number | No | - | Maximum loan amount filter |
| `search` | string | No | - | Search by borrower name (case-insensitive) |

### Request Example

```bash
GET http://localhost:5001/api/history/loans/lender/507f1f77bcf86cd799439012?page=1&limit=10
```

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "All loans by lender fetched successfully",
  "lender": {
    "_id": "507f1f77bcf86cd799439012",
    "userName": "Lender Name",
    "email": "lender@example.com",
    "mobileNo": "+919876543210"
  },
  "summary": {
    "totalLoans": 25,
    "pendingLoans": 15,
    "paidLoans": 10,
    "totalLoanAmount": 1250000,
    "totalPendingAmount": 750000,
    "totalPaidAmount": 500000
  },
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "aadhaarNumber": "123456789012",
      "mobileNumber": "9876543210",
      "address": "123 Main Street, City, State",
      "amount": 50000,
      "purpose": "Home renovation",
      "loanGivenDate": "2024-01-15T10:30:00.000Z",
      "loanEndDate": "2024-12-31T23:59:59.000Z",
      "loanMode": "cash",
      "paymentStatus": "pending",
      "borrowerAcceptanceStatus": "accepted",
      "loanConfirmed": true,
      "lenderId": {
        "_id": "507f1f77bcf86cd799439012",
        "userName": "Lender Name",
        "email": "lender@example.com",
        "mobileNo": "+919876543210",
        "profileImage": "https://example.com/lender.jpg",
        "aadharCardNo": "987654321098"
      },
      "borrowerId": {
        "_id": "507f1f77bcf86cd799439013",
        "userName": "John Doe",
        "email": "john@example.com",
        "mobileNo": "+919876543210",
        "profileImage": "https://example.com/borrower.jpg",
        "aadharCardNo": "123456789012"
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:35:00.000Z"
    }
  ],
  "pagination": {
    "totalDocuments": 25,
    "currentPage": 1,
    "totalPages": 3,
    "limit": 10
  }
}
```

### Error Responses

**400 Bad Request** (Missing lenderId)
```json
{
  "success": false,
  "message": "Lender ID is required"
}
```

**404 Not Found** (Lender not found)
```json
{
  "success": false,
  "message": "Lender not found"
}
```

**404 Not Found** (No loans found)
```json
{
  "success": false,
  "message": "No loans found for lender ID: 507f1f77bcf86cd799439012",
  "data": [],
  "pagination": {
    "totalDocuments": 0,
    "currentPage": 1,
    "totalPages": 0
  }
}
```

---

## 📝 Important Notes

### Common Query Parameters

All endpoints support the following optional query parameters for filtering:

- **Pagination**: `page` (default: 1), `limit` (default: 10)
- **Date Range**: `startDate`, `endDate` (ISO 8601 format)
- **Payment Status Filter**: `paymentStatus` ("pending" or "paid")
- **Amount Range**: `minAmount`, `maxAmount` (numbers)
- **Search**: `search` (searches borrower name, case-insensitive)

### Date Format

All dates should be in ISO 8601 format:
```
"2024-01-15T10:30:00.000Z"
```

### Response Structure

All successful responses include:
- `success`: Boolean indicating success status
- `message`: Descriptive message
- `data`: Array of loan objects with populated lender and borrower details
- `pagination`: Pagination metadata

Some endpoints also include:
- `summary`: Statistics about loans (counts, amounts)
- `borrower`: Borrower details (when applicable)
- `lender`: Lender details (when applicable)

### Loan Object Structure

Each loan object in the response includes:
- Loan details (name, amount, purpose, dates, mode, paymentStatus)
- `lenderId`: Populated lender object with user details
- `borrowerId`: Populated borrower object with user details
- Timestamps (`createdAt`, `updatedAt`)

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
| 400 | Bad Request (validation error, missing fields) |
| 401 | Unauthorized (invalid/expired token) |
| 404 | Not Found (no data found or invalid IDs) |
| 500 | Internal Server Error |

---

## 🧪 Testing Examples

### cURL Examples

**Get All Borrowers History:**
```bash
curl -X GET "http://localhost:5001/api/history/borrowers?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get Borrower History by Lender ID:**
```bash
curl -X GET "http://localhost:5001/api/history/borrowers/lender/507f1f77bcf86cd799439012?page=1&limit=10&paymentStatus=pending" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get Borrower History by Borrower ID:**
```bash
curl -X GET "http://localhost:5001/api/history/borrowers/borrower/507f1f77bcf86cd799439013?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get Borrower History by Borrower and Lender ID:**
```bash
curl -X GET "http://localhost:5001/api/history/borrowers/borrower/507f1f77bcf86cd799439013/lender/507f1f77bcf86cd799439012?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get All Loans by Lender ID:**
```bash
curl -X GET "http://localhost:5001/api/history/loans/lender/507f1f77bcf86cd799439012?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### JavaScript/Fetch Examples

**Get All Borrowers History:**
```javascript
const response = await fetch('http://localhost:5001/api/history/borrowers?page=1&limit=10', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data);
```

**Get Borrower History by Lender ID:**
```javascript
const lenderId = '507f1f77bcf86cd799439012';
const response = await fetch(`http://localhost:5001/api/history/borrowers/lender/${lenderId}?page=1&limit=10`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data);
```

**Get Borrower History by Borrower ID:**
```javascript
const borrowerId = '507f1f77bcf86cd799439013';
const response = await fetch(`http://localhost:5001/api/history/borrowers/borrower/${borrowerId}?page=1&limit=10`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data);
```

**Get Borrower History by Borrower and Lender ID:**
```javascript
const borrowerId = '507f1f77bcf86cd799439013';
const lenderId = '507f1f77bcf86cd799439012';
const response = await fetch(`http://localhost:5001/api/history/borrowers/borrower/${borrowerId}/lender/${lenderId}?page=1&limit=10`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data);
```

**Get All Loans by Lender ID:**
```javascript
const lenderId = '507f1f77bcf86cd799439012';
const response = await fetch(`http://localhost:5001/api/history/loans/lender/${lenderId}?page=1&limit=10`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data);
```

---

## 📞 Support

For any issues or questions, please contact the development team.

---

## 🔄 Endpoint Comparison

| Endpoint | Purpose | Summary Stats | Use Case |
|----------|---------|---------------|----------|
| `/borrowers` | All loans in system | No | Admin/Overview |
| `/borrowers/lender/:lenderId` | Loans by lender | No | Lender's loan history |
| `/borrowers/borrower/:borrowerId` | Loans by borrower | Yes | Borrower's loan history |
| `/borrowers/borrower/:borrowerId/lender/:lenderId` | Loans between specific borrower & lender | Yes | Relationship history |
| `/loans/lender/:lenderId` | All loans by lender | Yes | Lender's complete loan portfolio |

---

## 📌 Notes for Frontend Integration

1. **Authentication**: Always include the Bearer token in the Authorization header
2. **Error Handling**: Check the `success` field in responses and handle errors appropriately
3. **Pagination**: Use pagination parameters (`page`, `limit`) for large datasets
4. **Filtering**: Use query parameters to filter results (paymentStatus, dates, amounts)
5. **Summary Stats**: Endpoints #3, #4, and #5 include summary statistics for quick insights
6. **Populated Data**: All endpoints return populated lender and borrower objects for easy display
7. **Empty Results**: Handle 404 responses gracefully when no data is found

