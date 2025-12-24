# Advisor Demo Script — Clients → Samples (End-to-End)
Version: 0.1.0  
Date: 2025-12-24  
Project: BioTrace LIMS (UNSRAT Biomolecular Lab)  
Scope: Sprint 1 demo (Auth + Clients + Samples + Status guards + Auto-assignment + Audit evidence)

---

## 0) Demo Goal
Menunjukkan alur end-to-end:
1) Admin membuat client
2) Admin membuat 2 sample:
   - Sample A: status flow valid step-by-step sampai beberapa langkah
   - Sample B: mencoba lompat status (invalid transition) dan ditolak
3) Tunjukkan bukti audit trail / status history
4) Tunjukkan RBAC: role tertentu tidak boleh melakukan aksi tertentu (403)

---

## 1) Demo Accounts (Role)
Siapkan akun berikut (email contoh boleh disesuaikan):
- Admin (Administrator)
- Analyst
- Operational Manager (OM) atau Lab Head (LH)

Catatan: Demo ini mengandalkan aturan role sesuai policy backend.

---

## 2) Demo Evidence Checklist (Screenshots yang wajib)
Simpan screenshot ke folder: `docs/reports/screenshots/sprint-1/`

Checklist bukti:
1) Login sebagai Admin (UI) — sukses
   ![login admin](./screenshots/sprint-1/image.png)
2) Create Client (UI atau Postman) — sukses
   ![admin create client id 18](./screenshots/sprint-1/image-1.png)
3) Client masuk list / bisa dibuka detailnya (UI)
   ![list client muncul client id 18](./screenshots/sprint-1/image-3.png)
4) Create Sample A (UI atau Postman) — sukses + terlihat `created_by` & `assigned_to`
   ![admin create sample A id 33](./screenshots/sprint-1/image-2.png)
5) Samples list menunjukkan Sample A (UI)
   ![list sample id 33](./screenshots/sprint-1/image8.png)
6) Update status valid step-by-step untuk Sample A (UI atau Postman) — sukses
   ![update status in progress](./screenshots/sprint-1/image-5.png)
   ![testing_completed](./screenshots/sprint-1/image-7.png)
7) Buka Sample Detail → lihat **Audit Trail / Status History** (UI)
   ![status history](./screenshots/sprint-1/image9.png)
8) Create Sample B (UI atau Postman) — sukses
   ![admin create sample B id 34](./screenshots/sprint-1/image-4.png)
9) Update status Sample B dengan lompat status — **gagal** (403) (Postman / UI error)
   ![skip status is not allowed walaupun login dengan role yang benar](./screenshots/sprint-1/image-6.png)
10) Login sebagai Analyst → coba aksi yang tidak boleh (mis: validate/reported) — **403**
   ![login analyst](./screenshots/sprint-1/image10.png)
   ![update status verified](./screenshots/sprint-1/image11.png)
11) Terminal: `php artisan test --filter SampleStatusFlowTest` — PASS
![all passed](./screenshots/sprint-1/image12.png)
12) Terminal: `php artisan test --filter RBACTest` — PASS
![all passed](./screenshots/sprint-1/image13.png)
13) Terminal: `php artisan test --filter SampleAutoAssignmentAuditTest` — PASS
![alt text](./screenshots/sprint-1/image14.png)
---

## 3) Demo Steps (UI)
### Step 3.1 — Login Admin
1) Buka UI → `/login`
2) Login menggunakan akun Admin
3) Screenshot: “Admin logged in”
![dashboard admin](./screenshots/sprint-1/image15.png)
---

### Step 3.2 — Create Client
1) Buka menu **Clients**
2) Klik **+ New Client**
3) Isi minimal:
   - Type: Individual
   - Name, Email, Phone
   - KTP/Domicile address (jika required)
4) Submit
5) Screenshot: “Client created successfully”
![create new client](./screenshots/sprint-1/image16.png)
6) Pastikan client muncul di list dan bisa dibuka detailnya
7) Screenshot: “Client detail page”
![client detail page](./screenshots/sprint-1/image17.png)

---

### Step 3.3 — Create Sample A (Happy Path)
1) Buka menu **Samples**
2) Klik **+ New sample**
3) Pilih client yang dibuat pada Step 3.2
4) Isi:
   - received_at
   - sample_type
   - priority
   - contact_history (harus salah satu: `ada`, `tidak`, `tidak_tahu`)
   - examination_purpose
5) Submit
6) Screenshot: “Sample A created”
![create sample](./screenshots/sprint-1/image18.png)
7) Pastikan di list samples terlihat:
   - Sample ID
   - Client
   - Assignee (auto-assigned)
8) Screenshot: “Samples Detail”
![Sample Detail Page](./screenshots/sprint-1/image19.png)

---

### Step 3.4 — Update Status Sample A (Valid Step-by-step)
1) Dari Samples list, buka **Sample A detail**
2) Jalankan status update **sesuai flow yang kamu pakai** (contoh):
   - received → in_progress → testing_completed → verified → validated → reported
   ![in progress](./screenshots/sprint-1/image20.png)
   ![testing completed](./screenshots/sprint-1/image21.png)
   ![verified](./screenshots/sprint-1/image22.png)
   ![validated](./screenshots/sprint-1/image23.png)
   ![reported](./screenshots/sprint-1/image24.png)
3) Lakukan minimal 2–3 langkah valid (cukup untuk demo)
4) Screenshot tiap langkah (atau cukup 1 screenshot sebelum+sesudah)
5) Buka section **Audit Trail / Status History**
6) Pastikan ada entry dengan:
   - actor (nama role)
   - timestamp
   - from_status → to_status
7) Screenshot: “Sample A status history entries”
![status history](./screenshots/sprint-1/image25.png)
8) Screenshot: Role yang salah ingin mengganti status
![role salah](./screenshots/sprint-1/image26.png)

---

## 4) Notes for Advisor
Highlight poin ISO/IEC 17025:2017:
- Traceability: perubahan status tercatat (actor, waktu, from→to, note)
- Integrity: invalid transition ditolak (anti-skip)
- RBAC: akses dibatasi sesuai peran
- Auto-assignment: sample langsung assigned (mengurangi risiko untracked handling)

---