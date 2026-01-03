<?php

namespace App\Services;

class ReagentCalcFormulaEvaluator
{
    public function compute(array $formula, array $vars): float
    {
        $type = $formula['type'] ?? null;

        return match ($type) {
            'fixed' => (float) ($formula['value'] ?? 0),

            'per_test_volume' => (float) ($formula['value'] ?? 0) * (int)($vars['runs'] ?? 1),

            'dilution_volume' => (float)($formula['aliquot'] ?? 0)
                * (float)($formula['dilution_factor'] ?? 1)
                * (int)($vars['runs'] ?? 1),

            // Disabled in v1 for safety (no eval, no extra deps)
            'expression' => 0.0,

            default => 0.0,
        };
    }
}