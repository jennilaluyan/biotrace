<?php

namespace App\Http\Controllers;

use App\Services\FileStoreService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class FileController extends Controller
{
    public function __construct(private readonly FileStoreService $files) {}

    /**
     * GET /api/v1/files/{fileId}
     * Stream DB-stored bytes with proper headers.
     *
     * Query:
     * - download=1  => Content-Disposition: attachment
     * - download=0  => Content-Disposition: inline (default)
     */
    public function show(int $fileId, Request $request)
    {
        // Auth required (route middleware). Optional strictness:
        // if (!$request->user()) abort(401);

        $row = $this->files->getFile($fileId);

        if (!$row) {
            return response()->json(['message' => 'File not found'], 404);
        }

        $download = (string) $request->query('download', '0') === '1';
        $disposition = $download ? 'attachment' : 'inline';

        $mime = (string) ($row->mime_type ?? 'application/octet-stream');
        $name = (string) ($row->original_name ?? ("file-{$fileId}." . ($row->ext ?? 'bin')));
        $size = (int) ($row->size_bytes ?? 0);

        // Sanitize filename a bit (avoid weird header breaks)
        $safeName = preg_replace('/[^A-Za-z0-9._ -]/', '_', $name) ?: "file-{$fileId}";

        $headers = [
            'Content-Type' => $mime,
            'Content-Disposition' => $disposition . '; filename="' . $safeName . '"',
            'Cache-Control' => 'private, max-age=0, no-cache, no-store, must-revalidate',
            'Pragma' => 'no-cache',
        ];

        if ($size > 0) {
            $headers['Content-Length'] = (string) $size;
        }

        $bytes = $row->bytes ?? null;

        // Postgres bytea sering keluar sebagai stream resource => kita stream biar irit RAM.
        if (is_resource($bytes)) {
            return new StreamedResponse(function () use ($bytes) {
                while (!feof($bytes)) {
                    echo fread($bytes, 8192);
                }
                // jangan fclose kalau driver mengelola resource-nya sendiri; tapi aman kalau mau:
                // @fclose($bytes);
            }, 200, $headers);
        }

        // Kalau bytes sudah string/binary
        if (!is_string($bytes)) {
            return response()->json(['message' => 'File bytes are missing'], 500);
        }

        return response($bytes, 200, $headers);
    }
}
