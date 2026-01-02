<?php

namespace App\Logging;

class NullLogManager
{
    public function __call($method, $parameters)
    {
        // Do nothing
    }

    public function channel($channel = null)
    {
        return $this;
    }

    public function stack(array $channels, $channel = null)
    {
        return $this;
    }

    public function driver($driver = null)
    {
        return $this;
    }
}
