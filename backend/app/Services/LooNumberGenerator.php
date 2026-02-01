<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use RuntimeException;

class LooNumberGenerator
{
    public function nextNumber(): string
    {
        if (DB::getDriverName() !== 'pgsql') {
            throw new RuntimeException('LoO number sequence requires PostgreSQL.');
        }

        // NOTE: tetap pakai sequence yang sudah ada untuk menghindari rename DB besar-besaran.
        // Kalau kamu mau rename seq juga nanti, baru kita migrasikan aman-aman.
        $seq = (int) (DB::selectOne("SELECT nextval('loa_number_seq') AS n")->n ?? 0);

        if ($seq <= 0) {
            throw new RuntimeException('Failed to generate LoO sequence.');
        }

        $year = now()->format('Y');

        // GANTI "BA" (Berita Acara) -> "LOO"
        return str_pad((string) $seq, 3, '0', STR_PAD_LEFT) . "/LAB-BM/LOO/{$year}";
    }
}
