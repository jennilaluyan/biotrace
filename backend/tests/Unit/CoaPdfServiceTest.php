<?php

namespace Tests\Unit;

use App\Services\CoaPdfService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;

class CoaPdfServiceTest extends TestCase
{
    public function test_resolve_view_maps_keys_correctly(): void
    {
        $svc = app(CoaPdfService::class);

        $this->assertSame('reports.coa.individual', $svc->resolveView('individual'));
        $this->assertSame('reports.coa.institution_v1', $svc->resolveView('institution_v1'));
        $this->assertSame('reports.coa.institution_v2', $svc->resolveView('institution_v2'));
    }

    public function test_render_and_store_writes_pdf_to_disk(): void
    {
        // Pakai disk fake supaya tidak nulis beneran
        Storage::fake('local');

        $svc = app(\App\Services\CoaPdfService::class);

        // render beneran (real DOMPDF)
        $view = $svc->resolveView('individual');

        $binary = $svc->render($view, [
            // data minimal, blade kamu sudah pakai ?? '...'
            'client_name' => 'Test Client',
            'report_no' => 'RPT-0001',
            'items' => [],
        ]);

        // Pastikan hasilnya memang "PDF"
        $this->assertIsString($binary);
        $this->assertNotEmpty($binary);
        $this->assertStringStartsWith('%PDF', $binary);

        $path = $svc->buildPath('RPT-0001', 'individual');
        $svc->store($path, $binary);

        $this->assertTrue(Storage::disk('local')->exists($path));
        $this->assertStringStartsWith('%PDF', Storage::disk('local')->get($path));
    }
}
