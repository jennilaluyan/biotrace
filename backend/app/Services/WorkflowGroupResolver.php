<?php

namespace App\Services;

use App\Enums\WorkflowGroup;
use App\Models\Parameter;
use App\Support\WorkflowGroupResolver as SupportWorkflowGroupResolver;

final class WorkflowGroupResolver
{
    /**
     * @param array<int, int|string|null> $parameterIds
     */
    public function resolveFromParameterIds(array $parameterIds): ?WorkflowGroup
    {
        $ids = $this->normalizeIds($parameterIds);
        if (count($ids) === 0) return null;

        $params = Parameter::query()
            ->whereIn('parameter_id', $ids)
            ->get(['parameter_id', 'workflow_group', 'catalog_no', 'code']);

        $groups = [];      // explicit (from parameters.workflow_group)
        $catalogNos = [];  // fallback (legacy P01..P32)

        foreach ($params as $p) {
            $wgRaw = strtolower(trim((string) ($p->workflow_group ?? '')));
            if ($wgRaw !== '') {
                $wg = WorkflowGroup::tryFrom($wgRaw);
                if ($wg) {
                    $groups[$wg->value] = $wg;
                    continue;
                }
            }

            // legacy fallback
            $no = $p->catalog_no;
            if (!$no) {
                $no = $this->inferCatalogNoFromCode((string) $p->code);
            }
            if ($no && $no > 0) {
                $catalogNos[] = (int) $no;
            }
        }

        // Merge fallback-derived group (keeps same priority behavior)
        if (!empty($catalogNos)) {
            $fromCatalog = SupportWorkflowGroupResolver::resolveFromParameterIds($catalogNos);
            if ($fromCatalog) {
                $groups[$fromCatalog->value] = $fromCatalog;
            }
        }

        if (empty($groups)) return null;

        // Priority: sequencing > pcr > microbiology > rapid
        if (isset($groups[WorkflowGroup::SEQUENCING->value])) return WorkflowGroup::SEQUENCING;
        if (isset($groups[WorkflowGroup::PCR->value])) return WorkflowGroup::PCR;
        if (isset($groups[WorkflowGroup::MICROBIOLOGY->value])) return WorkflowGroup::MICROBIOLOGY;
        if (isset($groups[WorkflowGroup::RAPID->value])) return WorkflowGroup::RAPID;

        return null;
    }

    /**
     * @param array<int, int|string|null> $raw
     * @return array<int,int>
     */
    private function normalizeIds(array $raw): array
    {
        $out = [];
        foreach ($raw as $v) {
            if ($v === null) continue;
            if (is_string($v)) $v = trim($v);
            if ($v === '' || $v === false) continue;
            $n = (int) $v;
            if ($n > 0) $out[$n] = $n;
        }
        return array_values($out);
    }

    private function inferCatalogNoFromCode(string $code): ?int
    {
        $code = trim($code);

        // P01..P32
        if (preg_match('/^P(\d{2})$/i', $code, $m)) {
            return (int) $m[1];
        }

        // BM-001..BM-032 (legacy)
        if (preg_match('/^BM-(\d{3})$/i', $code, $m)) {
            return (int) $m[1];
        }

        return null;
    }
}