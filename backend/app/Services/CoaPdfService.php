<?php

namespace App\Services;

use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;

class CoaPdfService
{
    public function disk(): string
    {
        return (string) config('coa.storage_disk', 'local');
    }

    public function resolveView(string $templateKey): string
    {
        return match ($templateKey) {
            'individual' => 'reports.coa.individual',
            'institution_v1' => 'reports.coa.institution_v1',
            'institution_v2' => 'reports.coa.institution_v2',
            default => throw new InvalidArgumentException("Unknown CoA template key [$templateKey]."),
        };
    }

    public function buildPath(string $reportNo, string $templateKey): string
    {
        $base = trim((string) config('coa.storage_path', 'reports/coa'), '/');
        $safe = preg_replace('/[^A-Za-z0-9_\-]+/', '_', $reportNo) ?: 'coa';
        return "{$base}/{$safe}_{$templateKey}.pdf";
    }

    public function render(string $view, array $data): string
    {
        $pdf = Pdf::loadView($view, $data)->setPaper('a4', 'portrait');
        return $pdf->output();
    }

    public function store(string $path, string $binary): void
    {
        Storage::disk($this->disk())->put($path, $binary);
    }

    public function generateQrPng(string $url): string
    {
        return \SimpleSoftwareIO\QrCode\Facades\QrCode::format('png')
            ->size(120)
            ->margin(1)
            ->generate($url);
    }
}
