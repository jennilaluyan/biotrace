<?php

namespace App\Services;

use App\Models\GeneratedDocument;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use RuntimeException;
use ZipArchive;

class ReagentRequestDocumentService
{
    public function __construct(
        private readonly FileStoreService $files,
        private readonly DocNumberService $numbers,
        private readonly DocxTemplateRenderService $docx,
        private readonly DocxToPdfConverter $converter,
    ) {}

    /**
     * Generate official PDF for an APPROVED reagent request from DB template (DOCX),
     * store PDF in files table, and register in generated_documents.
     */
    public function generateApprovedPdf(
        int $reagentRequestId,
        int $actorStaffId,
        bool $forceRegenerate = false,
        ?Carbon $generatedAt = null,
    ): GeneratedDocument {
        if ($reagentRequestId <= 0) {
            throw new RuntimeException('reagent_request_id is required.');
        }
        if ($actorStaffId <= 0) {
            throw new RuntimeException('actor_staff_id is required.');
        }

        $generatedAt = $generatedAt ?: now();

        return DB::transaction(function () use ($reagentRequestId, $actorStaffId, $forceRegenerate, $generatedAt) {
            // 0) If already generated and active, reuse (unless forced)
            if (Schema::hasTable('generated_documents')) {
                /** @var GeneratedDocument|null $existing */
                $existing = GeneratedDocument::query()
                    ->where('doc_code', 'REAGENT_REQUEST')
                    ->where('entity_type', 'reagent_request')
                    ->where('entity_id', $reagentRequestId)
                    ->where('is_active', true)
                    ->orderByDesc('gen_doc_id')
                    ->first();

                if ($existing && !$forceRegenerate) {
                    return $existing;
                }

                if ($existing && $forceRegenerate) {
                    $existing->is_active = false;
                    $existing->save();
                }
            }

            // 1) Load reagent request (must be approved)
            $rr = DB::table('reagent_requests')
                ->where('reagent_request_id', $reagentRequestId)
                ->first();

            if (!$rr) {
                throw new RuntimeException('Reagent request not found.');
            }

            $status = (string) ($rr->status ?? '');
            if ($status !== 'approved') {
                throw new RuntimeException('Reagent request must be approved before generating document.');
            }

            $loId = (int) ($rr->lo_id ?? 0);
            $cycleNo = (int) ($rr->cycle_no ?? 1);
            if ($cycleNo <= 0) $cycleNo = 1;

            // 2) Load template bytes for doc_code REAGENT_REQUEST
            $tpl = $this->loadActiveTemplateOrFail('REAGENT_REQUEST');
            $templateBytes = $tpl['bytes'];
            $templateVersionNo = (int) $tpl['template_version'];

            // 3) Generate numbering (record_no + form_code)
            $nums = $this->numbers->generate('REAGENT_REQUEST', $generatedAt);

            // 4) Load related info (LoO number + staff names)
            $looNumber = '';
            if ($loId > 0 && Schema::hasTable('letters_of_order')) {
                $loo = DB::table('letters_of_order')->where('lo_id', $loId)->first(['number']);
                $looNumber = (string) ($loo->number ?? '');
            }

            // requester = submitter (preferred) else creator
            $requesterStaffId = (int) (($rr->submitted_by_staff_id ?? 0) ?: ($rr->created_by_staff_id ?? 0));
            $requester = $this->loadStaffMini($requesterStaffId);
            $requesterRole = $this->loadStaffRoleLabel($requesterStaffId);

            $approver = $this->loadStaffMini((int) ($rr->approved_by_staff_id ?? 0));

            // 5) Load items + equipment bookings (best-effort, schema-safe)
            $items = $this->loadItems($reagentRequestId);
            $bookings = $this->loadBookings($reagentRequestId);

            // 6) Build DOCX variables + rows
            // NOTE: "Hari/Tanggal" diminta pakai tanggal saat dokumen di-generate:
            // format: Senin,17 Februari 2026 (hari bahasa Indonesia).
            $vars = [
                // numbering
                'record_no' => (string) ($nums['record_no'] ?? ''),
                'form_code' => (string) ($nums['form_code'] ?? ''),
                'revision_no' => (string) ((int) ($nums['revision_no'] ?? 0)),

                // identity
                'reagent_request_id' => (string) $reagentRequestId,
                'loo_number' => $looNumber,
                'cycle_no' => (string) $cycleNo,

                // dates (raw / legacy)
                'generated_at' => $generatedAt->format('d-m-Y H:i'),
                'approved_at' => $this->formatDateTime($rr->approved_at ?? null),
                'submitted_at' => $this->formatDateTime($rr->submitted_at ?? null),
                'created_at' => $this->formatDateTime($rr->created_at ?? null),

                // dates (form fields)
                'request_date_long' => $this->formatDateLongId($generatedAt), // Senin,17 Februari 2026

                // people (form fields)
                'requester_name' => $requester['name'],
                'requester_nip' => $requester['nip'],
                'requester_role' => $requesterRole, // "Analyst", dll

                'approver_name' => $approver['name'],
                'approver_nip' => $approver['nip'],
            ];

            // Table rows for reagents:
            // Template kolom: NO | NAMA REAGEN | JUMLAH | KETERANGAN
            $itemRows = [];
            foreach ($items as $idx => $it) {
                $qty = (string) ($it['qty'] ?? '');
                $unit = trim((string) ($it['unit_text'] ?? ''));

                $qtyText = trim($qty . ($unit !== '' ? ' ' . $unit : ''));

                $itemRows[] = [
                    'item_no' => (string) ($idx + 1),
                    'item_name' => (string) ($it['item_name'] ?? ''),
                    'qty' => $qtyText,
                    'note' => (string) ($it['note'] ?? ''),
                ];
            }

            // Optional equipment booking rows (HANYA diproses kalau template memang punya placeholder ${booking_no})
            $bookingRows = [];
            foreach ($bookings as $idx => $b) {
                $bookingRows[] = [
                    'booking_no' => (string) ($idx + 1),
                    'equipment_name' => (string) ($b['equipment_name'] ?? ''),
                    'planned_start_at' => (string) ($b['planned_start_at'] ?? ''),
                    'planned_end_at' => (string) ($b['planned_end_at'] ?? ''),
                    'note' => (string) ($b['note'] ?? ''),
                ];
            }

            $rows = [];

            // ✅ DOCX table clone keys: template harus punya placeholder PLAIN TEXT ${item_no} dalam 1 row tabel
            $rows['item_no'] = $itemRows;

            // ✅ Jangan bikin dokumen gagal kalau template belum punya table bookings
            if ($this->docxBytesContainsPlaceholder($templateBytes, 'booking_no')) {
                $rows['booking_no'] = $bookingRows;
            }

            // 7) Render merged DOCX + convert to PDF
            $mergedDocx = $this->docx->renderBytes($templateBytes, $vars, $rows);
            $pdfBytes = $this->converter->convertBytes($mergedDocx);

            // 8) Store PDF to DB (files)
            $safe = $this->safeFileStem((string) ($nums['record_no'] ?? "REAGENT_REQUEST_{$reagentRequestId}"));
            $pdfName = "{$safe}.pdf";

            $pdfFileId = $this->files->storeBytes(
                $pdfBytes,
                $pdfName,
                'application/pdf',
                'pdf',
                $actorStaffId,
                true
            );

            // 9) Register in generated_documents
            if (!Schema::hasTable('generated_documents')) {
                throw new RuntimeException('generated_documents table is missing.');
            }

            $gd = new GeneratedDocument();
            $gd->doc_code = 'REAGENT_REQUEST';
            $gd->entity_type = 'reagent_request';
            $gd->entity_id = $reagentRequestId;

            $gd->record_no = (string) ($nums['record_no'] ?? '');
            $gd->form_code = (string) ($nums['form_code'] ?? '');
            $gd->revision_no = (int) ($nums['revision_no'] ?? 0);
            $gd->template_version = $templateVersionNo;

            $gd->file_pdf_id = (int) $pdfFileId;
            $gd->file_docx_id = null;

            $gd->generated_by = $actorStaffId;
            $gd->generated_at = $generatedAt;
            $gd->is_active = true;

            $gd->save();

            return $gd;
        }, 3);
    }

