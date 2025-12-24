<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;

class ApiResponse
{
    public static function success(
        mixed $data = null,
        string $message = null,
        int $status = 200,
        array $extra = []
    ): JsonResponse {
        $request = request();

        $payload = [
            'timestamp' => now()->toIso8601String(),
            'status'    => $status,
            'message'   => $message,
            'data'      => $data,
            'context'   => [
                'method'    => $request->getMethod(),
                'path'      => $request->getPathInfo(),
                'resource'  => $extra['resource'] ?? 'clients',
                'actorRole' => optional($request->user()?->role)->name,
                'requestId' => $extra['requestId'] ?? (string) Str::uuid(),
            ],
        ];

        if (isset($extra['meta'])) {
            $payload['meta'] = $extra['meta'];
        }

        return response()->json($payload, $status);
    }

    public static function error(
        string $message,
        string $code,
        int $status,
        array $options = []
    ): JsonResponse {
        $request = request();

        $payload = [
            'timestamp' => now()->toIso8601String(),
            'status'    => $status,
            'error'     => self::httpErrorText($status),
            'code'      => $code,
            'message'   => $message,
        ];

        if (!empty($options['details'])) {
            $payload['details'] = $options['details'];
        }

        $payload['context'] = [
            'method'    => $request->getMethod(),
            'path'      => $request->getPathInfo(),
            'resource'  => $options['resource'] ?? 'clients',
            'actorRole' => optional($request->user()?->role)->name,
            'requestId' => $options['requestId'] ?? (string) Str::uuid(),
        ];

        if (!empty($options['links'])) {
            $payload['links'] = $options['links'];
        }

        if (app()->environment(['local', 'staging']) && !empty($options['debug'])) {
            $payload['debug'] = $options['debug'];
        }

        return response()->json($payload, $status);
    }

    protected static function httpErrorText(int $status): ?string
    {
        return [
            400 => 'Bad Request',
            401 => 'Unauthorized',
            403 => 'Forbidden',
            404 => 'Not Found',
            422 => 'Unprocessable Entity',
            500 => 'Internal Server Error',
        ][$status] ?? null;
    }
}
