<?php

namespace App\Services;

use App\Models\Sample;
use App\Models\SampleIdCounter;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class LabSampleCodeGenerator
{
    /** Map workflow_group -> default prefix */
    public function defaultPrefix(?string $workflowGroup): string
    {
        $wg = strtolower(trim((string) $workflowGroup));

        if ($wg === '') return 'BML';
        if (str_contains($wg, 'wgs')) return 'WGS';
        if (str_contains($wg, 'usr')) return 'USR';
        if (str_contains($wg, 'lbma')) return 'LBMA';
        if (str_contains($wg, 'bml')) return 'BML';

        return 'BML';
    }

    /** Generate next code for a given prefix: "PREFIX 001" */
    public function nextCode(string $prefix = 'BML', int $pad = 3): string
    {
        $prefix = strtoupper(trim($prefix));
        $next = $this->nextNumberForPrefix($prefix);

        return $this->format($prefix, $next, $pad);
    }

    /** Suggest for a sample (workflow-group aware), reserve once per sample via sample_id_prefix/number */
    public function suggestForSample(Sample $sample, int $pad = 3): string
    {
        $existingPrefix = strtoupper(trim((string) ($sample->sample_id_prefix ?? '')));
        $existingNumber = $sample->sample_id_number;

        if ($existingPrefix !== '' && is_numeric($existingNumber)) {
            return $this->format($existingPrefix, (int) $existingNumber, $pad);
        }

        $prefix = $this->defaultPrefix($sample->workflow_group ?? null);
        $next = $this->nextNumberForPrefix($prefix);

        $sample->sample_id_prefix = $prefix;
        $sample->sample_id_number = $next;
        $sample->save();

        return $this->format($prefix, $next, $pad);
    }

    /**
     * Normalize user input sample id.
     * Example: "SWG 4" -> "SWG 004"
     * Final: <A-Z>{2,6} <digits> (digits padded to min 3)
     */
    public function normalize(string $raw, int $pad = 3): string
    {
        $raw = trim($raw);
        if ($raw === '') {
            throw new \InvalidArgumentException('Sample ID is required.');
        }

        $raw = strtoupper($raw);

        if (!preg_match('/^([A-Z]{2,6})\s*[- ]?\s*(\d+)$/', $raw, $m)) {
            throw new \InvalidArgumentException('Invalid sample id format.');
        }

        $prefix = $m[1];
        $numStr = ltrim($m[2], '0');
        if ($numStr === '') $numStr = '0';

        $min = max(3, (int) $pad);
        $numStr = str_pad($numStr, $min, '0', STR_PAD_LEFT);

        return $prefix . ' ' . $numStr;
    }

    /** Parse normalized "PREFIX 001" */
    public function parseNormalized(string $normalized): array
    {
        $normalized = trim($normalized);

        if (!preg_match('/^([A-Z]{2,6})\s+(\d{3,})$/', $normalized, $m)) {
            throw new \InvalidArgumentException('Invalid normalized sample id.');
        }

        return [
            'prefix' => $m[1],
            'number_str' => $m[2],
            'number' => (int) $m[2],
        ];
    }

    /** Ensure counter is at least a number (used for override assignments) */
    public function ensureCounterAtLeast(string $prefix, int $number): void
    {
        $prefix = strtoupper(trim($prefix));
        if ($prefix === '' || $number <= 0) return;

        DB::transaction(function () use ($prefix, $number) {
            $row = SampleIdCounter::query()->where('prefix', $prefix)->lockForUpdate()->first();

            if (!$row) {
                $row = new SampleIdCounter([
                    'prefix' => $prefix,
                    'last_number' => 0,
                ]);
                $row->save();

                $row = SampleIdCounter::query()->where('prefix', $prefix)->lockForUpdate()->first();
            }

            if ((int) $row->last_number < $number) {
                $row->last_number = $number;
                $row->updated_at = Carbon::now('UTC');
                $row->save();
            }
        }, 3);
    }

    private function format(string $prefix, int $number, int $pad = 3): string
    {
        $prefix = strtoupper(trim($prefix));
        $n = max(0, (int) $number);

        $min = max(3, (int) $pad);
        $num = str_pad((string) $n, $min, '0', STR_PAD_LEFT);

        return $prefix . ' ' . $num;
    }

    private function nextNumberForPrefix(string $prefix): int
    {
        $prefix = strtoupper(trim($prefix));

        return DB::transaction(function () use ($prefix) {
            $row = SampleIdCounter::query()->where('prefix', $prefix)->lockForUpdate()->first();

            if (!$row) {
                $row = new SampleIdCounter([
                    'prefix' => $prefix,
                    'last_number' => 0,
                ]);
                $row->save();

                $row = SampleIdCounter::query()->where('prefix', $prefix)->lockForUpdate()->first();
            }

            $next = ((int) $row->last_number) + 1;

            $row->last_number = $next;
            $row->updated_at = Carbon::now('UTC');
            $row->save();

            return $next;
        }, 3);
    }
}
