<?php

namespace App\Logging;

use Illuminate\Log\Logger;

class CustomFormatter
{
    public function __invoke(Logger $logger)
    {
        foreach ($logger->getHandlers() as $handler) {
            $handler->setFormatter(new CustomLineFormatter());
        }
    }
}
