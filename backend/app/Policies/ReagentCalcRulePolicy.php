<?php

namespace App\Policies;

use App\Models\User;
use App\Models\ReagentCalcRule;

class ReagentCalcRulePolicy
{
    public function viewAny(User $user): bool
    {
        return $this->canRead($user);
    }

    public function view(User $user, ReagentCalcRule $rule): bool
    {
        return $this->canRead($user);
    }

    public function create(User $user): bool
    {
        return $this->canManage($user);
    }

    public function update(User $user, ReagentCalcRule $rule): bool
    {
        return $this->canManage($user);
    }

    public function delete(User $user, ReagentCalcRule $rule): bool
    {
        return $this->canManage($user);
    }

    private function canRead(User $user): bool
    {
        $roleName = optional($user->role)->name;
        return in_array($roleName, ['Admin', 'QA', 'Operator', 'Analyst', 'OM', 'LH'], true);
    }

    private function canManage(User $user): bool
    {
        $roleName = optional($user->role)->name;
        return in_array($roleName, ['Admin', 'QA'], true);
    }
}