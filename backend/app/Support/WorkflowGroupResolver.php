<?php

namespace App\Support;

use App\Enums\WorkflowGroup;

final class WorkflowGroupResolver
{
    private const RANGE_PCR = [1, 11];
    private const RANGE_SEQUENCING = [12, 17];
    private const RANGE_RAPID = [18, 19];
    private const RANGE_MICROBIOLOGY = [20, 32];

    public static function resolveFromParameterIds(array $parameterIds): ?WorkflowGroup
    {
        $ids = self::normalizeIds($parameterIds);
        if (count($ids) === 0) return null;

        $hasSequencing = self::anyInRange($ids, self::RANGE_SEQUENCING);
        $hasPcr = self::anyInRange($ids, self::RANGE_PCR);
        $hasMicro = self::anyInRange($ids, self::RANGE_MICROBIOLOGY);
        $hasRapid = self::anyInRange($ids, self::RANGE_RAPID);

        // Priority: sequencing > pcr > microbiology > rapid
        if ($hasSequencing) return WorkflowGroup::SEQUENCING;
        if ($hasPcr) return WorkflowGroup::PCR;
        if ($hasMicro) return WorkflowGroup::MICROBIOLOGY;
        if ($hasRapid) return WorkflowGroup::RAPID;

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
