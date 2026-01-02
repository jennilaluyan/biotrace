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

    // Step 7: bulk create
    public function bulkCreate(Staff $user, \App\Models\Sample $sample): bool
    {
        $role = $user->role?->name;

        return in_array($role, ['Administrator', 'Operational Manager', 'Laboratory Head'], true);
    }

    // Step 8: analyst update status (nanti tetap divalidasi transition di controller/request)
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
}
