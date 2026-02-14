<?php

namespace App\Services;

use RuntimeException;
use Symfony\Component\Process\Process;

class DocxToPdfConverter
{
    /**
     * Convert DOCX bytes to PDF bytes using LibreOffice headless.
     * Requires `soffice` available on PATH or via env SOFFICE_BIN.
     */
    public function convertBytes(string $docxBytes): string
    {
        $tmpDir = $this->makeTmpDir();
        $inPath = $tmpDir . DIRECTORY_SEPARATOR . 'input.docx';

        file_put_contents($inPath, $docxBytes);

        try {
            $this->assertLibreOfficeAvailable();

            $bin = $this->sofficeBin();
            $cmd = [
                $bin,
                '--headless',
                '--nologo',
                '--nofirststartwizard',
                '--convert-to',
                'pdf',
                '--outdir',
                $tmpDir,
                $inPath,
            ];

            $p = new Process($cmd);
            $p->setTimeout(60); // 60s should be enough for typical docs
            $p->run();

            if (!$p->isSuccessful()) {
                throw new RuntimeException(
                    "LibreOffice conversion failed: " . $p->getErrorOutput() . " " . $p->getOutput()
                );
            }

            $pdfPath = $tmpDir . DIRECTORY_SEPARATOR . 'input.pdf';
            if (!file_exists($pdfPath)) {
                // Sometimes LO uses same basename; still should be input.pdf
                $pdfs = glob($tmpDir . DIRECTORY_SEPARATOR . '*.pdf') ?: [];
                if (count($pdfs) > 0) $pdfPath = $pdfs[0];
            }

            if (!file_exists($pdfPath)) {
                throw new RuntimeException("PDF output not found after conversion.");
            }

            $pdf = file_get_contents($pdfPath);
            if ($pdf === false) {
                throw new RuntimeException("Failed to read PDF output.");
            }

            return $pdf;
        } finally {
            $this->cleanupDir($tmpDir);
        }
    }

    public function assertLibreOfficeAvailable(): void
    {
        $bin = $this->sofficeBin();

        $p = new Process([$bin, '--version']);
        $p->setTimeout(5);
        $p->run();

        if (!$p->isSuccessful()) {
            throw new RuntimeException(
                "LibreOffice (soffice) not available. Install LibreOffice and ensure `soffice` is on PATH, " .
                    "or set env SOFFICE_BIN to the executable path."
            );
        }
    }

    private function sofficeBin(): string
    {
        return (string) (env('SOFFICE_BIN') ?: 'soffice');
    }

    private function makeTmpDir(): string
    {
        $base = storage_path('app/tmp-docs');
        if (!is_dir($base)) @mkdir($base, 0775, true);

        $dir = $base . DIRECTORY_SEPARATOR . 'pdf_' . bin2hex(random_bytes(8));
        if (!@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException("Unable to create temp dir: {$dir}");
        }
        return $dir;
    }

    private function cleanupDir(string $dir): void
    {
        if (!is_dir($dir)) return;
        $files = scandir($dir);
        if ($files) {
            foreach ($files as $f) {
                if ($f === '.' || $f === '..') continue;
                @unlink($dir . DIRECTORY_SEPARATOR . $f);
            }
        }
        @rmdir($dir);
    }
}