    private function loadActiveTemplateOrFail(string $docCode): array
    {
        if (!Schema::hasTable('documents') || !Schema::hasTable('document_versions') || !Schema::hasTable('files')) {
            throw new RuntimeException('Document template tables are missing.');
        }

        // schema-safe: beberapa env pakai current_version_id, sebagian (typo lama) pakai version_current_id
        $select = ['doc_id', 'doc_code'];
        if (Schema::hasColumn('documents', 'current_version_id')) $select[] = 'current_version_id';
        if (Schema::hasColumn('documents', 'version_current_id')) $select[] = 'version_current_id';
        if (Schema::hasColumn('documents', 'is_active')) $select[] = 'is_active';

        $doc = DB::table('documents')
            ->where('doc_code', $docCode)
            ->where('is_active', true)
            ->first($select);

        if (!$doc) {
            throw new RuntimeException("Template {$docCode} is not configured or not active.");
        }

        $verId = (int) ($doc->current_version_id ?? $doc->version_current_id ?? 0);
        if ($verId <= 0) {
            throw new RuntimeException("Template {$docCode} has no uploaded version yet.");
        }

        $ver = DB::table('document_versions')
            ->where('doc_version_id', $verId)
            ->first(['doc_version_id', 'file_id', 'version_no']);

        if (!$ver) {
            throw new RuntimeException("Template {$docCode} version not found.");
        }

        $fileId = (int) ($ver->file_id ?? 0);
        if ($fileId <= 0) {
            throw new RuntimeException("Template {$docCode} version has no file_id.");
        }

        $file = $this->files->getFile($fileId);
        if (!$file || empty($file->bytes)) {
            throw new RuntimeException("Template {$docCode} file bytes not found.");
        }

        return [
            'bytes' => (string) $file->bytes,
            'template_version' => (int) ($ver->version_no ?? 0),
        ];
    }

