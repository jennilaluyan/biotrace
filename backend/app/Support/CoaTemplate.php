<?php

namespace App\Support;

final class CoaTemplate
{
    public const INSTITUTION = 'institution';
    public const INDIVIDUAL = 'individual';
    public const WGS = 'wgs';
    public const OTHER = 'other';

    public static function keys(): array
    {
        return array_keys(config('coa.templates', []));
    }

    public static function exists(string $key): bool
    {
        return (bool) config("coa.templates.$key");
    }

    public static function label(string $key): string
    {
        return (string) config("coa.templates.$key.label", $key);
    }

    public static function clientType(string $key): ?string
    {
        $v = config("coa.templates.$key.client_type");
        return $v ? (string) $v : null;
    }

    public static function view(string $key): string
    {
        return (string) config("coa.templates.$key.view");
    }
}
