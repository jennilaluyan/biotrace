<?php

namespace App\Services;

use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;

class ReagentRequestPdfService
{
    public function disk(): string
    {
        return (string) config('reagent_request.storage_disk', 'local');
    }

    public function storagePath(): string
    {
        return trim((string) config('reagent_request.storage_path', 'documents/reagent-requests'), '/');
    }

    /**
     * Resolve template logic: DB Config vs Blade View
     */
    public function resolveTemplate(): array
    {
        $docCode = 'REAGENT_REQUEST';
        $dbDoc = DB::table('documents')->where('doc_code', $docCode)->first();

        // Default Blade
        $view = 'documents.reagent_request';
        $useBlade = true;
        $physicalPath = null;

        // Jika ada di DB dan BUKAN virtual path, berarti ada file DOCX custom
        if ($dbDoc && $dbDoc->path && !str_starts_with($dbDoc->path, '__templates__/')) {
            $useBlade = false;
            $physicalPath = $dbDoc->path;
        }

        return [
            'use_blade' => $useBlade,
            'view' => $view,
            'file_path' => $physicalPath,
            'record_no_prefix' => $dbDoc->record_no_prefix ?? '', // Bonus: ambil config penomoran dari DB
            'form_code_prefix' => $dbDoc->form_code_prefix ?? '',
        ];
    }

    public function buildPath(string $docNo): string
    {
        $base = $this->storagePath();
        $safe = preg_replace('/[^A-Za-z0-9_\-]+/', '_', $docNo) ?: 'reagent_request';
        return "{$base}/{$safe}.pdf";
    }

    public function render(array $templateInfo, array $data): string
    {
        if ($templateInfo['use_blade']) {
            // Render Blade
            $pdf = Pdf::loadView($templateInfo['view'], $data)->setPaper('a4', 'portrait');
            return $pdf->output();
        }

        // TODO: Implement DOCX -> PDF logic here later
        throw new \RuntimeException("DOCX rendering not yet implemented for physical path: " . $templateInfo['file_path']);
    }

    public function store(string $path, string $binary): void
    {
        Storage::disk($this->disk())->put($path, $binary);
    }
}