    private function loadStaffMini(int $staffId): array
    {
        if ($staffId <= 0 || !Schema::hasTable('staffs')) {
            return ['name' => '', 'nip' => ''];
        }

        $cols = ['staff_id'];
        if (Schema::hasColumn('staffs', 'full_name')) $cols[] = 'full_name';
        if (Schema::hasColumn('staffs', 'name')) $cols[] = 'name';
        if (Schema::hasColumn('staffs', 'nip')) $cols[] = 'nip';

        $row = DB::table('staffs')->where('staff_id', $staffId)->first($cols);

        $name = '';
        if ($row) {
            $name = (string) ($row->full_name ?? $row->name ?? '');
        }

        return [
            'name' => $name,
            'nip' => (string) ($row->nip ?? ''),
        ];
    }

    private function loadStaffRoleLabel(int $staffId): string
    {
        if ($staffId <= 0 || !Schema::hasTable('staffs')) return '';

        $cols = ['staff_id'];
        if (Schema::hasColumn('staffs', 'role_name')) $cols[] = 'role_name';
        if (Schema::hasColumn('staffs', 'role_id')) $cols[] = 'role_id';

        $row = DB::table('staffs')->where('staff_id', $staffId)->first($cols);
        if (!$row) return '';

        $roleName = trim((string) ($row->role_name ?? ''));
        if ($roleName !== '') {
            return $this->prettyRoleName($roleName);
        }

        $roleId = (int) ($row->role_id ?? 0);
        if ($roleId <= 0 || !Schema::hasTable('roles')) return '';

        $rCols = ['role_id'];
        if (Schema::hasColumn('roles', 'label')) $rCols[] = 'label';
        if (Schema::hasColumn('roles', 'name')) $rCols[] = 'name';

        $r = DB::table('roles')->where('role_id', $roleId)->first($rCols);
        $label = trim((string) ($r->label ?? $r->name ?? ''));

        return $label !== '' ? $this->prettyRoleName($label) : '';
    }

