<?php

namespace App\Services;

use App\Models\ReagentCalcRule;

class ReagentCalcRuleResolver
{
    public function resolve(?int $methodId, ?int $parameterId): ?ReagentCalcRule
    {
        // 1) method + parameter
        if ($methodId && $parameterId) {
            $rule = ReagentCalcRule::query()
                ->where('is_active', true)
                ->where('method_id', $methodId)
                ->where('parameter_id', $parameterId)
                ->orderByDesc('rule_id')
                ->first();

            if ($rule) return $rule;
        }

        // 2) method only
        if ($methodId) {
            $rule = ReagentCalcRule::query()
                ->where('is_active', true)
                ->where('method_id', $methodId)
                ->whereNull('parameter_id')
                ->orderByDesc('rule_id')
                ->first();

            if ($rule) return $rule;
        }

        // 3) parameter only
        if ($parameterId) {
            $rule = ReagentCalcRule::query()
                ->where('is_active', true)
                ->where('parameter_id', $parameterId)
                ->whereNull('method_id')
                ->orderByDesc('rule_id')
                ->first();

            if ($rule) return $rule;
        }

        return null;
    }
}