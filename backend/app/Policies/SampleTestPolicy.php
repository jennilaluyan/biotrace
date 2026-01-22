<?php

namespace App\Policies;

use App\Models\Staff;
use App\Models\SampleTest;
use App\Models\LetterOfOrder;
use App\Models\Sample;
use Illuminate\Support\Facades\Schema;

class SampleTestPolicy
{
    private function role(?Staff $user): ?string
    {
        return $user?->role?->name;
    }

    public function bulkCreate(Staff $user, Sample $sample): bool
    {
        if ($this->role($user) !== 'Analyst') {
            return false;
        }

        // Kalau LoA table belum ada (env tertentu), jangan blok
        if (!Schema::hasTable('letters_of_order')) {
            return true;
        }

        $loaStatus = \App\Models\LetterOfOrder::query()
            ->where('sample_id', $sample->getAttribute('sample_id'))
            ->orderByDesc('lo_id')
            ->value('loa_status');

        return $loaStatus === 'locked';
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
