<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CoaPdfService
{
    /**
     * Resolve final COA blade view + normalized template code.
     *
     * Rules:
     * - WGS (workflow_group contains 'wgs') => reports.coa.wgs
     * - Institution client => reports.coa.institution
     * - else => reports.coa.individual
     *
     * Override template code (optional) can force mapping but still respects WGS priority.
     */
    public function resolveView(int $reportId, ?string $overrideTemplateCode = null): array
    {
        $report = DB::table('reports')->where('report_id', $reportId)->first();
        if (!$report) {
            throw new \RuntimeException("Report {$reportId} not found.");
        }

        $sample = DB::table('samples')->where('sample_id', $report->sample_id)->first();

        // client type (individual / institution)
        $clientType = 'individual';
        if ($sample && isset($sample->client_id) && $sample->client_id) {
            $clientType = (string) (DB::table('clients')->where('client_id', $sample->client_id)->value('type') ?: 'individual');
        }

        // workflow group -> wgs?
        $workflowGroup = $sample?->workflow_group ?? null;
        $group = strtolower(trim((string) $workflowGroup));
        $isWgs = $group !== '' && str_contains($group, 'wgs');

        // normalize template override / stored template_code
        $rawTemplate = $overrideTemplateCode;
        if (!$rawTemplate && Schema::hasColumn('reports', 'template_code')) {
            $rawTemplate = (string) ($report->template_code ?? '');
        }
        $normalized = strtoupper(trim((string) $rawTemplate));

        // choose final template
        $finalTemplate = 'INDIVIDUAL';

        // WGS always wins (by workflow group)
        if ($isWgs || $normalized === 'WGS') {
            $finalTemplate = 'WGS';
        } elseif ($clientType === 'institution' || $normalized === 'INSTITUTION' || str_contains($normalized, 'INST')) {
            // legacy INST_* treated as INSTITUTION
            $finalTemplate = 'INSTITUTION';
        } else {
            $finalTemplate = 'INDIVIDUAL';
        }

        // map to blade view
        $view = match ($finalTemplate) {
            'WGS' => 'reports.coa.wgs',
            'INSTITUTION' => 'reports.coa.institution',
            default => 'reports.coa.individual',
        };

        return [
            'template_code' => $finalTemplate,
            'view' => $view,
            'is_wgs' => $isWgs,
            'client_type' => $clientType,
        ];
    }
}
