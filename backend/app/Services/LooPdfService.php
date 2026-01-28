<?php

namespace App\Services;

use Barryvdh\DomPDF\Facade\Pdf;
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
        // replace slash to avoid nested folders if you want flat storage:
        $safe = str_replace('/', '_', $safe);

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
