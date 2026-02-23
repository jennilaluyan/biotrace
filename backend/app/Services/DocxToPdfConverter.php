<?php

namespace App\Services;

use RuntimeException;
use Symfony\Component\Process\Process;
use ZipArchive;

class DocxToPdfConverter
{
    public function convertBytes(string $inputBytes, string $ext = 'docx'): string
    {
        $ext = $this->normalizeExt($ext);

        $tmpDir = $this->makeTmpDir();
        $inPath = $tmpDir . DIRECTORY_SEPARATOR . 'input.' . $ext;

        file_put_contents($inPath, $inputBytes);

        try {
            // ✅ Basic validation (zip-based) to fail fast on corrupted templates
            if ($ext === 'docx') {
                $this->assertValidDocx($inPath);
            } elseif ($ext === 'xlsx') {
                $this->assertValidXlsx($inPath);
            }

            $bin = $this->sofficeBinForConversion();
            if (!$bin) {
                throw new RuntimeException(
                    "LibreOffice not found.\n" .
                        "Set SOFFICE_BIN in .env, e.g:\n" .
                        "SOFFICE_BIN=\"C:\\\\Program Files\\\\LibreOffice\\\\program\\\\soffice.com\""
                );
            }

            $loDir = dirname($bin);

            // isolate LibreOffice profile (avoid lock + permission problems)
            $profileDir = $tmpDir . DIRECTORY_SEPARATOR . 'lo-profile';
            if (!is_dir($profileDir)) @mkdir($profileDir, 0775, true);

            $profileUrl = $this->toFileUrl($profileDir, true);

            // ✅ Choose export filter by file type
            // - DOCX => writer_pdf_Export
            // - XLSX => calc_pdf_Export
            // Fallback => "pdf"
            $filter = $this->pdfFilterForExt($ext);

            $cmd = [
                $bin,
                '--headless',
                '--nologo',
                '--nofirststartwizard',
                '--norestore',
                '--invisible',
                '-env:UserInstallation=' . $profileUrl,
                '--convert-to',
                $filter,
                '--outdir',
                $tmpDir,
                $inPath,
            ];

            $cwd = is_dir($loDir) ? $loDir : $tmpDir;

            // ✅ critical: force TEMP/TMP to a writable folder + disable OpenCL
            $env = $this->buildLibreOfficeEnv($loDir, $tmpDir);

            $p = new Process($cmd, $cwd, $env);
            // XLSX can be heavier than DOCX; give it a bit more time.
            $p->setTimeout(240);
            $p->run();

            $out = trim((string) $p->getOutput());
            $err = trim((string) $p->getErrorOutput());

            if (!$p->isSuccessful()) {
                throw new RuntimeException(
                    "LibreOffice conversion failed (exit {$p->getExitCode()}).\n" .
                        "InputExt: {$ext}\n" .
                        "Command: " . $this->prettyCmd($cmd) . "\n" .
                        "CWD: {$cwd}\n" .
                        "TmpDir: {$tmpDir}\n" .
                        "TmpDir files: " . implode(', ', $this->listFiles($tmpDir)) . "\n" .
                        ($out !== '' ? "STDOUT: {$out}\n" : '') .
                        ($err !== '' ? "STDERR: {$err}\n" : '')
                );
            }

            // wait up to 30s for pdf
            $pdfPath = $this->findPdfOutputPath($tmpDir, $ext, 30);

            if (!$pdfPath) {
                throw new RuntimeException(
                    "PDF output not found after conversion.\n" .
                        "InputExt: {$ext}\n" .
                        "Command: " . $this->prettyCmd($cmd) . "\n" .
                        "CWD: {$cwd}\n" .
                        "TmpDir: {$tmpDir}\n" .
                        "TmpDir files: " . implode(', ', $this->listFiles($tmpDir)) . "\n" .
                        ($out !== '' ? "STDOUT: {$out}\n" : '') .
                        ($err !== '' ? "STDERR: {$err}\n" : '')
                );
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
    private function sofficeBinForConversion(): ?string
    {
        $envBin = trim((string) (env('SOFFICE_BIN') ?: ''), "\"' ");
        if ($envBin !== '' && is_file($envBin)) return $envBin;

        $cand = [
            'C:\\Program Files\\LibreOffice\\program\\soffice.com',
            'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
            'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com',
            'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
        ];

        foreach ($cand as $p) {
            if (is_file($p)) return $p;
        }

        return null;
    }

    private function buildLibreOfficeEnv(?string $loProgramDir, string $tmpDir): array
    {
        $env = $_ENV;

        // ✅ FORCE temp dirs (fix: "Failed to open temporary file" + IO write 16)
        $env['TMP'] = $tmpDir;
        $env['TEMP'] = $tmpDir;
        $env['TMPDIR'] = $tmpDir;

        // ✅ disable OpenCL to avoid HSAIL/GPU compiler noise & failures
        $env['SAL_DISABLE_OPENCL'] = '1';

        // (optional) sometimes helps headless stability
        $env['SAL_USE_VCLPLUGIN'] = 'gen';

        if ($loProgramDir && is_dir($loProgramDir)) {
            $env['UNO_PATH'] = $loProgramDir;

            $fundamental = $loProgramDir . DIRECTORY_SEPARATOR . 'fundamental.ini';
            if (is_file($fundamental)) {
                $env['URE_BOOTSTRAP'] = 'vnd.sun.star.pathname:' . str_replace('\\', '/', $fundamental);
            }

            $path = (string)($env['PATH'] ?? getenv('PATH') ?? '');
            if (stripos($path, $loProgramDir) === false) {
                $env['PATH'] = $loProgramDir . PATH_SEPARATOR . $path;
            }
        }

        return $env;
    }

    private function findPdfOutputPath(string $tmpDir, string $ext, int $waitSeconds = 20): ?string
    {
        $ext = $this->normalizeExt($ext);

        $candidates = [
            $tmpDir . DIRECTORY_SEPARATOR . 'input.pdf',
            $tmpDir . DIRECTORY_SEPARATOR . 'input.PDF',
            $tmpDir . DIRECTORY_SEPARATOR . "input.{$ext}.pdf",
            $tmpDir . DIRECTORY_SEPARATOR . "input.{$ext}.PDF",
        ];

        $tries = max(1, (int)($waitSeconds / 0.25));
        for ($i = 0; $i < $tries; $i++) {
            foreach ($candidates as $p) {
                if (is_file($p)) return $p;
            }

            $pdfs = glob($tmpDir . DIRECTORY_SEPARATOR . '*.{pdf,PDF}', GLOB_BRACE) ?: [];
            if (count($pdfs) > 0) return $pdfs[0];

            usleep(250000);
        }

        return null;
    }
    private function assertValidDocx(string $path): void
    {
        $zip = new ZipArchive();
        $ok = $zip->open($path);

        if ($ok !== true) {
            throw new RuntimeException("Input DOCX is not a valid zip archive (ZipArchive open code: {$ok}).");
        }

        try {
            foreach (['[Content_Types].xml', 'word/document.xml'] as $entry) {
                if ($zip->locateName($entry) === false) {
                    throw new RuntimeException("Input DOCX is missing required part: {$entry}");
                }
            }
        } finally {
            $zip->close();
        }
    }

    private function normalizeExt(string $ext): string
    {
        $ext = strtolower(trim($ext));
        $ext = ltrim($ext, '.');

        // keep it tight: only letters/numbers to avoid weird filenames
        $ext = preg_replace('/[^a-z0-9]+/', '', $ext) ?: 'docx';

        // alias support (optional)
        if ($ext === 'xlsm') $ext = 'xlsx';
        if ($ext === 'xltx') $ext = 'xlsx';

        return $ext;
    }

    private function pdfFilterForExt(string $ext): string
    {
        $ext = $this->normalizeExt($ext);

        // LibreOffice export filters:
        // - writer_pdf_Export for Writer (doc/docx)
        // - calc_pdf_Export for Calc (xls/xlsx)
        // Fallback to "pdf" lets LO try to infer.
        return match ($ext) {
            'doc', 'docx' => 'pdf:writer_pdf_Export',
            'xls', 'xlsx' => 'pdf:calc_pdf_Export',
            default => 'pdf',
        };
    }

    private function assertValidXlsx(string $path): void
    {
        $zip = new ZipArchive();
        $ok = $zip->open($path);

        if ($ok !== true) {
            throw new RuntimeException("Input XLSX is not a valid zip archive (ZipArchive open code: {$ok}).");
        }

        try {
            foreach (['[Content_Types].xml', 'xl/workbook.xml'] as $entry) {
                if ($zip->locateName($entry) === false) {
                    throw new RuntimeException("Input XLSX is missing required part: {$entry}");
                }
            }
        } finally {
            $zip->close();
        }
    }

    private function toFileUrl(string $path, bool $trailingSlash = false): string
    {
        $path = str_replace('\\', '/', $path);
        if ($trailingSlash && !str_ends_with($path, '/')) $path .= '/';

        if (preg_match('/^[A-Za-z]:\//', $path)) {
            $parts = explode('/', $path);
            $drive = array_shift($parts);
            $parts = array_map('rawurlencode', $parts);
            return 'file:///' . $drive . '/' . implode('/', $parts);
        }

        return 'file:///' . rawurlencode($path);
    }

    private function prettyCmd(array $cmd): string
    {
        return implode(' ', array_map([$this, 'shellQuote'], $cmd));
    }

    private function shellQuote(string $s): string
    {
        if ($s === '') return '""';
        if (preg_match('/\s|"|\'/u', $s)) {
            return '"' . str_replace('"', '\"', $s) . '"';
        }
        return $s;
    }

    private function listFiles(string $dir): array
    {
        $out = [];
        $all = glob($dir . DIRECTORY_SEPARATOR . '*') ?: [];
        foreach ($all as $p) $out[] = basename($p);
        sort($out);
        return $out;
    }

    private function makeTmpDir(): string
    {
        // ✅ use system temp to avoid long path + spaces + permissions
        $base = rtrim(sys_get_temp_dir(), "\\/") . DIRECTORY_SEPARATOR . 'biotrace-tmp-docs';
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

                $p = $dir . DIRECTORY_SEPARATOR . $f;
                if (is_dir($p)) {
                    $this->cleanupDir($p);
                    continue;
                }
                @unlink($p);
            }
        }
        @rmdir($dir);
    }
}
