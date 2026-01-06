<?php

namespace App\Policies;

use App\Models\Staff;
use App\Models\SampleTest;

class SampleTestPolicy
{
    private function role(?Staff $user): ?string
    {
        return $user?->role?->name;
    }

    public function bulkCreate(Staff $user, \App\Models\Sample $sample): bool
    {
        return $this->role($user) === 'Analyst';
    }

    public function updateStatusAsAnalyst(Staff $user, SampleTest $test): bool
    {
        return $this->role($user) === 'Analyst';
    }

    // Step 9: OM decision
    public function decideAsOM(Staff $user, SampleTest $test): bool
    {
        return $this->role($user) === 'Operational Manager';
    }

    // Step 9: LH decision
    public function decideAsLH(Staff $user, SampleTest $test): bool
    {
        return $this->role($user) === 'Laboratory Head';
    }

    /**
     * OM can set Verified (alias of decideAsOM for clarity)
     */
    public function verifyAsOM(Staff $staff, SampleTest $sampleTest): bool
    {
        return $this->decideAsOM($staff, $sampleTest);
    }

    /**
     * LH can set Validated (alias of decideAsLH for clarity)
     */
    public function validateAsLH(Staff $staff, SampleTest $sampleTest): bool
    {
        return $this->decideAsLH($staff, $sampleTest);
    }
}
