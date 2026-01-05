<?php

namespace App\Services;

use App\Models\QcControl;
use App\Models\QcRun;
use Illuminate\Support\Facades\DB;

class QcEvaluationService
{
    /**
     * Evaluate one QC run (Westgard) and return:
     * - z_score
     * - violations[]
     * - status: pass|warning|fail
     * Also can evaluate R-4s if there are at least 2 control-material runs in same batch.
     */
    public function evaluateAndPersist(int $batchId, int $qcControlId, float $value, int $actorStaffId): QcRun
    {
        return DB::transaction(function () use ($batchId, $qcControlId, $value, $actorStaffId) {
            /** @var QcControl $control */
            $control = QcControl::query()
                ->select(['qc_control_id', 'target', 'tolerance', 'ruleset', 'control_type', 'is_active'])
                ->where('qc_control_id', $qcControlId)
                ->firstOrFail();

            $ruleset = is_array($control->ruleset) ? $control->ruleset : [];
            $violations = [];

            // Compute z-score only if target & tolerance exist and tolerance != 0
            $z = null;
            if ($control->target !== null && $control->tolerance !== null) {
                $tol = (float) $control->tolerance;
                if ($tol != 0.0) {
                    $z = ((float) $value - (float) $control->target) / $tol;
                }
            }

            // 1-2s (warning), 1-3s (fail)
            if ($z !== null) {
                $absZ = abs($z);

                if (in_array('1-3s', $ruleset, true) && $absZ > 3.0) {
                    $violations[] = '1-3s';
                } elseif (in_array('1-2s', $ruleset, true) && $absZ > 2.0) {
                    $violations[] = '1-2s';
                }
            }

            // Default status
            $status = 'pass';
            if (in_array('1-3s', $violations, true)) {
                $status = 'fail';
            } elseif (in_array('1-2s', $violations, true)) {
                $status = 'warning';
            }

            // Save the run (without R-4s first)
            $run = QcRun::query()->create([
                'batch_id' => $batchId,
                'qc_control_id' => $qcControlId,
                'value' => $value,
                'z_score' => $z,
                'violations' => $violations,
                'status' => $status,
                'created_by' => $actorStaffId,
            ]);

            // R-4s: needs at least 2 control-material runs in same batch.
            // We'll evaluate based on the latest 2 z-scores for control_material only.
            if (in_array('R-4s', $ruleset, true) && $control->control_type === 'control_material') {
                $this->evaluateR4sForBatch($batchId);
            }

            return $run->fresh();
        });
    }

    /**
     * Evaluate R-4s for the batch: if any pair of latest 2 z-scores differs by > 4 => fail.
     * This updates the latest runs' violations/status only (keeps it bounded).
     */
    private function evaluateR4sForBatch(int $batchId): void
    {
        // Get latest 2 control-material runs with z_score not null
        $runs = QcRun::query()
            ->select(['qc_run_id', 'qc_control_id', 'z_score', 'violations', 'status'])
            ->where('batch_id', $batchId)
            ->whereNotNull('z_score')
            ->whereIn('qc_control_id', function ($q) {
                $q->select('qc_control_id')
                    ->from('qc_controls')
                    ->where('control_type', 'control_material');
            })
            ->orderByDesc('qc_run_id')
            ->limit(2)
            ->get();

        if ($runs->count() < 2) {
            return;
        }

        $z1 = (float) $runs[0]->z_score;
        $z2 = (float) $runs[1]->z_score;
        $diff = abs($z1 - $z2);

        if ($diff <= 4.0) {
            return;
        }

        // Mark both runs with R-4s violation + fail
        foreach ($runs as $r) {
            $v = is_array($r->violations) ? $r->violations : [];
            if (!in_array('R-4s', $v, true)) {
                $v[] = 'R-4s';
            }

            $r->violations = $v;
            $r->status = 'fail';
            $r->save();
        }
    }

    /**
     * Summarize batch QC status: fail > warning > pass
     */
    public function summarizeBatch(int $batchId): array
    {
        $counts = QcRun::query()
            ->selectRaw("status, COUNT(*) as c")
            ->where('batch_id', $batchId)
            ->groupBy('status')
            ->pluck('c', 'status')
            ->toArray();

        $status = 'pass';
        if (!empty($counts['fail'])) {
            $status = 'fail';
        } elseif (!empty($counts['warning'])) {
            $status = 'warning';
        }

        return [
            'batch_id' => $batchId,
            'status' => $status,
            'counts' => [
                'pass' => (int) ($counts['pass'] ?? 0),
                'warning' => (int) ($counts['warning'] ?? 0),
                'fail' => (int) ($counts['fail'] ?? 0),
            ],
        ];
    }
}
