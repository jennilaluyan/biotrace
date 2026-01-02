<?php

namespace App\Support;

final class SampleTestStatusTransitions
{
    /**
     * Allowed transitions untuk Analyst (Operator/Analyst):
     * draft -> in_progress -> measured
     * in_progress -> failed
     */
    public static function allowedForAnalyst(): array
    {
        return [
            'draft'       => ['in_progress'],
            'in_progress' => ['measured', 'failed'],
            // measured/verified/validated locked dari Analyst update
        ];
    }

    public static function isAllowedForAnalyst(string $from, string $to): bool
    {
        $map = self::allowedForAnalyst();
        return isset($map[$from]) && in_array($to, $map[$from], true);
    }
}
