<?php

namespace App\Services;

use App\Enums\WorkflowGroup;
use App\Support\WorkflowGroupResolver as SupportWorkflowGroupResolver;

final class WorkflowGroupResolver
{
    /**
     * @param  array<int, int|string|null> $parameterIds
     */
    public function resolveFromParameterIds(array $parameterIds): ?WorkflowGroup
    {
        return SupportWorkflowGroupResolver::resolveFromParameterIds($parameterIds);
    }
}
