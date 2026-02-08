<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class CoaViewDataBuilder
{
    public function build(int $reportId, string $lhSignatureDataUri, int $actorStaffId): array
    {
        $report = (array) DB::table('reports')->where('report_id', $reportId)->first();

        $sample = (array) DB::table('samples')
            ->join('reports', 'reports.sample_id', '=', 'samples.sample_id')
            ->where('reports.report_id', $reportId)
            ->select('samples.*')
            ->first();

        $client = [];
        if (!empty($sample['client_id'])) {
            $client = (array) DB::table('clients')
                ->where('client_id', $sample['client_id'])
                ->first();
        }

        $items = DB::table('report_items')
            ->where('report_id', $reportId)
            ->orderBy('report_item_id')
            ->get()
            ->map(fn($r) => (array) $r)
            ->all();

        $lh = (array) DB::table('staffs')->where('staff_id', $actorStaffId)->first();

        return [
            'report' => $report,
            'sample' => $sample,
            'client' => $client,
            'items' => $items,
            'lh_signature_data_uri' => $lhSignatureDataUri,
            'qr_data_uri' => $lhSignatureDataUri,
            'lh' => $lh,
            'signed_at' => now(),
        ];
    }
}
