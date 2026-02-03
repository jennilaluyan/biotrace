<?php

namespace App\Services;

use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;

class ReagentRequestPdfService
{
    /**
     * Keep it consistent with CoaPdfService pattern:
     * - resolveView(templateKey)
     * - buildPath(docNo, templateKey)
     * - render(view, data)
     * - store(path, binary)
     */

    public function disk(): string
    {
        // default: local (same spirit as CoaPdfService)
        return (string) config('reagent_request.storage_disk', 'local');
    }

    public function storagePath(): string
    {
        return trim((string) config('reagent_request.storage_path', 'documents/reagent-requests'), '/');
    }

    public function resolveView(string $templateKey): string
    {
        return match ($templateKey) {
            'default' => 'documents.reagent_request',
            default => throw new InvalidArgumentException("Unknown Reagent Request template key [$templateKey]."),
        };
    }

    public function buildPath(string $docNo, string $templateKey = 'default'): string
    {
        $base = $this->storagePath();
        $safe = preg_replace('/[^A-Za-z0-9_\-]+/', '_', $docNo) ?: 'reagent_request';
        return "{$base}/{$safe}_{$templateKey}.pdf";
    }

    public function render(string $view, array $data): string
    {
        // A4 portrait, consistent with other PDFs
        $pdf = Pdf::loadView($view, $data)->setPaper('a4', 'portrait');
        return $pdf->output();
    }

    public function store(string $path, string $binary): void
    {
        Storage::disk($this->disk())->put($path, $binary);
    }
}
