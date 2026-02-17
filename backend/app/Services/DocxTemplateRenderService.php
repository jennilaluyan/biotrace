<?php

namespace App\Services;

use PhpOffice\PhpWord\TemplateProcessor;
use RuntimeException;
use ZipArchive;

class DocxTemplateRenderService
{
    /**
     * Render DOCX template bytes into a merged DOCX (bytes).
     *
     * @param string $templateDocxBytes Original template bytes (docx)
     * @param array<string, string|int|float|null> $vars Placeholder values
     * @param array<string, array<int, array<string, string|int|float|null>>> $rows
     *        Example:
     *        [
     *          'item_no' => [
     *             ['item_no' => 1, 'item_name' => 'Buffer', 'qty' => 2],
     *             ['item_no' => 2, 'item_name' => 'Tube', 'qty' => 5],
     *          ]
     *        ]
     *        Where 'item_no' is the row key used in DOCX (e.g. ${item_no} inside a table row).
     */
    public function renderBytes(string $templateDocxBytes, array $vars = [], array $rows = []): string
    {
        $tmpDir = $this->makeTmpDir();
        $inPath = $tmpDir . DIRECTORY_SEPARATOR . 'template.docx';
        $outPath = $tmpDir . DIRECTORY_SEPARATOR . 'merged.docx';

        file_put_contents($inPath, $templateDocxBytes);

        try {
            $tp = new TemplateProcessor($inPath);

            // scalar placeholders: setValue('record_no', '...') expects ${record_no} in docx
            foreach ($vars as $k => $v) {
                $key = $this->sanitizeKey((string) $k);
                if ($key === '') continue;
                $tp->setValue($key, $v === null ? '' : (string) $v);
            }

            // table rows clone
            foreach ($rows as $rowKey => $rowList) {
                $rk = $this->sanitizeKey((string) $rowKey);

                if ($rk === '' || !is_array($rowList)) continue;

                if (method_exists($tp, 'cloneRowAndSetValues')) {
                    $values = [];
                    foreach ($rowList as $row) {
                        if (!is_array($row)) continue;

                        $flat = [];
                        foreach ($row as $colKey => $colVal) {
                            $ck = $this->sanitizeKey((string) $colKey);
                            if ($ck === '') continue;
                            $flat[$ck] = $colVal === null ? '' : (string) $colVal;
                        }

                        if (!empty($flat)) $values[] = $flat;
                    }

                    if (count($values) === 0) continue;

                    // ✅ pilih anchor yang benar-benar ada di template
                    $anchor = $this->pickCloneAnchor($inPath, $rk, $values);

                    try {
                        $tp->cloneRowAndSetValues($anchor, $values);
                    } catch (\Throwable $e) {
                        // last resort: coba kandidat lain (kalau template beda)
                        $cands = array_unique(array_merge([$rk], array_keys($values[0] ?? [])));
                        $ok = false;

                        foreach ($cands as $cand) {
                            $cand = $this->sanitizeKey((string) $cand);
                            if ($cand === '' || $cand === $anchor) continue;

                            try {
                                $tp->cloneRowAndSetValues($cand, $values);
                                $ok = true;
                                break;
                            } catch (\Throwable) {
                                // keep trying
                            }
                        }

                        if (!$ok) {
                            throw new RuntimeException(
                                "Cannot clone DOCX table row. No usable placeholder found. " .
                                    "Put one of these placeholders as PLAIN TEXT (no bold/markup split) inside the table row: " .
                                    '${' . $rk . '} or ${no} or ${lab_sample_code}.',
                                0,
                                $e
                            );
                        }
                    }
                } else {
                    // fallback: cloneRow + setValue with index suffix #1, #2 ...
                    $n = count($rowList);
                    $tp->cloneRow($rk, $n);

                    for ($i = 0; $i < $n; $i++) {
                        $idx = $i + 1;
                        $row = $rowList[$i];
                        if (!is_array($row)) continue;

                        foreach ($row as $colKey => $colVal) {
                            $ck = $this->sanitizeKey((string) $colKey);
                            if ($ck === '') continue;
                            $tp->setValue($ck . '#' . $idx, $colVal === null ? '' : (string) $colVal);
                        }
                    }
                }
            }

            $tp->saveAs($outPath);

            $merged = file_get_contents($outPath);
            if ($merged === false) {
                throw new RuntimeException('Failed to read merged DOCX output.');
            }

            return $merged;
        } finally {
            $this->cleanupDir($tmpDir);
        }
    }

    private function pickCloneAnchor(string $docxPath, string $preferred, array $values): string
    {
        $preferred = $this->sanitizeKey($preferred);

        // kandidat anchor: preferred + semua kolom di row
        $cands = array_unique(array_merge([$preferred], array_keys($values[0] ?? [])));

        foreach ($cands as $c) {
            $c = $this->sanitizeKey((string) $c);
            if ($c === '') continue;

            if ($this->docxContainsPlaceholder($docxPath, $c)) {
                return $c;
            }
        }

        // fallback tetap pakai preferred (biar error message dari try/catch)
        return $preferred !== '' ? $preferred : 'item_no';
    }

    private function docxContainsPlaceholder(string $docxPath, string $key): bool
    {
        $key = $this->sanitizeKey($key);
        if ($key === '') return false;

        $needle1 = '${' . $key . '}';
        $needle2 = '${' . $key . '#'; // indexed placeholders

        $zip = new ZipArchive();
        if ($zip->open($docxPath) !== true) return false;

        try {
            // cek document + header/footer (cukup untuk case normal)
            $parts = ['word/document.xml'];
            for ($i = 1; $i <= 3; $i++) {
                $parts[] = "word/header{$i}.xml";
                $parts[] = "word/footer{$i}.xml";
            }

            foreach ($parts as $p) {
                $xml = $zip->getFromName($p);
                if (!is_string($xml) || $xml === '') continue;

                if (strpos($xml, $needle1) !== false) return true;
                if (strpos($xml, $needle2) !== false) return true;
            }

            return false;
        } finally {
            $zip->close();
        }
    }

    private function sanitizeKey(string $key): string
    {
        // keep it simple: alnum + underscore only
        $key = preg_replace('/[^A-Za-z0-9_]/', '_', $key) ?: '';
        return trim($key, '_');
    }

    private function makeTmpDir(): string
    {
        $base = storage_path('app/tmp-docs');
        if (!is_dir($base)) @mkdir($base, 0775, true);

        $dir = $base . DIRECTORY_SEPARATOR . 'docx_' . bin2hex(random_bytes(8));
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