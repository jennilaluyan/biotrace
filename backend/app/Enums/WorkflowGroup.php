<?php

namespace App\Enums;

enum WorkflowGroup: string
{
    case PCR = 'pcr';
    case SEQUENCING = 'sequencing';
    case RAPID = 'rapid';
    case MICROBIOLOGY = 'microbiology';

    public function label(): string
    {
        return match ($this) {
            self::PCR => 'PCR',
            self::SEQUENCING => 'Sequencing',
            self::RAPID => 'Rapid',
            self::MICROBIOLOGY => 'Microbiology',
        };
    }
}
