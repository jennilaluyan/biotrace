<?php

namespace Tests\Unit;

use Tests\TestCase;

class CoaTemplateViewsTest extends TestCase
{
    public function test_institution_v1_view_compiles(): void
    {
        $html = view('reports.coa.institution_v1', $this->fakePayload())->render();

        $this->assertStringContainsString('SERTIFIKAT HASIL PENGUJIAN', $html);
        $this->assertStringContainsString('Nama Institusi', $html);
        $this->assertStringContainsString('ORF1b', $html);
    }

    public function test_institution_v2_view_compiles(): void
    {
        $html = view('reports.coa.institution_v2', $this->fakePayload())->render();

        $this->assertStringContainsString('WGS', $html);
        $this->assertStringContainsString('Lineage', $html);
    }

    public function test_individual_view_compiles(): void
    {
        $payload = $this->fakePayload();
        $payload['client']['type'] = 'individual';

        $html = view('reports.coa.individual', $payload)->render();

        $this->assertStringContainsString('Nama Pelanggan', $html);
        $this->assertStringContainsString('Kode Sampel Lab', $html);
    }

    private function fakePayload(): array
    {
        return [
            'lab' => [
                'address' => 'Manado, Sulawesi Utara',
                'phone' => 'Telp: -',
                // 'logo_data_uri' => 'data:image/png;base64,...' // optional
            ],
            'report' => [
                'report_no' => '2026/000001/UNSRAT-BML',
                'template_code' => 'INST_V1',
            ],
            'client' => [
                'type' => 'institution',
                'name' => 'RS Contoh / Institusi Contoh',
            ],
            'sample' => [
                'sample_id' => 'SMP-0001',
                'sample_type' => 'Swab',
                'received_at' => now(),
            ],
            'items' => [
                ['parameter_name' => 'ORF1b', 'result_value' => '28.1', 'unit_label' => 'Ct'],
                ['parameter_name' => 'RdRp',  'result_value' => '27.9', 'unit_label' => 'Ct'],
                ['parameter_name' => 'RPP30', 'result_value' => '24.0', 'unit_label' => 'Ct'],
                ['parameter_name' => 'Lineage', 'result_value' => 'BA.2', 'unit_label' => ''],
                ['parameter_name' => 'Variant', 'result_value' => 'Omicron', 'unit_label' => ''],
            ],
            'overall_result' => 'POSITIF',
            'lab_head_name' => 'Nama Lab Head',
            'printed_at' => now(),
        ];
    }
}
