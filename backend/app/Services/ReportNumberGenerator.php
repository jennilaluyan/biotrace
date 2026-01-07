<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class ReportNumberGenerator
{
    public const COUNTER_KEY = 'REPORT_NO';

    private string $labCode;

    public function __construct(string $labCode = 'UNSRAT-BML')
    {
        $this->labCode = $labCode;
    }

    /**
     * Generate report number format:
     *   YYYY/SEQ/UNSRAT-BML
     *
     * SEQ increments globally (never reset).
     */
    public function next(): string
    {
        $year = (string) now()->format('Y');

        return DB::transaction(function () use ($year) {
            // lock counter row
            $row = DB::table('report_counters')
                ->where('counter_key', self::COUNTER_KEY)
                ->lockForUpdate()
                ->first();

            if (!$row) {
                // should not happen because migration inserts the row
                throw new RuntimeException('Report counter row not found.');
            }

            $seq = (int) $row->next_seq;

            // increment for next time
            DB::table('report_counters')
                ->where('counter_key', self::COUNTER_KEY)
                ->update([
                    'next_seq' => $seq + 1,
                    'updated_at' => now(),
                ]);

            // Seq representation: keep it readable; 6-digit pad is common and stable
            // Example: 2026/000001/UNSRAT-BML
            $seqPadded = Str::padLeft((string) $seq, 6, '0');

            return "{$year}/{$seqPadded}/{$this->labCode}";
        }, 3); // retry 3 times on deadlock
    }
}
