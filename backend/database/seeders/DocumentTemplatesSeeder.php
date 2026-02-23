<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class DocumentTemplatesSeeder extends Seeder
{
    public function run(): void
    {
        $now = Carbon::now();

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
            [
                'doc_code' => 'COA_ANTIGEN',
                'title' => 'COA Antigen',
                'record_no_prefix' => 'RevREK/LAB-BM/ADM/02/',
                'form_code_prefix' => 'FORM/LAB-BM/ADM/16.Rev02.',
                'revision_no' => 2,
            ],
            [
                'doc_code' => 'COA_GROUP_19_22',
                'title' => 'COA Parameters 19–22',
                'record_no_prefix' => 'RevREK/LAB-BM/ADM/02/',
                'form_code_prefix' => 'FORM/LAB-BM/ADM/16.Rev02.',
                'revision_no' => 2,
            ],
            [
                'doc_code' => 'COA_GROUP_23_32',
                'title' => 'COA Parameters 23–32',
                'record_no_prefix' => 'RevREK/LAB-BM/ADM/02/',
                'form_code_prefix' => 'FORM/LAB-BM/ADM/16.Rev02.',
                'revision_no' => 2,
            ],
        ];

        foreach ($rows as $r) {
            // ✅ PERBAIKAN: Gunakan 'template' agar lolos Check Constraint PostgreSQL
            // Doc Type dibedakan lewat 'doc_code', bukan 'kind'.
            $kind = 'template';

            // Path virtual sebagai penanda bahwa ini pakai Blade View default
            $virtualPath = '__templates__/' . $r['doc_code'];

            DB::table('documents')->updateOrInsert(
                ['doc_code' => $r['doc_code']],
                array_merge($r, [
                    'path' => $virtualPath,
                    'visible_to_role' => 'ADMIN',
                    'version_current_id' => null,
                    'kind' => $kind,
                    'is_active' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])
            );
        }
    }
}
