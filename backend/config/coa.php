<?php

return [
    // Kode lab untuk nomor laporan / identitas dokumen
    'lab_code' => env('LAB_CODE', 'UNSRAT-BML'),

    // Storage lokasi PDF yang digenerate
    'storage_disk' => env('COA_STORAGE_DISK', 'local'),
    'storage_path' => env('COA_STORAGE_PATH', 'reports/coa'),

    /**
     * 3 template:
     * - 2 untuk institusi (dipilih manual via UI nantinya)
     * - 1 untuk individu (auto)
     */
    'templates' => [
        'institution_v1' => [
            'label' => 'CoA Institusi (Versi 1)',
            'client_type' => 'institution',
            'view' => 'reports.coa.institution_v1',
        ],
        'institution_v2' => [
            'label' => 'CoA Institusi (Versi 2)',
            'client_type' => 'institution',
            'view' => 'reports.coa.institution_v2',
        ],
        'individual' => [
            'label' => 'CoA Individu',
            'client_type' => 'individual',
            'view' => 'reports.coa.individual',
        ],
    ],

    // Default otomatis berdasarkan jenis client
    'default_template_by_client_type' => [
        'institution' => 'institution_v1',
        'individual' => 'individual',
    ],

    /**
     * Gate rules (kita akan enforce di step service/controller):
     * - Sample status harus "validated"
     * - Semua SampleTest status "validated"
     * - QC harus pass (field qc_done true)
     * - Setelah report ditandatangani LH -> Sample jadi "reported"
     */
    'gating' => [
        'sample_status_must_be' => 'validated',
        'sample_tests_status_must_be' => 'validated',

        'require_qc_pass' => true,
        'qc_field' => 'qc_done',
        'qc_pass_value' => true,

        // Role signature yang wajib untuk finalisasi CoA
        'required_signature_role_code' => 'LH',
    ],
];
