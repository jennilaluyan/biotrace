<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use RuntimeException;

class LabSampleCodeGenerator
{
    public function nextCode(): string
    {
        if (DB::getDriverName() !== 'pgsql') {
            // fallback paling aman untuk non-pgsql (prototype)
            // tapi kamu pakai pgsql, jadi ini jarang kepakai.
            $n = (int) (microtime(true) * 1000) % 100000;
            return 'BML-' . str_pad((string) $n, 3, '0', STR_PAD_LEFT);
        }

        $row = DB::selectOne("SELECT nextval('lab_sample_code_seq') AS v");
        $v = (int) ($row->v ?? 0);

        if ($v <= 0) {
            throw new RuntimeException('Failed to generate lab sample code sequence value.');
        }

        return 'BML-' . str_pad((string) $v, 3, '0', STR_PAD_LEFT);
    }
}
