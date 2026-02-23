<?php

namespace App\Services;

use App\Models\FileBlob;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class FileStoreService
{
    /**
     * Store raw bytes into DB and return file_id.
     * Optional dedup by (sha256 + size_bytes).
     */
    public function storeBytes(
        string $bytes,
        string $originalName,
        ?string $mimeType = null,
        ?string $ext = null,
        ?int $actorId = null,
        bool $dedup = true
    ): int {
        $size = strlen($bytes);
        $sha = hash('sha256', $bytes);

        if ($dedup) {
            $existing = FileBlob::query()
                ->where('sha256', $sha)
                ->where('size_bytes', $size)
                ->first();

            if ($existing) {
                return (int) $existing->file_id;
            }
        }

        $ext = $ext ?: $this->guessExt($originalName, $mimeType);

        // ✅ IMPORTANT:
        // Postgres bytea insert can't safely receive raw binary as a normal bound string,
        // because it may be treated as UTF-8 text and blow up on 0xFE etc.
        // So for pgsql we store using decode(base64, 'base64').
        $driver = DB::connection()->getDriverName();

        if ($driver === 'pgsql') {
            return $this->insertPgsqlBytea(
                originalName: $originalName,
                ext: $ext,
                mimeType: $mimeType,
                size: $size,
                sha: $sha,
                bytes: $bytes,
                actorId: $actorId
            );
        }

        // MySQL/MariaDB/SQLite: raw bytes insert is OK.
        $row = FileBlob::create([
            'original_name' => $originalName,
            'ext' => $ext,
            'mime_type' => $mimeType,
            'size_bytes' => $size,
            'sha256' => $sha,
            'bytes' => $bytes,
            'created_by' => $actorId,
        ]);

        return (int) $row->file_id;
    }

    public function getFile(int $fileId): FileBlob
    {
        return FileBlob::query()
            ->where('file_id', $fileId)
            ->firstOrFail();
    }

    /**
     * Stream/download response for stored blob.
     * $download=false => inline preview (PDF in browser)
     *
     * NOTE: On Postgres, bytea is sometimes returned as a stream resource,
     * so we support StreamedResponse to avoid memory spikes.:contentReference[oaicite:1]{index=1}
     */
    public function streamResponse(int $fileId, bool $download = false): Response
    {
        $file = $this->getFile($fileId);

        $filename = $this->safeFilename((string) $file->original_name, (string) $file->ext);
        $disposition = $download ? 'attachment' : 'inline';

        $bytes = $file->bytes ?? null;
        $size = (int) ($file->size_bytes ?? 0);

        $headers = [
            'Content-Type' => $file->mime_type ?: 'application/octet-stream',
            'Content-Disposition' => $disposition . '; filename="' . $filename . '"',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, max-age=0, no-cache, no-store, must-revalidate',
            'Pragma' => 'no-cache',
        ];

        if ($size > 0) {
            $headers['Content-Length'] = (string) $size;
        }

        // Postgres can return bytea as stream resource
        if (is_resource($bytes)) {
            return new StreamedResponse(function () use ($bytes) {
                while (!feof($bytes)) {
                    echo fread($bytes, 8192);
                }
            }, 200, $headers);
        }

        if (!is_string($bytes)) {
            return response()->json(['message' => 'File bytes are missing'], 500);
        }

        return response($bytes, 200, $headers);
    }

    private function insertPgsqlBytea(
        string $originalName,
        string $ext,
        ?string $mimeType,
        int $size,
        string $sha,
        string $bytes,
        ?int $actorId
    ): int {
        $now = now()->toDateTimeString();

        // Base64 keeps payload smaller than hex (4/3 vs 2x)
        $b64 = base64_encode($bytes);

        // Use decode(?, 'base64') so parameter is safe UTF-8 text,
        // and Postgres converts to bytea server-side.
        $row = DB::selectOne(
            'INSERT INTO files (original_name, ext, mime_type, size_bytes, sha256, bytes, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, decode(?, \'base64\'), ?, ?, ?)
             RETURNING file_id',
            [
                $originalName,
                $ext,
                $mimeType,
                $size,
                $sha,
                $b64,
                $actorId,
                $now,
                $now,
            ]
        );

        $id = (int) ($row->file_id ?? 0);

        if ($id <= 0) {
            throw new \RuntimeException('Failed to insert file blob (pgsql).');
        }

        return $id;
    }

    private function guessExt(string $originalName, ?string $mimeType): string
    {
        $fromName = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if ($fromName) return $fromName;

        return match ($mimeType) {
            'application/pdf' => 'pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
            default => 'bin',
        };
    }

    private function safeFilename(string $originalName, string $ext): string
    {
        $name = pathinfo($originalName, PATHINFO_FILENAME);
        $name = trim(preg_replace('/[^A-Za-z0-9._-]+/', '_', $name) ?: 'file');

        $ext = strtolower(preg_replace('/[^A-Za-z0-9]+/', '', $ext) ?: 'bin');

        // keep header sane
        $name = Str::limit($name, 120, '');

        return $name . '.' . $ext;
    }
}
