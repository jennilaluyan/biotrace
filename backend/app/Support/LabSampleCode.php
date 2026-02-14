<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

class LabSampleCode
{
    public static function next(string $prefix = 'BML', int $pad = 3): string
    {
        $norm = self::normalizePrefix($prefix);

        if (!self::hasCountersTable()) {
            $n = (int) (microtime(true) * 1000) % 100000;
            if ($n <= 0) $n = 1;
            return self::format($norm, $n, $pad);
        }

        return DB::transaction(function () use ($norm, $pad) {
            $row = DB::table('sample_id_counters')
                ->where('prefix', $norm)
                ->lockForUpdate()
                ->first();

            if (!$row) {
                DB::table('sample_id_counters')->insert([
                    'prefix' => $norm,
                    'last_number' => 0,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $last = 0;
            } else {
                $last = (int) ($row->last_number ?? 0);
            }

            $next = max(1, $last + 1);

            DB::table('sample_id_counters')
                ->where('prefix', $norm)
                ->update([
                    'last_number' => $next,
                    'updated_at' => now(),
                ]);

            return self::format($norm, $next, $pad);
        });
    }

    public static function normalize(string $raw, int $pad = 3): ?array
    {
        $raw = trim($raw);
        if ($raw === '') return null;

        if (preg_match('/^([A-Za-z]{1,5})\s+(\d{1,6})$/', $raw, $m)) {
            $prefix = self::normalizePrefix($m[1]);
            $num = (int) $m[2];
            if ($num <= 0) return null;

            return [
                'prefix' => $prefix,
                'number' => $num,
                'code' => self::format($prefix, $num, $pad),
            ];
        }

        if (preg_match('/^([A-Za-z]{1,5})-(\d{1,6})$/', $raw, $m)) {
            $prefix = self::normalizePrefix($m[1]);
            $num = (int) $m[2];
            if ($num <= 0) return null;

            return [
                'prefix' => $prefix,
                'number' => $num,
                'code' => self::format($prefix, $num, $pad),
            ];
        }

        return null;
    }

    public static function syncCounterFromCode(string $code): void
    {
        $parsed = self::normalize($code, 3);
        if (!$parsed) return;

        if (!self::hasCountersTable()) return;

        $prefix = $parsed['prefix'];
        $num = (int) $parsed['number'];

        DB::transaction(function () use ($prefix, $num) {
            $row = DB::table('sample_id_counters')
                ->where('prefix', $prefix)
                ->lockForUpdate()
                ->first();

            if (!$row) {
                DB::table('sample_id_counters')->insert([
                    'prefix' => $prefix,
                    'last_number' => $num,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                return;
            }

            $last = (int) ($row->last_number ?? 0);
            if ($num > $last) {
                DB::table('sample_id_counters')
                    ->where('prefix', $prefix)
                    ->update([
                        'last_number' => $num,
                        'updated_at' => now(),
                    ]);
            }
        });
    }

    private static function format(string $prefix, int $number, int $pad): string
    {
        return $prefix . ' ' . str_pad((string) $number, $pad, '0', STR_PAD_LEFT);
    }

    private static function normalizePrefix(string $prefix): string
    {
        $prefix = strtoupper(trim($prefix));
        $prefix = preg_replace('/\s+/', '', $prefix) ?? $prefix;
        $prefix = preg_replace('/[^A-Z0-9]/', '', $prefix) ?? $prefix;
        if ($prefix === '') $prefix = 'BML';
        return $prefix;
    }

    private static function hasCountersTable(): bool
    {
        try {
            return DB::connection()->getSchemaBuilder()->hasTable('sample_id_counters');
        } catch (\Throwable $e) {
            return false;
        }
    }
}
