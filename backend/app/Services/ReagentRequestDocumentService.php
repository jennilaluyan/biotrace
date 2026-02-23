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
    private const DOC_CODE = 'REAGENT_REQUEST';
    private const ENTITY_TYPE = 'reagent_request';

    public function __construct(
        private readonly FileStoreService $files,
        private readonly DocNumberService $numbers,
        private readonly DocxTemplateRenderService $docx,
        private readonly DocxToPdfConverter $converter,
    ) {}

    /**
     * Generate official PDF for an APPROVED reagent request from DB template (DOCX),
     * store PDF in files table, and register in generated_documents.
     *
     * Notes:
     * - This is intentionally deterministic per approved request; we reuse the active generated doc unless forced.
     * - Template must exist in documents/documents_versions/files tables (uploaded DOCX).
     */
    public function generateApprovedPdf(
        int $reagentRequestId,
        int $actorStaffId,
        bool $forceRegenerate = false,
        ?Carbon $generatedAt = null,
    ): GeneratedDocument {
        $this->assertPositive($reagentRequestId, 'reagent_request_id');
        $this->assertPositive($actorStaffId, 'actor_staff_id');

        $generatedAt = $generatedAt ?: now();

        return DB::transaction(function () use ($reagentRequestId, $actorStaffId, $forceRegenerate, $generatedAt) {
            $existing = $this->findExistingActiveDoc($reagentRequestId);

            if ($existing && !$forceRegenerate) {
                return $existing;
            }
            if ($existing && $forceRegenerate) {
                $existing->is_active = false;
                $existing->save();
            }

            $rr = $this->loadApprovedReagentRequestOrFail($reagentRequestId);

            $loId = (int) ($rr->lo_id ?? 0);
            $cycleNo = (int) ($rr->cycle_no ?? 1);
            if ($cycleNo <= 0) $cycleNo = 1;

            // 1) Template bytes (DOCX) + its version number
            $tpl = $this->loadActiveTemplateOrFail(self::DOC_CODE);
            $templateBytes = $tpl['bytes'];
            $templateVersionNo = (int) $tpl['template_version'];

            // 2) Document numbering
            $nums = $this->numbers->generate(self::DOC_CODE, $generatedAt);

            // 3) Related info (LoO number + staff)
            $looNumber = $this->loadLooNumber($loId);

            // requester = submitter (preferred) else creator
            $requesterStaffId = (int) (($rr->submitted_by_staff_id ?? 0) ?: ($rr->created_by_staff_id ?? 0));
            $requester = $this->loadStaffMini($requesterStaffId);
            $requesterRole = $this->loadStaffRoleLabel($requesterStaffId);

            $approver = $this->loadStaffMini((int) ($rr->approved_by_staff_id ?? 0));

            // 4) Items + equipment bookings (best-effort, schema-safe)
            $items = $this->loadItems($reagentRequestId);
            $bookings = $this->loadBookings($reagentRequestId);

            // 5) DOCX placeholders (scalar fields)
            $vars = [
                // numbering
                'record_no' => (string) ($nums['record_no'] ?? ''),
                'form_code' => (string) ($nums['form_code'] ?? ''),
                'revision_no' => (string) ((int) ($nums['revision_no'] ?? 0)),

                // identity
                'reagent_request_id' => (string) $reagentRequestId,
                'loo_number' => $looNumber,
                'cycle_no' => (string) $cycleNo,

                // timestamps (legacy placeholders)
                'generated_at' => $generatedAt->format('d-m-Y H:i'),
                'approved_at' => $this->formatDateTime($rr->approved_at ?? null),
                'submitted_at' => $this->formatDateTime($rr->submitted_at ?? null),
                'created_at' => $this->formatDateTime($rr->created_at ?? null),

                // form field: "Hari/Tanggal"
                // Requested format: "Senin, 23 Februari 2026"
                'request_date_long' => $this->formatDateLongId($generatedAt),

                // people
                'requester_name' => $requester['name'],
                'requester_nip' => $requester['nip'],
                'requester_role' => $requesterRole,

                'approver_name' => $approver['name'],
                'approver_nip' => $approver['nip'],
            ];

            // 6) DOCX table rows
            $rows = [];

            // Reagent table:
            // Template placeholders expected in 1 data row: ${item_no}, ${item_name}, ${qty_text}, ${note}
            $rows['item_no'] = $this->buildReagentItemRows($items);

            // Equipment table (optional):
            // Only processed if template contains placeholder ${booking_no}
            if ($this->docxBytesContainsPlaceholder($templateBytes, 'booking_no')) {
                // Template placeholders expected: ${booking_no}, ${equipment_name}, ${planned_start_at}, ${planned_end_at}, ${booking_note}
                $rows['booking_no'] = $this->buildBookingRows($bookings);
            }

            // 7) Render merged DOCX -> convert to PDF
            $mergedDocx = $this->docx->renderBytes($templateBytes, $vars, $rows);
            $pdfBytes = $this->converter->convertBytes($mergedDocx);

            // 8) Store PDF in DB (files)
            $safe = $this->safeFileStem((string) ($nums['record_no'] ?? (self::DOC_CODE . "_{$reagentRequestId}")));
            $pdfName = "{$safe}.pdf";

            $pdfFileId = $this->files->storeBytes(
                $pdfBytes,
                $pdfName,
                'application/pdf',
                'pdf',
                $actorStaffId,
                true
            );

            // 9) Register generated document
            if (!Schema::hasTable('generated_documents')) {
                throw new RuntimeException('generated_documents table is missing.');
            }

            $gd = new GeneratedDocument();
            $gd->doc_code = self::DOC_CODE;
            $gd->entity_type = self::ENTITY_TYPE;
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

    // -------------------------------------------------------------------------
    // Build DOCX table rows
    // -------------------------------------------------------------------------

    /**
     * Build reagent item rows for DOCX cloneRowAndSetValues.
     * Template must contain placeholders in 1 table row (plain text, not split by formatting):
     * - ${item_no}, ${item_name}, ${qty_text}, ${note}
     *
     * If items are empty, we return a single blank row so placeholders disappear instead of
     * remaining visible in the output PDF.
     */
    private function buildReagentItemRows(array $items): array
    {
        $rows = [];

        foreach ($items as $idx => $it) {
            $qty = (string) ($it['qty'] ?? '');
            $unit = trim((string) ($it['unit_text'] ?? ''));

            $qtyText = trim($qty . ($unit !== '' ? ' ' . $unit : ''));

            $rows[] = [
                'item_no' => (string) ($idx + 1),
                'item_name' => (string) ($it['item_name'] ?? ''),
                'qty_text' => $qtyText,
                'note' => (string) ($it['note'] ?? ''),
            ];
        }

        if (count($rows) === 0) {
            $rows[] = [
                'item_no' => '',
                'item_name' => '',
                'qty_text' => '',
                'note' => '',
            ];
        }

        return $rows;
    }

    /**
     * Build equipment booking rows (optional table).
     * Template placeholders recommended:
     * - ${booking_no}, ${equipment_name}, ${planned_start_at}, ${planned_end_at}, ${booking_note}
     *
     * If bookings are empty, we return one blank row to clean placeholders.
     */
    private function buildBookingRows(array $bookings): array
    {
        $rows = [];

        foreach ($bookings as $idx => $b) {
            $rows[] = [
                'booking_no' => (string) ($idx + 1),
                'equipment_name' => (string) ($b['equipment_name'] ?? ''),
                'planned_start_at' => (string) ($b['planned_start_at'] ?? ''),
                'planned_end_at' => (string) ($b['planned_end_at'] ?? ''),
                'booking_note' => (string) ($b['note'] ?? ''),
            ];
        }

        if (count($rows) === 0) {
            $rows[] = [
                'booking_no' => '',
                'equipment_name' => '',
                'planned_start_at' => '',
                'planned_end_at' => '',
                'booking_note' => '',
            ];
        }

        return $rows;
    }

    // -------------------------------------------------------------------------
    // Data loading
    // -------------------------------------------------------------------------

    private function findExistingActiveDoc(int $reagentRequestId): ?GeneratedDocument
    {
        if (!Schema::hasTable('generated_documents')) return null;

        /** @var GeneratedDocument|null $existing */
        $existing = GeneratedDocument::query()
            ->where('doc_code', self::DOC_CODE)
            ->where('entity_type', self::ENTITY_TYPE)
            ->where('entity_id', $reagentRequestId)
            ->where('is_active', true)
            ->orderByDesc('gen_doc_id')
            ->first();

        return $existing;
    }

    private function loadApprovedReagentRequestOrFail(int $reagentRequestId): object
    {
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

        return $rr;
    }

    private function loadLooNumber(int $loId): string
    {
        if ($loId <= 0 || !Schema::hasTable('letters_of_order')) return '';

        $loo = DB::table('letters_of_order')
            ->where('lo_id', $loId)
            ->first(['number']);

        return (string) ($loo->number ?? '');
    }

    /**
     * Load active template bytes for given doc code from documents + document_versions + files.
     *
     * Schema notes:
     * - documents may have current_version_id OR version_current_id (legacy naming).
     * - document_versions primary key may be doc_ver_id OR doc_version_id.
     * - files.bytes in PostgreSQL may be returned as a stream resource (bytea), so we normalize it.
     */
    private function loadActiveTemplateOrFail(string $docCode): array
    {
        if (!Schema::hasTable('documents') || !Schema::hasTable('document_versions') || !Schema::hasTable('files')) {
            throw new RuntimeException('Document template tables are missing.');
        }

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

        $verPk = $this->detectDocumentVersionPk();
        $ver = DB::table('document_versions')
            ->where($verPk, $verId)
            ->first([$verPk, 'file_id', 'version_no']);

        if (!$ver) {
            throw new RuntimeException("Template {$docCode} version not found.");
        }

        $fileId = (int) ($ver->file_id ?? 0);
        if ($fileId <= 0) {
            throw new RuntimeException("Template {$docCode} version has no file_id.");
        }

        $file = $this->files->getFile($fileId);
        $bytes = $this->normalizeDbBytes($file->bytes ?? null);

        if ($bytes === '') {
            throw new RuntimeException("Template {$docCode} file bytes not found.");
        }

        // DOCX is a ZIP file; most start with "PK"
        if (strlen($bytes) < 200 || strpos($bytes, 'PK') !== 0) {
            throw new RuntimeException("Template {$docCode} file is not a valid DOCX. Re-upload template.");
        }

        return [
            'bytes' => $bytes,
            'template_version' => (int) ($ver->version_no ?? 0),
        ];
    }

    private function detectDocumentVersionPk(): string
    {
        if (Schema::hasColumn('document_versions', 'doc_ver_id')) return 'doc_ver_id';
        if (Schema::hasColumn('document_versions', 'doc_version_id')) return 'doc_version_id';

        throw new RuntimeException('document_versions primary key column not found (doc_ver_id/doc_version_id).');
    }

    /**
     * Normalize DB bytes (Postgres bytea can be returned as stream resource).
     */
    private function normalizeDbBytes($bytes): string
    {
        if (is_resource($bytes)) {
            $read = stream_get_contents($bytes);
            return is_string($read) ? $read : '';
        }
        return is_string($bytes) ? $bytes : '';
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

        $s = str_replace(['_', '-'], ' ', $s);
        $s = preg_replace('/\s+/', ' ', $s) ?: $s;

        $s = mb_strtolower($s);
        return mb_convert_case($s, MB_CASE_TITLE);
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

        // Prefix all columns with "eb" to avoid ambiguity when joining equipment tables.
        $select = [
            'eb.booking_id',
            'eb.reagent_request_id',
            'eb.equipment_id',
        ];

        foreach (['planned_start_at', 'planned_end_at', 'note'] as $c) {
            if (Schema::hasColumn('equipment_bookings', $c)) {
                $select[] = "eb.{$c}";
            }
        }

        $equipTable = null;
        if (Schema::hasTable('equipment_catalog')) $equipTable = 'equipment_catalog';
        if (!$equipTable && Schema::hasTable('equipments')) $equipTable = 'equipments';

        $canJoinEquipment = $equipTable &&
            Schema::hasColumn($equipTable, 'equipment_id') &&
            (Schema::hasColumn($equipTable, 'name') || Schema::hasColumn($equipTable, 'equipment_name'));

        $q = DB::table('equipment_bookings as eb')
            ->where('eb.reagent_request_id', $reagentRequestId);

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

    // -------------------------------------------------------------------------
    // Formatting helpers
    // -------------------------------------------------------------------------

    private function formatDateTime($value): string
    {
        if (!$value) return '';
        try {
            return Carbon::parse($value)->format('d-m-Y H:i');
        } catch (\Throwable) {
            return (string) $value;
        }
    }

    /**
     * Format: "Senin, 23 Februari 2026"
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

        return $dayName . ', ' . $dt->format('d') . ' ' . $monthName . ' ' . $dt->format('Y');
    }

    // -------------------------------------------------------------------------
    // Template probing helpers
    // -------------------------------------------------------------------------

    /**
     * Quick check if DOCX bytes contains placeholder ${key} or ${key#...}.
     * Used to gracefully skip optional tables (like equipment booking table).
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

    // -------------------------------------------------------------------------
    // Utility
    // -------------------------------------------------------------------------

    private function sanitizeKey(string $key): string
    {
        $key = preg_replace('/[^A-Za-z0-9_]/', '_', $key) ?: '';
        return trim($key, '_');
    }

    private function safeFileStem(string $s): string
    {
        $s = trim($s);
        if ($s === '') $s = self::DOC_CODE;

        $s = str_replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], '_', $s);
        $s = preg_replace('/\s+/', '_', $s) ?: self::DOC_CODE;
        $s = preg_replace('/[^A-Za-z0-9_\-\.]+/', '_', $s) ?: self::DOC_CODE;

        if (strlen($s) > 120) {
            $s = substr($s, 0, 120);
        }

        return $s . '_' . substr(hash('sha256', Str::uuid()->toString()), 0, 8);
    }

    private function assertPositive(int $value, string $name): void
    {
        if ($value <= 0) {
            throw new RuntimeException("{$name} is required.");
        }
    }
}
