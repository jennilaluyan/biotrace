<?php

namespace App\Services;

use App\Models\GeneratedDocument;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use RuntimeException;

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
            $cycleNo = (int) ($rr->cycle_no ?? 0);

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

            $requester = $this->loadStaffMini((int) ($rr->created_by_staff_id ?? 0));
            $approver = $this->loadStaffMini((int) ($rr->approved_by_staff_id ?? 0));

            // 5) Load items + equipment bookings (best-effort, schema-safe)
            $items = $this->loadItems($reagentRequestId);
            $bookings = $this->loadBookings($reagentRequestId);

            // 6) Build DOCX variables + rows
            $vars = [
                // numbering
                'record_no' => (string) ($nums['record_no'] ?? ''),
                'form_code' => (string) ($nums['form_code'] ?? ''),
                'revision_no' => (string) ((int) ($nums['revision_no'] ?? 0)),

                // identity
                'reagent_request_id' => (string) $reagentRequestId,
                'loo_number' => $looNumber,
                'cycle_no' => (string) $cycleNo,

                // dates
                'generated_at' => $generatedAt->format('d-m-Y H:i'),
                'approved_at' => $this->formatDateTime($rr->approved_at ?? null),
                'submitted_at' => $this->formatDateTime($rr->submitted_at ?? null),
                'created_at' => $this->formatDateTime($rr->created_at ?? null),

                // people
                'requester_name' => $requester['name'],
                'requester_nip' => $requester['nip'],
                'approver_name' => $approver['name'],
                'approver_nip' => $approver['nip'],
            ];

            $itemRows = [];
            foreach ($items as $idx => $it) {
                $itemRows[] = [
                    'item_no' => (string) ($idx + 1),
                    'item_name' => (string) ($it['item_name'] ?? ''),
                    'specification' => (string) ($it['specification'] ?? ''),
                    'qty' => (string) ($it['qty'] ?? ''),
                    'unit' => (string) ($it['unit_text'] ?? ''),
                    'note' => (string) ($it['note'] ?? ''),
                    'item_type' => (string) ($it['item_type'] ?? ''),
                ];
            }

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

            $rows = [
                // ✅ DOCX table clone keys (template must contain ${item_no} / ${booking_no})
                'item_no' => $itemRows,
                'booking_no' => $bookingRows,
            ];

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

        $doc = DB::table('documents')
            ->where('doc_code', $docCode)
            ->where('is_active', true)
            ->first(['doc_id', 'doc_code', 'current_version_id']);

        if (!$doc) {
            throw new RuntimeException("Template {$docCode} is not configured or not active.");
        }

        $verId = (int) ($doc->current_version_id ?? 0);
        if ($verId <= 0) {
            throw new RuntimeException("Template {$docCode} has no uploaded version yet.");
        }

        $ver = DB::table('document_versions')->where('doc_version_id', $verId)->first(['doc_version_id', 'file_id', 'version_no']);
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

        // Try to join equipment name if possible
        $canJoinEquipment = Schema::hasTable('equipments') &&
            Schema::hasColumn('equipments', 'equipment_id') &&
            (Schema::hasColumn('equipments', 'name') || Schema::hasColumn('equipments', 'equipment_name'));

        $q = DB::table('equipment_bookings as eb')->where('eb.reagent_request_id', $reagentRequestId);

        if ($canJoinEquipment) {
            $q->leftJoin('equipments as e', 'e.equipment_id', '=', 'eb.equipment_id');
            $nameCol = Schema::hasColumn('equipments', 'name') ? 'e.name' : 'e.equipment_name';
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
