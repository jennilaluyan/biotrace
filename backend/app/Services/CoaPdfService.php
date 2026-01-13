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

    public function renderWithMetadata(
        string $view,
        array $payload,
        array $meta
    ): string {
        /** @var \Barryvdh\DomPDF\PDF $pdf */
        $pdf = Pdf::loadView($view, $payload)->setPaper('a4', 'portrait');

        $dompdf = $pdf->getDomPDF();

        // ✅ METADATA RESMI
        $dompdf->addInfo('Title', $meta['title'] ?? 'Certificate of Analysis');
        $dompdf->addInfo('Author', $meta['author'] ?? 'BioTrace LIMS');
        $dompdf->addInfo('Subject', $meta['subject'] ?? 'Laboratory Test Result');
        $dompdf->addInfo('Keywords', $meta['keywords'] ?? '');

        // 🧾 FORENSIC MARKER (HALUS)
        if (!empty($meta['legal_marker'])) {
            $pdf->getCanvas()->page_text(
                20,
                820,
                $meta['legal_marker'],
                null,
                6,
                [0.95, 0.95, 0.95]
            );
        }

        return $pdf->output();
    }
}
