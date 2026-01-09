<?php

namespace App\Support;

final class CoaTemplate
{
    public const INSTITUTION_V1 = 'institution_v1';
    public const INSTITUTION_V2 = 'institution_v2';
    public const INDIVIDUAL = 'individual';

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
