<?php

namespace App\Services;

use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\Storage;

class LoaPdfService
{
    public function disk(): string
    {
        return (string) config('loa.storage_disk', 'local');
    }

    public function buildPath(string $loaNumber): string
    {
        $base = trim((string) config('loa.storage_path', 'letters/loa'), '/');
        $year = now()->format('Y');
        $safe = preg_replace('/[^A-Za-z0-9_\-]+/', '_', $loaNumber) ?: 'loa';
        return "{$base}/{$year}/{$safe}.pdf";
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
}
