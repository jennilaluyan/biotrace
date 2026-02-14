<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DocumentTemplatesSeeder extends Seeder
{
    public function run(): void
    {
        $rows = [
            [
                'doc_code' => 'LOO_SURAT_PENGUJIAN',
                'title' => 'LOO / Surat Perintah Pengujian Sampel',
                'record_no_prefix' => 'REK/LAB-BM/TKS/32/',
                'form_code_prefix' => 'FORM/LAB-BM/TKS/32.Rev00.',
                'revision_no' => 0,
            ],
            [
                'doc_code' => 'REAGENT_REQUEST',
                'title' => 'Reagent Request',
                'record_no_prefix' => 'REK/LAB-BM/TKS/11/',
                'form_code_prefix' => 'FORM/LAB-BM/TKS/11.Rev00.',
                'revision_no' => 0,
            ],
            [
                'doc_code' => 'COA_PCR_MANDIRI',
                'title' => 'COA PCR Mandiri',
                'record_no_prefix' => 'RevREK/LAB-BM/ADM/02/',
                'form_code_prefix' => 'FORM/LAB-BM/ADM/16.Rev02.',
                'revision_no' => 2,
            ],
            [
                'doc_code' => 'COA_PCR_KERJASAMA',
                'title' => 'COA PCR Kerja Sama',
                'record_no_prefix' => 'RevREK/LAB-BM/ADM/02/',
                'form_code_prefix' => 'FORM/LAB-BM/ADM/16.Rev02.',
                'revision_no' => 2,
            ],
            [
                'doc_code' => 'COA_WGS',
                'title' => 'COA WGS',
                'record_no_prefix' => 'RevREK/LAB-BM/ADM/16/',
                'form_code_prefix' => 'FORM/LAB-BM/ADM/16.Rev02.',
                'revision_no' => 2,
            ],
        ];

        foreach ($rows as $r) {
            DB::table('documents')->updateOrInsert(
                ['doc_code' => $r['doc_code']],
                [
                    'title' => $r['title'],
                    'path' => '__templates__/' . $r['doc_code'], // wajib karena documents.path NOT NULL
                    'visible_to_role' => 'ADMIN', // biar tidak “nyampah” di document repository umum
                    'version_current_id' => null,
                    'kind' => 'template',
                    'record_no_prefix' => $r['record_no_prefix'],
                    'form_code_prefix' => $r['form_code_prefix'],
                    'revision_no' => $r['revision_no'],
                    'is_active' => true,
                    'updated_at' => now(),
                ]
            );
        }
    }
}