<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use RuntimeException;

class LoaNumberGenerator
{
    public function nextNumber(): string
    {
        if (DB::getDriverName() !== 'pgsql') {
            throw new RuntimeException('LoA number sequence requires PostgreSQL.');
        }

        $seq = (int) (DB::selectOne("SELECT nextval('loa_number_seq') AS n")->n ?? 0);
        if ($seq <= 0) throw new RuntimeException('Failed to generate LoA sequence.');

        $year = now()->format('Y');
        // Format meniru template: "{seq}/LAB-BM/BA/{year}"
        return str_pad((string)$seq, 3, '0', STR_PAD_LEFT) . "/LAB-BM/BA/{$year}";
    }
}
