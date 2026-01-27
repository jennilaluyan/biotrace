<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

class LabSampleCode
{
    /**
     * Generate next lab sample code in format: BML-001, BML-002, ...
     *
     * Prefers PostgreSQL sequence `lab_sample_code_seq` (concurrency-safe).
     * Falls back to scanning existing codes if not pgsql.
     */
    public static function next(string $prefix = 'BML', int $pad = 3): string
    {
        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            $row = DB::selectOne("SELECT nextval('lab_sample_code_seq') AS v");
            $n = (int) ($row->v ?? 0);
            if ($n <= 0) $n = 1;

            return sprintf('%s-%0' . $pad . 'd', $prefix, $n);
        }

        // Fallback (non-pgsql): derive next number from existing records.
        // Not as concurrency-safe as sequence, but still reasonable for dev.
        $lastNum = 0;

        $q = DB::table('samples')
            ->whereNotNull('lab_sample_code')
            ->where('lab_sample_code', 'like', $prefix . '-%');

        if ($driver === 'mysql') {
            $row = $q->orderByRaw("CAST(SUBSTRING_INDEX(lab_sample_code,'-',-1) AS UNSIGNED) DESC")->first();
        } elseif ($driver === 'sqlite') {
            $row = $q->orderByRaw("CAST(substr(lab_sample_code, instr(lab_sample_code,'-')+1) AS INTEGER) DESC")->first();
        } else {
            // Generic: lexical desc (works OK for pad==3 under 999)
            $row = $q->orderByDesc('lab_sample_code')->first();
        }

        if ($row && isset($row->lab_sample_code)) {
            $raw = (string) $row->lab_sample_code;
            if (preg_match('/^' . preg_quote($prefix, '/') . '\-(\d+)$/', $raw, $m)) {
                $lastNum = (int) $m[1];
            }
        }

        $next = max(1, $lastNum + 1);
        return sprintf('%s-%0' . $pad . 'd', $prefix, $next);
    }
}