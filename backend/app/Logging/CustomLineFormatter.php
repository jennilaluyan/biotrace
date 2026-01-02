<?php

namespace App\Logging;

use Monolog\Formatter\LineFormatter;

class CustomLineFormatter extends LineFormatter
{
    public function __construct()
    {
        parent::__construct(
            "[%datetime%] %channel%.%level_name%: %message%\n",
            'Y-m-d H:i:s',
            false, // allowInlineLineBreaks
            true,  // ignoreEmptyContextAndExtra
            false  // includeStacktraces
        );

        // Batasi kedalaman normalisasi
        $this->maxNormalizeDepth = 3;
        $this->maxNormalizeItemCount = 100;
    }

    protected function convertToString($data): string
    {
        if (null === $data || \is_bool($data)) {
            return var_export($data, true);
        }

        if (\is_scalar($data)) {
            return (string) $data;
        }

        // Batasi output JSON
        try {
            $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR, 3);
            if (strlen($json) > 1000) {
                return substr($json, 0, 1000) . '... [truncated]';
            }
            return $json;
        } catch (\Throwable $e) {
            return '[Unable to convert to string]';
        }
    }
}
