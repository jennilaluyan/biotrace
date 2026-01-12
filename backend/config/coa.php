<?php

return [
    // Kode lab untuk nomor laporan / identitas dokumen
    'lab_code' => env('LAB_CODE', 'UNSRAT-BML'),

    /**
     * Context mapping (NO assumptions hardcoded in code)
     */
    'access' => [
        // Default LH role_id (ubah lewat .env kalau ternyata beda)
        'lab_head_role_id' => (int) env('COA_LH_ROLE_ID', 6),
    ],

    'client_type' => [
        // Field di table clients untuk menentukan jenis client
        'field' => env('COA_CLIENT_TYPE_FIELD', 'type'),

        // value yang dianggap INSTITUSI
        'institution_values' => array_filter(array_map('trim', explode(',', env('COA_INSTITUTION_VALUES', 'institution,institusi,instansi,company')))),

        // value yang dianggap INDIVIDU
        'individual_values' => array_filter(array_map('trim', explode(',', env('COA_INDIVIDUAL_VALUES', 'individual,individu,personal')))),
    ],

    /**
     * LH signature resolver:
     * Kita tidak asumsi fieldnya apa; kita coba beberapa kandidat.
     * Nanti Step 6 kita pakai resolver ini untuk inject ttd ke PDF.
     */
    'lab_head_signature' => [
        // Field-field yang akan dicoba di model staff/user (urut prioritas)
        'candidate_fields' => array_filter(array_map('trim', explode(',', env(
            'COA_SIGNATURE_FIELDS',
            'signature_path,signature_url,signature_image,signature,ttd_path,ttd_url'
        )))),

        // Kalau signature disimpan sebagai file path, disk yang dipakai untuk baca file
        'disk' => env('COA_SIGNATURE_DISK', 'public'),

        // Kalau signature disimpan base64 (data URI), kita akan decode saat generate PDF (Step 6)
        'allow_base64' => (bool) env('COA_SIGNATURE_ALLOW_BASE64', true),
    ],

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
