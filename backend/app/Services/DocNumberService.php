<?php

namespace App\Services;

use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class DocNumberService
{
    /**
     * Generate record number & form code based on documents registry row (by doc_code).
     *
     * Output:
     * - record_no: <record_no_prefix><DDMMYY>
     * - form_code: <form_code_prefix><DD-MM-YY>
     *
     * Note: form_code_prefix may already contain "RevXX." OR may be base prefix only.
     */
    public function generate(string $docCode, ?Carbon $generatedAt = null): array
    {
        $generatedAt = $generatedAt ?: now();

        $doc = DB::table('documents')
            ->where('doc_code', $docCode)
            ->where('kind', 'template')
            ->where('is_active', true)
            ->first();

        if (!$doc) {
            throw new RuntimeException("Template document not found or inactive for doc_code={$docCode}");
        }

        $recordPrefix = (string) ($doc->record_no_prefix ?? '');
        $formPrefixRaw = (string) ($doc->form_code_prefix ?? '');
        $revNo = (int) ($doc->revision_no ?? 0);

        if ($recordPrefix === '') {
            throw new RuntimeException("record_no_prefix is missing for doc_code={$docCode}");
        }
        if ($formPrefixRaw === '') {
            throw new RuntimeException("form_code_prefix is missing for doc_code={$docCode}");
        }

        $ddmmyy = $generatedAt->format('dmy');      // DDMMYY
        $dd_mm_yy = $generatedAt->format('d-m-y');  // DD-MM-YY

        $recordNo = $recordPrefix . $ddmmyy;
        $formPrefix = $this->normalizeFormPrefix($formPrefixRaw, $revNo);
        $formCode = $formPrefix . $dd_mm_yy;

        return [
            'doc_code' => $docCode,
            'record_no' => $recordNo,
            'form_code' => $formCode,
            'revision_no' => $revNo,
            'generated_at' => $generatedAt->toISOString(),
        ];
    }

    private function normalizeFormPrefix(string $prefix, int $revisionNo): string
    {
        $prefix = trim($prefix);

        // Ensure it ends with "."
        if (!str_ends_with($prefix, '.')) {
            $prefix .= '.';
        }

        // If prefix already has "RevXX." anywhere, keep it as-is.
        // This supports current seeded prefixes like "...Rev00." / "...Rev02."
        if (stripos($prefix, 'Rev') !== false) {
            return $prefix;
        }

        $rev = str_pad((string) $revisionNo, 2, '0', STR_PAD_LEFT);
        return $prefix . "Rev{$rev}.";
    }
}