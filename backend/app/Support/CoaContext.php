<?php

namespace App\Support;

use App\Models\Client;
use Illuminate\Contracts\Auth\Authenticatable;

final class CoaContext
{
    /**
     * Ambil role_id dari user secara toleran (user->role_id, user->role->id, dll).
     */
    public static function actorRoleId(?Authenticatable $user): int
    {
        if (!$user) {
            return 0;
        }

        // paling umum: staff/user punya role_id langsung
        $direct = $user->role_id ?? null;
        if (is_numeric($direct)) {
            return (int) $direct;
        }

        // fallback: ada relasi role
        $role = $user->role ?? null;
        if ($role) {
            $rid = $role->role_id ?? $role->id ?? null;
            if (is_numeric($rid)) {
                return (int) $rid;
            }
        }

        return 0;
    }

    public static function isLabHead(?Authenticatable $user): bool
    {
        $lhRoleId = (int) config('coa.access.lab_head_role_id', 6);
        return self::actorRoleId($user) === $lhRoleId;
    }

    /**
     * Resolve jenis client -> 'institution' atau 'individual'
     * Berdasarkan clients.type (default), namun value mapping configurable.
     */
    public static function resolveClientType(Client $client): string
    {
        $field = (string) config('coa.client_type.field', 'type');
        $raw = (string) data_get($client, $field, '');
        $val = strtolower(trim($raw));

        $institutionValues = array_map('strtolower', (array) config('coa.client_type.institution_values', []));
        $individualValues = array_map('strtolower', (array) config('coa.client_type.individual_values', []));

        if ($val !== '' && in_array($val, $institutionValues, true)) {
            return 'institution';
        }

        if ($val !== '' && in_array($val, $individualValues, true)) {
            return 'individual';
        }

        /**
         * Default aman:
         * kalau value tidak dikenali, kita treat sebagai 'individual'
         * (lebih “safe” untuk template: individu lebih sederhana).
         */
        return 'individual';
    }

    /**
     * Resolve default template key berdasarkan jenis client.
     */
    public static function resolveDefaultTemplateKey(string $clientType): string
    {
        $map = (array) config('coa.default_template_by_client_type', []);
        $key = $map[$clientType] ?? null;

        if (is_string($key) && $key !== '') {
            return $key;
        }

        return $clientType === 'institution'
            ? 'institution_v1'
            : 'individual';
    }

    /**
     * Ambil string signature reference dari staff/user model (tanpa asumsi field).
     * Return:
     * - string path/url/base64
     * - null jika tidak ada
     */
    public static function resolveLabHeadSignatureRef(object $staffOrUser): ?string
    {
        $fields = (array) config('coa.lab_head_signature.candidate_fields', []);

        foreach ($fields as $f) {
            $f = trim((string) $f);
            if ($f === '') {
                continue;
            }

            $val = data_get($staffOrUser, $f);
            if (is_string($val) && trim($val) !== '') {
                return trim($val);
            }
        }

        return null;
    }
}
