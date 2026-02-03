<?php

namespace App\Enums;

enum WorkflowGroup: string
{
    case PCR_SARS_COV_2 = 'pcr_sars_cov_2';
    case WGS_SARS_COV_2 = 'wgs_sars_cov_2';
    case GROUP_19_22 = 'group_19_22';
    case GROUP_23_32 = 'group_23_32';

    public function label(): string
    {
        return match ($this) {
            self::PCR_SARS_COV_2 => 'PCR SARS-CoV-2',
            self::WGS_SARS_COV_2 => 'Whole Genome Sequencing SARS-CoV-2',
            self::GROUP_19_22 => 'Parameters 19–22',
            self::GROUP_23_32 => 'Parameters 23–32',
        };
    }
}
