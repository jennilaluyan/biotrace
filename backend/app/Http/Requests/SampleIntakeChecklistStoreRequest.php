<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SampleIntakeChecklistStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // role check di controller (tetap)
    }

    public function rules(): array
    {

        return [
            // accept either checks OR legacy checklist
            'checks' => ['nullable', 'array'],
            'checklist' => ['nullable', 'array'],

            /**
             * ✅ Backward compatible:
             * - 5 kategori lama tidak lagi "required", karena Step 5 pakai item detail.
             * - Kalau UI lama masih kirim 5 kategori, tetap diterima.
             */
            'checks.sample_physical_condition' => ['nullable', 'boolean'],
            'checks.volume' => ['nullable', 'boolean'],
            'checks.identity' => ['nullable', 'boolean'],
            'checks.packing' => ['nullable', 'boolean'],
            'checks.supporting_documents' => ['nullable', 'boolean'],

            /**
             * ✅ Step 5: item detail (wadah, label, tutup, packing, dokumen, dll)
             * Semua boolean, enforcement "wajib ada" tetap dilakukan di controller (biar fleksibel).
             */
            'checks.container_intact' => ['nullable', 'boolean'],          // wadah baik
            'checks.cap_sealed' => ['nullable', 'boolean'],                // tutup rapat / tersegel
            'checks.no_leakage' => ['nullable', 'boolean'],                // tidak bocor
            'checks.label_attached' => ['nullable', 'boolean'],            // label ada
            'checks.label_clear' => ['nullable', 'boolean'],               // label terbaca jelas
            'checks.label_matches_form' => ['nullable', 'boolean'],        // label sesuai form

            'checks.volume_sufficient' => ['nullable', 'boolean'],         // volume cukup
            'checks.vtm_present' => ['nullable', 'boolean'],               // VTM/media transport ada (kalau relevan)

            'checks.identity_complete' => ['nullable', 'boolean'],         // identitas lengkap (nama/NIK/ID)
            'checks.sample_type_matches' => ['nullable', 'boolean'],       // jenis sampel sesuai permintaan

            'checks.packaging_intact' => ['nullable', 'boolean'],          // packaging aman, tidak rusak
            'checks.triple_packaging' => ['nullable', 'boolean'],          // triple packaging (kalau SOP)
            'checks.temperature_condition_ok' => ['nullable', 'boolean'],  // kondisi suhu sesuai (cool box/ice pack)

            'checks.request_form_attached' => ['nullable', 'boolean'],     // form permintaan ada
            'checks.chain_of_custody_attached' => ['nullable', 'boolean'], // chain-of-custody ada (kalau dipakai)
            'checks.other_docs_complete' => ['nullable', 'boolean'],       // dokumen pendukung lain lengkap

            // legacy (fallback) – still allow boolean map if older UI sends it
            'checklist.*' => ['boolean'],

            // per-item notes (required if that item FAIL) – controller + validator after()
            'notes' => ['nullable', 'array'],

            // notes untuk kategori lama (kompatibilitas)
            'notes.sample_physical_condition' => ['nullable', 'string', 'max:500'],
            'notes.volume' => ['nullable', 'string', 'max:500'],
            'notes.identity' => ['nullable', 'string', 'max:500'],
            'notes.packing' => ['nullable', 'string', 'max:500'],
            'notes.supporting_documents' => ['nullable', 'string', 'max:500'],

            // notes untuk item detail
            'notes.container_intact' => ['nullable', 'string', 'max:500'],
            'notes.cap_sealed' => ['nullable', 'string', 'max:500'],
            'notes.no_leakage' => ['nullable', 'string', 'max:500'],
            'notes.label_attached' => ['nullable', 'string', 'max:500'],
            'notes.label_clear' => ['nullable', 'string', 'max:500'],
            'notes.label_matches_form' => ['nullable', 'string', 'max:500'],
            'notes.volume_sufficient' => ['nullable', 'string', 'max:500'],
            'notes.vtm_present' => ['nullable', 'string', 'max:500'],
            'notes.identity_complete' => ['nullable', 'string', 'max:500'],
            'notes.sample_type_matches' => ['nullable', 'string', 'max:500'],
            'notes.packaging_intact' => ['nullable', 'string', 'max:500'],
            'notes.triple_packaging' => ['nullable', 'string', 'max:500'],
            'notes.temperature_condition_ok' => ['nullable', 'string', 'max:500'],
            'notes.request_form_attached' => ['nullable', 'string', 'max:500'],
            'notes.chain_of_custody_attached' => ['nullable', 'string', 'max:500'],
            'notes.other_docs_complete' => ['nullable', 'string', 'max:500'],

            // general note
            'note' => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function withValidator($validator)
    {
        $validator->after(function ($v) {
            $data = $this->all();

            // If new payload used: enforce fail -> reason required
            $checks = $data['checks'] ?? null;
            if (is_array($checks)) {
                $notes = is_array($data['notes'] ?? null) ? $data['notes'] : [];

                $map = [
                    // kategori lama (kompatibilitas)
                    'sample_physical_condition',
                    'volume',
                    'identity',
                    'packing',
                    'supporting_documents',

                    // item detail (step 5)
                    'container_intact',
                    'cap_sealed',
                    'no_leakage',
                    'label_attached',
                    'label_clear',
                    'label_matches_form',
                    'volume_sufficient',
                    'vtm_present',
                    'identity_complete',
                    'sample_type_matches',
                    'packaging_intact',
                    'triple_packaging',
                    'temperature_condition_ok',
                    'request_form_attached',
                    'chain_of_custody_attached',
                    'other_docs_complete',
                ];

                foreach ($map as $k) {
                    if (!array_key_exists($k, $checks)) {
                        // required rules will catch, but keep safety
                        continue;
                    }
                    $passed = $checks[$k] === true;
                    if (!$passed) {
                        $reason = trim((string)($notes[$k] ?? ''));
                        if ($reason === '') {
                            $v->errors()->add("notes.$k", "Reason is required when '$k' is FAIL.");
                        }
                    }
                }
            }
        });
    }

    public function messages(): array
    {
        return [
            'checks.sample_physical_condition.required_without' => 'Sample Physical Condition is required.',
            'checks.volume.required_without' => 'Volume is required.',
            'checks.identity.required_without' => 'Identity is required.',
            'checks.packing.required_without' => 'Packing is required.',
            'checks.supporting_documents.required_without' => 'Supporting Documents is required.',
        ];
    }
}
