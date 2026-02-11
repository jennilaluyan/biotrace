<?php

namespace App\Services;

use App\Support\LabSampleCode;

class LabSampleCodeGenerator
{
    public function nextCode(string $prefix = 'BML', int $pad = 3): string
    {
        return LabSampleCode::next($prefix, $pad);
    }
}