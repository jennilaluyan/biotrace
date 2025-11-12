# API Spec: <Module/Endpoint Group>
Base URL: `${APP_URL}/api` (local: https://localhost:8000/api)  
Auth: Bearer / Cookie (Sanctum)

## Endpoint
**Method & Path**: `POST /v1/auth/login`  
**Roles**: Public  
**Headers**: `Content-Type: application/json`  
**Request Body**:
```json
{ "email": "user@lab.id", "password": "secret123" }