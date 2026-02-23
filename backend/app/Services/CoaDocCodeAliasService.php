<?php

namespace App\Services;

class CoaDocCodeAliasService
{
    /**
     * Normalize various legacy / alias codes into canonical doc_code.
     *
     * Canonical:
     * - COA_PCR_MANDIRI
     * - COA_PCR_KERJASAMA
     * - COA_WGS
     */
    public function normalize(?string $raw): string
    {
        $s = strtolower(trim((string) ($raw ?? '')));
        if ($s === '') return 'COA_PCR_MANDIRI';

        // normalize separators
        $s = str_replace(['-', ' '], '_', $s);
        $s = preg_replace('/_+/', '_', $s) ?: $s;

        // --- WGS ---
        if (
            $s === 'wgs' ||
            str_contains($s, 'coa_wgs') ||
            str_contains($s, 'wgs')
        ) {
            return 'COA_WGS';
        }

        // --- PCR Kerja Sama (Institution) ---
        if (
            $s === 'institution' ||
            $s === 'institusi' ||
            $s === 'kerjasama' ||
            $s === 'kerja_sama' ||
            str_contains($s, 'institution') ||
            str_contains($s, 'institusi') ||
            str_contains($s, 'kerjasama') ||
            str_contains($s, 'kerja_sama') ||
            str_contains($s, 'pcr_kerjasama') ||
            str_contains($s, 'pcr_kerja_sama') ||
            str_contains($s, 'coa_pcr_kerjasama') ||
            str_contains($s, 'coa_pcr_kerja_sama')
        ) {
            return 'COA_PCR_KERJASAMA';
        }

        // --- PCR Mandiri (Individual) ---
        if (
            $s === 'individual' ||
            $s === 'mandiri' ||
            str_contains($s, 'individual') ||
            str_contains($s, 'mandiri') ||
            str_contains($s, 'pcr_mandiri') ||
            str_contains($s, 'coa_pcr_mandiri')
        ) {
            return 'COA_PCR_MANDIRI';
        }

        // already looks canonical
        if (preg_match('/^coa_(pcr_mandiri|pcr_kerjasama|pcr_kerja_sama|wgs)$/i', $s)) {
            return strtoupper($s);
        }
        if (preg_match('/^coa_(pcr_mandiri|pcr_kerjasama|pcr_kerja_sama|wgs)$/i', str_replace('__', '_', $s))) {
            return strtoupper(str_replace('__', '_', $s));
        }

        // --- ANTIGEN ---
        if ($s === 'antigen' || str_contains($s, 'coa_antigen') || str_contains($s, 'antigen')) {
            return 'COA_ANTIGEN';
        }

        // --- GROUP 19–22 ---
        if (
            $s === 'group_19_22' ||
            str_contains($s, 'group_19_22') ||
            str_contains($s, '19_22') ||
            str_contains($s, 'parameters_19_22')
        ) {
            return 'COA_GROUP_19_22';
        }

        // --- GROUP 23–32 ---
        if (
            $s === 'group_23_32' ||
            str_contains($s, 'group_23_32') ||
            str_contains($s, '23_32') ||
            str_contains($s, 'parameters_23_32')
        ) {
            return 'COA_GROUP_23_32';
        }

        // fallback: keep safe default
        return 'COA_PCR_MANDIRI';
    }

    /**
     * UI display label for canonical doc_code.
     */
    public function label(string $docCode): string
    {
        $dc = strtoupper(trim($docCode));

        return match ($dc) {
            'COA_WGS' => 'COA WGS',
            'COA_PCR_KERJASAMA' => 'COA PCR Kerja Sama',
            'COA_PCR_MANDIRI' => 'COA PCR Mandiri',
            'COA_ANTIGEN' => 'COA Antigen',
            'COA_GROUP_19_22' => 'COA Parameters 19–22',
            'COA_GROUP_23_32' => 'COA Parameters 23–32',
            default => 'COA',
        };
    }
}