    private function prettyRoleName(string $s): string
    {
        $s = trim($s);
        if ($s === '') return '';

        // normalize separators -> space
        $s = str_replace(['_', '-'], ' ', $s);
        $s = preg_replace('/\s+/', ' ', $s) ?: $s;

        // Title Case (simple)
        $s = mb_strtolower($s);
        $s = mb_convert_case($s, MB_CASE_TITLE);

        return $s;
    }

    private function loadItems(int $reagentRequestId): array
    {
        if (!Schema::hasTable('reagent_request_items')) return [];

        $required = ['reagent_request_id', 'item_name', 'qty'];
        foreach ($required as $c) {
            if (!Schema::hasColumn('reagent_request_items', $c)) return [];
        }

        $select = ['reagent_request_item_id', 'reagent_request_id', 'item_name', 'qty'];
        foreach (['item_type', 'specification', 'unit_text', 'sort_order', 'note'] as $c) {
            if (Schema::hasColumn('reagent_request_items', $c)) $select[] = $c;
        }

        $q = DB::table('reagent_request_items')->where('reagent_request_id', $reagentRequestId);

        if (Schema::hasColumn('reagent_request_items', 'sort_order')) {
            $q->orderBy('sort_order');
        }
        $q->orderBy('reagent_request_item_id');

        $rows = $q->get($select);

        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'item_type' => $r->item_type ?? '',
                'item_name' => $r->item_name ?? '',
                'specification' => $r->specification ?? '',
                'qty' => $r->qty ?? '',
                'unit_text' => $r->unit_text ?? '',
                'note' => $r->note ?? '',
            ];
        }
        return $out;
    }

    private function loadBookings(int $reagentRequestId): array
    {
        if (!Schema::hasTable('equipment_bookings')) return [];

        if (!Schema::hasColumn('equipment_bookings', 'reagent_request_id')) return [];
        if (!Schema::hasColumn('equipment_bookings', 'equipment_id')) return [];

        $select = ['booking_id', 'reagent_request_id', 'equipment_id'];
        foreach (['planned_start_at', 'planned_end_at', 'note'] as $c) {
            if (Schema::hasColumn('equipment_bookings', $c)) $select[] = $c;
        }

        // Prefer equipment_catalog (sesuai validator/controller), fallback to equipments (kalau ada env lama)
        $equipTable = null;
        if (Schema::hasTable('equipment_catalog')) $equipTable = 'equipment_catalog';
        if (!$equipTable && Schema::hasTable('equipments')) $equipTable = 'equipments';

        $canJoinEquipment = $equipTable &&
            Schema::hasColumn($equipTable, 'equipment_id') &&
            (Schema::hasColumn($equipTable, 'name') || Schema::hasColumn($equipTable, 'equipment_name'));

        $q = DB::table('equipment_bookings as eb')->where('eb.reagent_request_id', $reagentRequestId);

        if ($canJoinEquipment) {
            $q->leftJoin($equipTable . ' as e', 'e.equipment_id', '=', 'eb.equipment_id');
            $nameCol = Schema::hasColumn($equipTable, 'name') ? 'e.name' : 'e.equipment_name';
            $select[] = DB::raw("{$nameCol} as equipment_name");
        }

        if (Schema::hasColumn('equipment_bookings', 'planned_start_at')) {
            $q->orderBy('eb.planned_start_at');
        }
        $q->orderBy('eb.booking_id');

        $rows = $q->get($select);

        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'equipment_name' => (string) ($r->equipment_name ?? ('#' . ((int) ($r->equipment_id ?? 0)))),
                'planned_start_at' => $this->formatDateTime($r->planned_start_at ?? null),
                'planned_end_at' => $this->formatDateTime($r->planned_end_at ?? null),
                'note' => (string) ($r->note ?? ''),
            ];
        }
        return $out;
    }

    private function formatDateTime($value): string
    {
        if (!$value) return '';
        try {
            return Carbon::parse($value)->format('d-m-Y H:i');
        } catch (\Throwable $e) {
            return (string) $value;
        }
    }

    /**
     * Format: Senin,17 Februari 2026
     * (tanpa spasi setelah koma, sesuai contoh user)
     */
    private function formatDateLongId($value): string
    {
        if (!$value) return '';

        try {
            $dt = $value instanceof Carbon ? $value : Carbon::parse($value);
        } catch (\Throwable) {
            return (string) $value;
        }

        $days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        $months = [
            1 => 'Januari',
            2 => 'Februari',
            3 => 'Maret',
            4 => 'April',
            5 => 'Mei',
            6 => 'Juni',
            7 => 'Juli',
            8 => 'Agustus',
            9 => 'September',
            10 => 'Oktober',
            11 => 'November',
            12 => 'Desember',
        ];

        $dayName = $days[(int) $dt->dayOfWeek] ?? '';
        $monthName = $months[(int) $dt->format('n')] ?? $dt->format('m');

        return $dayName . ',' . $dt->format('d') . ' ' . $monthName . ' ' . $dt->format('Y');
    }

    /**
     * Quick check if DOCX bytes contains placeholder ${key} or ${key#...}
     * (dipakai untuk skip table rows yang tidak ada di template).
     */
    private function docxBytesContainsPlaceholder(string $docxBytes, string $key): bool
    {
        $key = $this->sanitizeKey($key);
        if ($key === '') return false;

        $needle1 = '${' . $key . '}';
        $needle2 = '${' . $key . '#';

        $tmpDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'biotrace_docx_check_' . bin2hex(random_bytes(6));
        @mkdir($tmpDir, 0775, true);
        $path = $tmpDir . DIRECTORY_SEPARATOR . 't.docx';
        file_put_contents($path, $docxBytes);

        $zip = new ZipArchive();
        $ok = $zip->open($path);

        try {
            if ($ok !== true) return false;

            $parts = ['word/document.xml'];
            for ($i = 1; $i <= 3; $i++) {
                $parts[] = "word/header{$i}.xml";
                $parts[] = "word/footer{$i}.xml";
            }

            foreach ($parts as $p) {
                $xml = $zip->getFromName($p);
                if (!is_string($xml) || $xml === '') continue;

                if (strpos($xml, $needle1) !== false) return true;
                if (strpos($xml, $needle2) !== false) return true;
            }

            return false;
        } finally {
            try {
                $zip->close();
            } catch (\Throwable) {
            }
            @unlink($path);
            @rmdir($tmpDir);
        }
    }

    private function sanitizeKey(string $key): string
    {
        $key = preg_replace('/[^A-Za-z0-9_]/', '_', $key) ?: '';
        return trim($key, '_');
    }

    private function safeFileStem(string $s): string
    {
        $s = trim($s);
        if ($s === '') $s = 'REAGENT_REQUEST';

        // Replace slashes etc
        $s = str_replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], '_', $s);
        $s = preg_replace('/\s+/', '_', $s) ?: 'REAGENT_REQUEST';
        $s = preg_replace('/[^A-Za-z0-9_\-\.]+/', '_', $s) ?: 'REAGENT_REQUEST';

        // Shorten (Windows-friendly)
        if (strlen($s) > 120) {
            $s = substr($s, 0, 120);
        }

        // Add random tail to avoid collision on forced regen with same number (rare but possible)
        return $s . '_' . substr(hash('sha256', Str::uuid()->toString()), 0, 8);
    }
}
