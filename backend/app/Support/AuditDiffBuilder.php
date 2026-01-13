<?php

namespace App\Support;

class AuditDiffBuilder
{
    /**
     * Build normalized diff:
     * [
     *   field => ['old' => x, 'new' => y]
     * ]
     */
    public static function fromArrays(array $old = [], array $new = []): array
    {
        $diff = [];

        $keys = array_unique(array_merge(
            array_keys($old),
            array_keys($new)
        ));

        foreach ($keys as $key) {
            $oldVal = $old[$key] ?? null;
            $newVal = $new[$key] ?? null;

            if ($oldVal !== $newVal) {
                $diff[$key] = [
                    'old' => $oldVal,
                    'new' => $newVal,
                ];
            }
        }

        return $diff;
    }
}
