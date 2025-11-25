# Clients API — `/api/v1/clients`

Modul **Clients** digunakan untuk manajemen pelanggan/pengirim sampel dalam LIMS.  
Semua endpoint menggunakan `ApiResponse` sebagai standar format respons.

---

## 1. Authentication & Authorization

### 1.1 Authentication
Semua endpoint membutuhkan sesi login (Laravel Sanctum).  
Jika user belum login:

```json
{
  "timestamp": "2025-11-25T10:25:20+08:00",
  "status": 401,
  "error": "Unauthorized",
  "code": "AUTH.UNAUTHENTICATED",
  "message": "Unauthenticated.",
  "context": {
    "method": "GET",
    "path": "/api/v1/clients",
    "resource": "auth",
    "actorRole": null,
    "requestId": "..."
  }
}
````

### 1.2 RBAC (Role-based Access Control)

| Role          | List | Show | Create | Update | Delete |
| ------------- | ---- | ---- | ------ | ------ | ------ |
| Administrator | ✔️   | ✔️   | ✔️     | ✔️     | ✔️     |
| QA            | ✔️   | ✔️   | ✔️     | ✔️     | ✔️     |
| Lab Head      | ✔️   | ✔️   | ❌      | ❌      | ❌      |
| Analyst       | ✔️   | ✔️   | ❌      | ❌      | ❌      |
| Operator      | ✔️   | ✔️   | ❌      | ❌      | ❌      |

Contoh respons 403 (Operator):

```json
{
  "timestamp": "2025-11-25T10:28:10+08:00",
  "status": 403,
  "error": "Forbidden",
  "code": "HTTP.403",
  "message": "This action is unauthorized.",
  "context": {
    "method": "POST",
    "path": "/api/v1/clients",
    "resource": "api",
    "actorRole": "Analyst",
    "requestId": "..."
  }
}
```

---

## 2. Standard Response Envelope

Semua respons (sukses/error) mengikuti format:

```json
{
  "timestamp": "2025-11-25T10:25:20+08:00",
  "status": 200,
  "error": null,
  "code": null,
  "message": "Clients fetched successfully.",
  "data": [],
  "meta": {
    "total": 1,
    "search": null
  },
  "context": {
    "method": "GET",
    "path": "/api/v1/clients",
    "resource": "api",
    "actorRole": "Administrator",
    "requestId": "..."
  }
}
```

### 2.1 Field Definition

* `timestamp` — ISO8601 server time
* `status` — HTTP status
* `error` — HTTP error text (null jika sukses)
* `code` — internal code (`HTTP.403`, `HTTP.404`, `VALIDATION.ERROR`, dst.)
* `message` — pesan human-readable
* `data` — object/array/null
* `meta` — optional metadata (total, pagination, search)
* `context` — informasi request (method, path, resource, actorRole, requestId)

---

## 3. Client Object Schema

```json
{
  "client_id": 6,
  "name": "Ted Mosby",
  "client_type": "INDIVIDUAL",
  "institution_name": null,
  "email": "ted@example.com",
  "phone": "+628123456789",
  "contact_person_name": "Ted Mosby",
  "contact_person_phone": "+628123456789",
  "address": "Jl. Contoh No. 123, Manado",
  "created_at": "2025-11-25T10:00:00+08:00",
  "updated_at": "2025-11-25T10:10:00+08:00",
  "deleted_at": null
}
```

---

## 4. Endpoints

---

### 4.1 List Clients

**GET** `/api/v1/clients`

#### Query Parameters

| Param  | Type   | Description                              |
| ------ | ------ | ---------------------------------------- |
| search | string | Pencarian pada name/email/institution/CP |

#### Permissions

Semua role internal.

#### 200 OK

```json
{
  "timestamp": "...",
  "status": 200,
  "error": null,
  "code": null,
  "message": "Clients fetched successfully.",
  "data": [...],
  "meta": {
    "total": 1,
    "search": null
  },
  "context": {
    "method": "GET",
    "path": "/api/v1/clients",
    "resource": "api",
    "actorRole": "Administrator",
    "requestId": "..."
  }
}
```

---

### 4.2 Show Client

**GET** `/api/v1/clients/{client}`

#### Permissions

Semua role internal.

#### 200 OK

Format sama seperti List (data berupa satu object client).

#### 404 Not Found

```json
{
  "timestamp": "...",
  "status": 404,
  "error": "Not Found",
  "code": "HTTP.404",
  "message": "No query results for model [App\\Models\\Client] 6.",
  "context": {
    "method": "GET",
    "path": "/api/v1/clients/6",
    "resource": "api",
    "actorRole": "Administrator",
    "requestId": "..."
  }
}
```

---

### 4.3 Create Client

**POST** `/api/v1/clients`

#### Permissions

* Admin, QA ✔️
* Lab Head, Analyst, Operator ❌ (403)

#### Body Example

```json
{
  "name": "Ted Mosby",
  "client_type": "INDIVIDUAL",
  "institution_name": null,
  "email": "ted@example.com",
  "phone": "+628123456789",
  "contact_person_name": "Ted Mosby",
  "contact_person_phone": "+628123456789",
  "address": "Jl. Contoh No. 123"
}
```

#### 201 Created

```json
{
  "timestamp": "...",
  "status": 201,
  "error": null,
  "code": null,
  "message": "Client created successfully.",
  "data": { ... },
  "context": {
    "method": "POST",
    "path": "/api/v1/clients",
    "resource": "api",
    "actorRole": "Administrator",
    "requestId": "..."
  }
}
```

#### 403 Forbidden (non-admin)

```json
{
  "timestamp": "...",
  "status": 403,
  "error": "Forbidden",
  "code": "HTTP.403",
  "message": "This action is unauthorized.",
  "context": {
    "method": "POST",
    "path": "/api/v1/clients",
    "resource": "api",
    "actorRole": "Analyst",
    "requestId": "..."
  }
}
```

#### 422 Validation Error

```json
{
  "timestamp": "...",
  "status": 422,
  "error": "Unprocessable Entity",
  "code": "VALIDATION.ERROR",
  "message": "Validation error.",
  "details": {
    "errors": {
      "email": ["The email has already been taken."]
    }
  },
  "context": { ... }
}
```

---

### 4.4 Update Client

**PATCH** `/api/v1/clients/{client}`

#### Permissions

Admin, QA ✔️
Role lain ❌ (403)

#### 200 OK

Struktur sama seperti Create, dengan data ter-update.

#### Error Responses

* 403 → `"HTTP.403"`
* 404 → `"HTTP.404"`
* 422 → `"VALIDATION.ERROR"`

---

### 4.5 Delete (Deactivate) Client

**DELETE** `/api/v1/clients/{client}`

#### Permissions

Admin, QA ✔️
Role lain ❌ (403)

#### 200 OK

```json
{
  "timestamp": "...",
  "status": 200,
  "error": null,
  "code": null,
  "message": "Client deactivated successfully.",
  "data": null,
  "context": {
    "method": "DELETE",
    "path": "/api/v1/clients/7",
    "resource": "api",
    "actorRole": "Administrator",
    "requestId": "..."
  }
}
```

#### 403 Forbidden (non-admin)

```json
{
  "timestamp": "...",
  "status": 403,
  "error": "Forbidden",
  "code": "HTTP.403",
  "message": "This action is unauthorized.",
  "context": {
    "method": "DELETE",
    "path": "/api/v1/clients/6",
    "resource": "api",
    "actorRole": "Analyst",
    "requestId": "..."
  }
}
```

#### 404 Not Found (akses setelah soft delete)

```json
{
  "timestamp": "...",
  "status": 404,
  "error": "Not Found",
  "code": "HTTP.404",
  "message": "No query results for model [App\\Models\\Client] 6.",
  "context": {
    "method": "GET",
    "path": "/api/v1/clients/6",
    "resource": "api",
    "actorRole": "Administrator",
    "requestId": "..."
  }
}
```

---

## 5. Error Code Summary

| Kondisi                       | HTTP | Code                   |
| ----------------------------- | ---- | ---------------------- |
| Belum login                   | 401  | `AUTH.UNAUTHENTICATED` |
| Tidak punya akses (Forbidden) | 403  | `HTTP.403`             |
| Resource tidak ditemukan      | 404  | `HTTP.404`             |
| Validasi gagal                | 422  | `VALIDATION.ERROR`     |
| Error tak terduga             | 500  | `SERVER.ERROR`         |