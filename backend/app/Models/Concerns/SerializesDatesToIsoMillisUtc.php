<?php

namespace App\Models\Concerns;

use Carbon\Carbon;
use DateTimeInterface;

trait SerializesDatesToIsoMillisUtc
{
    // app/Models/Concerns/SerializesDatesToIsoMillisUtc.php
    protected function serializeDate(DateTimeInterface $date): string
    {
        $tz = config('app.timezone', 'Asia/Makassar');

        return \Carbon\Carbon::instance($date)
            ->setTimezone($tz)
            ->format('Y-m-d\TH:i:s.vP'); // 2025-12-23T21:26:17.000+08:00
    }
}
