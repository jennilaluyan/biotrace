<?php

namespace App\Support;

use App\Enums\WorkflowGroup;

final class WorkflowGroupResolver
{
    private const RANGE_PCR = [1, 11];
    private const RANGE_WGS = [12, 17];
    private const RANGE_ANTIGEN = [18, 18];
    private const RANGE_19_22 = [19, 22];
    private const RANGE_23_32 = [23, 32];

    public static function resolveFromParameterIds(array $parameterIds): ?WorkflowGroup
    {
        $ids = self::normalizeIds($parameterIds);
        if (count($ids) === 0) return null;

        $hasWgs = self::anyInRange($ids, self::RANGE_WGS);
        $hasPcr = self::anyInRange($ids, self::RANGE_PCR);
        $hasAntigen = self::anyInRange($ids, self::RANGE_ANTIGEN);
        $has23  = self::anyInRange($ids, self::RANGE_23_32);
        $has19  = self::anyInRange($ids, self::RANGE_19_22);

        if ($hasWgs) return WorkflowGroup::WGS_SARS_COV_2;
        if ($hasPcr) return WorkflowGroup::PCR_SARS_COV_2;
        if ($hasAntigen) return WorkflowGroup::ANTIGEN;
        if ($has23)  return WorkflowGroup::GROUP_23_32;
        if ($has19)  return WorkflowGroup::GROUP_19_22;

        return null;
    }

    /**
     * Normalize mixed array into unique ints.
     *
     * @param  array<int, int|string|null> $parameterIds
     * @return array<int, int>
     */
    private static function normalizeIds(array $parameterIds): array
    {
        $ids = [];
        foreach ($parameterIds as $raw) {
            if ($raw === null) continue;
            if (is_string($raw)) $raw = trim($raw);
            if ($raw === '' || $raw === false) continue;

            $n = (int) $raw;
            if ($n <= 0) continue;

            $ids[$n] = $n; // unique by key
        }
        return array_values($ids);
    }

    /**
     * @param array<int,int> $ids
     * @param array{0:int,1:int} $range
     */
    private static function anyInRange(array $ids, array $range): bool
    {
        [$min, $max] = $range;
        foreach ($ids as $id) {
            if ($id >= $min && $id <= $max) return true;
        }
        return false;
    }
}