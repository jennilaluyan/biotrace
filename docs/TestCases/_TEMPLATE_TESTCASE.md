# Test Suite: <Modul>
ENV: Local (HTTPS via Caddy + mkcert)

| ID            | Deskripsi                           |
|---------------|-------------------------------------|
| UTC-AUTH-001  | Login sukses                        |

## UTC-AUTH-001 — Login sukses
**Preconditions:** user aktif, kredensial valid  
**Steps:**
1) POST `/api/v1/auth/login`  
2) Simpan token  
**Expected:** 200 OK, token diterima, audit `LOGIN_SUCCESS`  
**Post-conditions:** session aktif

## UTC-AUTH-002 — Login gagal (pwd salah)
…