# Change Password API Documentation

## API Endpoint

**Endpoint:** `/api/user/change-password`  
**Base URL:** `http://localhost:5001` (or your production domain)  
**Full URL:** `http://localhost:5001/api/user/change-password`  
**HTTP Methods:** `POST` or `PATCH` (both supported)

---

## Authentication

**Required:** Yes  
**Type:** Bearer Token (JWT)

**How to authenticate:**
1. User must be logged in
2. Get the JWT token from the login/signin response
3. Include the token in the Authorization header

**Header Format:**
```
Authorization: Bearer <jwt_token>
```

**Example:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY1...
```

---

## Request Details

### Headers Required

| Header Name | Value | Required |
|------------|-------|----------|
| `Authorization` | `Bearer <token>` | Yes |
| `Content-Type` | `application/json` | Yes |

### Request Body

**Content-Type:** `application/json`

**Body Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `currentPassword` | string | Yes | User's current password |
| `newPassword` | string | Yes | New password (minimum 6 characters) |
| `confirmNewPassword` | string | Yes | Confirmation of new password (must match `newPassword`) |

**Example Request Body:**
```json
{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword456",
  "confirmNewPassword": "newpassword456"
}
```

---

## Response Details

### Success Response

**Status Code:** `200 OK`

**Response Body:**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**Response Fields:**
- `success` (boolean): Indicates request success
- `message` (string): Success message

---

### Error Responses

#### 1. Missing Required Fields

**Status Code:** `400 Bad Request`

**Response Body:**
```json
{
  "success": false,
  "message": "Current password, new password, and confirm password are required"
}
```

**When it occurs:** Any of the three password fields are missing or empty

---

#### 2. Passwords Don't Match

**Status Code:** `400 Bad Request`

**Response Body:**
```json
{
  "success": false,
  "message": "New password and confirm password do not match"
}
```

**When it occurs:** `newPassword` and `confirmNewPassword` are different

---

#### 3. Password Too Short

**Status Code:** `400 Bad Request`

**Response Body:**
```json
{
  "success": false,
  "message": "New password must be at least 6 characters long"
}
```

**When it occurs:** `newPassword` is less than 6 characters

---

#### 4. Same as Current Password

**Status Code:** `400 Bad Request`

**Response Body:**
```json
{
  "success": false,
  "message": "New password must be different from current password"
}
```

**When it occurs:** `newPassword` is the same as `currentPassword`

---

#### 5. Incorrect Current Password

**Status Code:** `400 Bad Request`

**Response Body:**
```json
{
  "success": false,
  "message": "Current password is incorrect"
}
```

**When it occurs:** `currentPassword` doesn't match the user's stored password

---

#### 6. User Not Found

**Status Code:** `404 Not Found`

**Response Body:**
```json
{
  "success": false,
  "message": "User not found"
}
```

**When it occurs:** User ID from token doesn't exist in database

---

#### 7. Unauthorized (No Token)

**Status Code:** `401 Unauthorized`

**Response Body:**
```json
{
  "message": "No token provided, access denied."
}
```

**When it occurs:** Authorization header is missing

---

#### 8. Unauthorized (Invalid/Expired Token)

**Status Code:** `401 Unauthorized`

**Response Body:**
```json
{
  "message": "Invalid or expired token."
}
```

**When it occurs:** Token is invalid, expired, or malformed

---

#### 9. Server Error

**Status Code:** `500 Internal Server Error`

**Response Body:**
```json
{
  "success": false,
  "message": "Server error. Please try again later.",
  "error": "<detailed_error_message>"
}
```

**When it occurs:** Internal server error or database issue

---

## Validation Rules

1. **All fields required:** `currentPassword`, `newPassword`, `confirmNewPassword` must be provided
2. **Password match:** `newPassword` must equal `confirmNewPassword`
3. **Minimum length:** `newPassword` must be at least 6 characters
4. **Different password:** `newPassword` must be different from `currentPassword`
5. **Current password verification:** `currentPassword` must match the user's stored password

---

## Access Control

**Who can use this API:**
- All authenticated users (Admin, Lender, Borrower)
- User must be logged in with a valid JWT token
- Token must belong to an active user account

**Who cannot use this API:**
- Unauthenticated users
- Users with invalid/expired tokens

---

## Frontend Implementation Guidelines

### 1. Form Fields

Create a form with three password input fields:
- **Current Password** (type: password)
- **New Password** (type: password)
- **Confirm New Password** (type: password)

### 2. Client-Side Validation (Before API Call)

Validate:
- All three fields are filled
- New password and confirm password match
- New password is at least 6 characters
- New password is different from current password

### 3. API Request Flow

1. Get JWT token from storage (localStorage/sessionStorage/cookies)
2. Prepare request:
   - Method: `POST` or `PATCH`
   - URL: `/api/user/change-password`
   - Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`
   - Body: JSON with the three password fields
3. Send request
4. Handle response:
   - **Success (200):** Show success message, optionally redirect or clear form
   - **Error (400/401/404/500):** Show error message from response

### 4. Error Handling

Handle these cases:
- Network errors (no internet, timeout)
- 401 Unauthorized: Redirect to login or refresh token
- 400 Bad Request: Show the specific error message
- 500 Server Error: Show a generic error message

### 5. User Experience

- Show loading state during the request
- Disable form submission while processing
- Clear password fields after success
- Show clear error messages
- Provide feedback for each validation rule

### 6. Security Considerations

- Do not store passwords in localStorage
- Clear password fields after submission (success or error)
- Use HTTPS in production
- Handle token expiration gracefully

---

## Example Request Flow

1. **User fills form:**
   - Current Password: `pass@123`
   - New Password: `pass@1234`
   - Confirm New Password: `pass@1234`

2. **Frontend validates** (client-side)

3. **Frontend sends request:**
   ```
   POST http://localhost:5001/api/user/change-password
   Headers:
     Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
     Content-Type: application/json
   Body:
     {
       "currentPassword": "pass@123",
       "newPassword": "pass@1234",
       "confirmNewPassword": "pass@1234"
     }
   ```

4. **Backend responds:**
   ```json
   {
     "success": true,
     "message": "Password changed successfully"
   }
   ```

5. **Frontend handles response:**
   - Show success message
   - Clear form fields
   - Optionally redirect user

---

## Testing Checklist

Test these scenarios:
- [ ] Valid password change (all fields correct)
- [ ] Missing current password
- [ ] Missing new password
- [ ] Missing confirm password
- [ ] New password and confirm password don't match
- [ ] New password too short (< 6 characters)
- [ ] New password same as current password
- [ ] Incorrect current password
- [ ] No authorization token
- [ ] Invalid/expired token
- [ ] Network error handling

---

## Notes

- Works for all user roles (Admin, Lender, Borrower)
- Password is hashed before storage
- Current password is verified before allowing change
- Token must be valid and not expired
- Server must be running and accessible
- Base URL may differ in production

---

## Postman Testing

**Method:** `POST` or `PATCH`  
**URL:** `http://localhost:5001/api/user/change-password`

**Headers:**
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "currentPassword": "pass@123",
  "newPassword": "pass@1234",
  "confirmNewPassword": "pass@1234"
}
```

---

## cURL Example

```bash
curl -X POST \
  'http://localhost:5001/api/user/change-password' \
  -H 'Authorization: Bearer your_jwt_token_here' \
  -H 'Content-Type: application/json' \
  -d '{
    "currentPassword": "pass@123",
    "newPassword": "pass@1234",
    "confirmNewPassword": "pass@1234"
  }'
```
