<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class CoaViewDataBuilder
{
    public function build(int $reportId, string $lhSignatureDataUri, int $actorStaffId): array
    {
        // IMPORTANT: return as objects for blades using -> (client->name, sample->sample_id, report->test_date, etc)
        $report = DB::table('reports')->where('report_id', $reportId)->first();
        if (!$report) {
            throw new \RuntimeException("Report {$reportId} not found.");
        }

        $sample = DB::table('samples')->where('sample_id', $report->sample_id)->first();
        if (!$sample) {
            throw new \RuntimeException("Sample {$report->sample_id} not found for report {$reportId}.");
        }

        $client = null;
        if (!empty($sample->client_id)) {
            $client = DB::table('clients')->where('client_id', $sample->client_id)->first();
        }
        if (!$client) {
            // safe fallback object
            $client = (object) [
                'name' => '',
                'phone' => '',
                'type' => 'individual',
            ];
        }

        // raw report_items (arrays)
        $rawItems = DB::table('report_items')
            ->where('report_id', $reportId)
            ->orderBy('order_no')
            ->orderBy('report_item_id')
            ->get()
            ->map(fn($r) => (array) $r)
            ->all();

        // detect WGS by workflow group
        $group = strtolower(trim((string) ($sample->workflow_group ?? '')));
        $isWgs = $group !== '' && str_contains($group, 'wgs');

        // build template-ready "items" for institution / wgs blades
        $items = [];
        if ($isWgs) {
            $items = $this->buildWgsItems($sample, $client, $rawItems);
        } elseif (($client->type ?? 'individual') === 'institution') {
            $items = $this->buildInstitutionItems($sample, $client, $rawItems, $report);
        }

        // ensure individual blade fields exist on $report (orf1b/rdrp/rpp30/result/test_date)
        $this->hydrateReportForIndividualBlade($report, $rawItems);

        // signer (LH)
        $lh = DB::table('staffs')->where('staff_id', $actorStaffId)->first();
        if (!$lh) {
            $lh = (object) ['staff_id' => $actorStaffId, 'name' => ''];
        }

        return [
            'report' => $report,
            'sample' => $sample,
            'client' => $client,

            // template-ready rows for institution/wgs blades
            'items' => $items,

            // keep raw detail available (harmless if not used by blade)
            'report_items' => $rawItems,

            // blades use qr_data_uri; wgs can use lh_signature_data_uri too
            'qr_data_uri' => $lhSignatureDataUri,
            'lh_signature_data_uri' => $lhSignatureDataUri,

            'lh' => $lh,
            'signed_at' => now(),
        ];
    }

    private function hydrateReportForIndividualBlade(object $report, array $rawItems): void
    {
        // gene values from report_items (parameter_name -> result_value)
        $orf1b = $this->pickFirstValueByNeedles($rawItems, ['orf1b']);
        $rdrp  = $this->pickFirstValueByNeedles($rawItems, ['rdrp', 'rd-rp', 'rd rp']);
        $rpp30 = $this->pickFirstValueByNeedles($rawItems, ['rpp30']);

        // result/conclusion fallback
        $result = null;

        // if report already has "result" column, prefer it
        if (property_exists($report, 'result') && $report->result !== null && $report->result !== '') {
            $result = (string) $report->result;
        } else {
            // try find a report_item that looks like conclusion/result
            $result = $this->pickFirstValueByNeedles($rawItems, ['hasil', 'result', 'kesimpulan', 'conclusion'])
                ?? $this->pickFirstInterpretation($rawItems);
        }

        // test_date fallback (use first tested_at if missing)
        if (!property_exists($report, 'test_date') || empty($report->test_date)) {
            $firstTestedAt = $this->pickFirstTestedAt($rawItems);
            if ($firstTestedAt) {
                $report->test_date = $firstTestedAt;
            }
        }

        // attach dynamic props for blade compatibility
        if (!property_exists($report, 'orf1b')) $report->orf1b = $orf1b;
        if (!property_exists($report, 'rdrp'))  $report->rdrp  = $rdrp;
        if (!property_exists($report, 'rpp30')) $report->rpp30 = $rpp30;
        if (!property_exists($report, 'result')) $report->result = $result;

        // even if properties exist but empty, still fill
        if (empty($report->orf1b)) $report->orf1b = $orf1b;
        if (empty($report->rdrp))  $report->rdrp  = $rdrp;
        if (empty($report->rpp30)) $report->rpp30 = $rpp30;
        if (empty($report->result)) $report->result = $result;
    }

    private function buildInstitutionItems(object $sample, object $client, array $rawItems, object $report): array
    {
        $orf1b = $this->pickFirstValueByNeedles($rawItems, ['orf1b']);
        $rdrp  = $this->pickFirstValueByNeedles($rawItems, ['rdrp', 'rd-rp', 'rd rp']);
        $rpp30 = $this->pickFirstValueByNeedles($rawItems, ['rpp30']);

        $result = null;
        if (property_exists($report, 'result') && $report->result !== null && $report->result !== '') {
            $result = (string) $report->result;
        } else {
            $result = $this->pickFirstValueByNeedles($rawItems, ['hasil', 'result', 'kesimpulan', 'conclusion'])
                ?? $this->pickFirstInterpretation($rawItems);
        }

        // institution blade expects items[] rows with these keys
        return [[
            'client_name' => (string) ($client->name ?? ''),
            'sample_id' => (string) ($sample->sample_id ?? ''),
            'orf1b' => $orf1b,
            'rdrp' => $rdrp,
            'rpp30' => $rpp30,
            'result' => $result,
        ]];
    }

    private function buildWgsItems(object $sample, object $client, array $rawItems): array
    {
        $lineage = $this->pickFirstValueByNeedles($rawItems, ['lineage']);
        $variant = $this->pickFirstValueByNeedles($rawItems, ['variant', 'clade', 'mutasi']);

        return [[
            'client_name' => (string) ($client->name ?? ''),
            'sample_id' => (string) ($sample->sample_id ?? ''),
            'lineage' => $lineage,
            'variant' => $variant,
        ]];
    }

    private function pickFirstValueByNeedles(array $rawItems, array $needles): ?string
    {
        $needles = array_values(array_filter(array_map(fn($s) => strtolower(trim((string) $s)), $needles)));

        foreach ($rawItems as $it) {
            $name = strtolower(trim((string) ($it['parameter_name'] ?? '')));
            if ($name === '') continue;

            foreach ($needles as $n) {
                if ($n !== '' && str_contains($name, $n)) {
                    $v = $it['result_value'] ?? null;
                    if ($v === null || $v === '') {
                        $v = $it['interpretation'] ?? null;
                    }
                    if ($v !== null && $v !== '') {
                        return (string) $v;
                    }
                }
            }
        }

        return null;
    }

    private function pickFirstInterpretation(array $rawItems): ?string
    {
        foreach ($rawItems as $it) {
            $v = $it['interpretation'] ?? null;
            if ($v !== null && $v !== '') {
                return (string) $v;
            }
        }
        return null;
    }

    private function pickFirstTestedAt(array $rawItems): ?string
    {
        foreach ($rawItems as $it) {
            $v = $it['tested_at'] ?? null;
            if ($v !== null && $v !== '') {
                // keep as stored string (blade prints it)
                return (string) $v;
            }
        }
        return null;
    }
}
