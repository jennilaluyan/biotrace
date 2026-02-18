<?php

namespace App\Services;

use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class LooPdfService
{
    public function disk(): string
    {
        return (string) config('loo.storage_disk', 'local');
    }

    public function buildPath(string $looNumber): string
    {
        $base = trim((string) config('loo.storage_path', 'letters/loo'), '/');
        $year = now()->format('Y');
        $safe = preg_replace('/[^A-Za-z0-9_\-\/]+/', '_', $looNumber) ?: 'loo';
        $safe = str_replace('/', '_', $safe);

        return "{$base}/{$year}/{$safe}.pdf";
    }

    /**
     * Render now accepts resolved template info or logic to fetch it
     */
    public function render(string $viewNameDefault, array $data): string
    {
        // 1. Cek DB untuk LOO Template
        $dbDoc = DB::table('documents')->where('doc_code', 'LOO_SURAT_PENGUJIAN')->first();

        // 2. Cek apakah harus pakai Blade atau DOCX
        if ($dbDoc && $dbDoc->path && !str_starts_with($dbDoc->path, '__templates__/')) {
            // Logic masa depan: Render DOCX
            // $docxService->render($dbDoc->path, $data)...
            throw new \RuntimeException('Custom LOO DOCX template found but render logic not implemented.');
        }

        // 3. Fallback: Render Default Blade
        $pdf = Pdf::loadView($viewNameDefault, $data)->setPaper('a4', 'portrait');
        return $pdf->output();
    }

    public function store(string $path, string $binary): void
    {
        Storage::disk($this->disk())->put($path, $binary);
    }
}
