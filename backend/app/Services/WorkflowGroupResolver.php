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
            ->get(['parameter_id', 'catalog_no', 'code']);

        // Map to catalog_no (stable)
        $catalogNos = [];
        foreach ($params as $p) {
            $no = $p->catalog_no;

            // fallback: parse from code if catalog_no null
            if (!$no) {
                $no = $this->inferCatalogNoFromCode((string) $p->code);
            }

            if ($no && $no > 0) {
                $catalogNos[] = (int) $no;
            }
        }

        // ✅ Now resolve using the same support logic, but on catalog_no space (1..32)
        return SupportWorkflowGroupResolver::resolveFromParameterIds($catalogNos);
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
