<?php

namespace App\Services;

use App\Models\FileBlob;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

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
     */
    public function streamResponse(int $fileId, bool $download = false): Response
    {
        $file = $this->getFile($fileId);

        $filename = $this->safeFilename((string) $file->original_name, (string) $file->ext);
        $disposition = $download ? 'attachment' : 'inline';

        $bytes = $file->bytes ?? '';
        $size = (int) ($file->size_bytes ?? strlen($bytes));

        return response($bytes, 200)
            ->header('Content-Type', $file->mime_type ?: 'application/octet-stream')
            ->header('Content-Length', (string) $size)
            ->header('Content-Disposition', $disposition . '; filename="' . $filename . '"')
            ->header('X-Content-Type-Options', 'nosniff');
    }

    private function guessExt(string $originalName, ?string $mimeType): string
    {
        $fromName = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if ($fromName) return $fromName;

        return match ($mimeType) {
            'application/pdf' => 'pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
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