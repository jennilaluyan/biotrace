<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class CoaSignatureResolver
{
    /**
     * Resolve Lab Head signature image.
     *
     * Priority:
     * 1) config('coa.lh_signature.disk' + path)
     * 2) staffs.signature_path (if exists)
     * 3) ✅ fallback QR to google.com (data-uri) — sementara pakai model surat_pengujian
     *
     * @return array{disk:string,path:string,bytes:?string,data_uri:string}
     */
    public static function resolveLabHeadSignature(int $lhStaffId): array
    {
        // 1️⃣ From config
        $disk = config('coa.lh_signature.disk');
        $path = config('coa.lh_signature.path');

        if ($disk && $path && Storage::disk($disk)->exists($path)) {
            $bytes = Storage::disk($disk)->get($path);

            return [
                'disk' => (string) $disk,
                'path' => (string) $path,
                'bytes' => $bytes,
                'data_uri' => self::toDataUriPng($bytes),
            ];
        }

        // 2️⃣ From staffs table (optional fallback)
        $staff = DB::table('staffs')->where('staff_id', $lhStaffId)->first();

        if ($staff && isset($staff->signature_path) && is_string($staff->signature_path) && trim($staff->signature_path) !== '') {
            $staffDisk = (isset($staff->signature_disk) && is_string($staff->signature_disk) && trim($staff->signature_disk) !== '')
                ? $staff->signature_disk
                : 'local';

            if (Storage::disk($staffDisk)->exists($staff->signature_path)) {
                $bytes = Storage::disk($staffDisk)->get($staff->signature_path);

                return [
                    'disk' => (string) $staffDisk,
                    'path' => (string) $staff->signature_path,
                    'bytes' => $bytes,
                    'data_uri' => self::toDataUriPng($bytes),
                ];
            }
        }

        // 3️⃣ ✅ TEMP FALLBACK: generate QR (google.com) so COA won't fail
        $qrDataUri = self::makeQrDataUri('https://google.com');

        return [
            'disk' => 'inline',
            'path' => 'qr:https://google.com',
            'bytes' => null,
            'data_uri' => $qrDataUri ?? self::fallbackBlankPngDataUri(),
        ];
    }

    private static function toDataUriPng(string $bytes): string
    {
        return 'data:image/png;base64,' . base64_encode($bytes);
    }

    /**
     * DOMPDF-safe QR:
     * 1) Try PNG via SimpleSoftwareIO
     * 2) Fallback SVG via SimpleSoftwareIO
     * 3) Fallback BaconQrCode -> SVG
     */
    private static function makeQrDataUri(?string $payload): ?string
    {
        $payload = $payload ? trim($payload) : '';
        if ($payload === '') return null;

        // 1) Try PNG
        try {
            if (class_exists(\SimpleSoftwareIO\QrCode\Facades\QrCode::class)) {
                $png = \SimpleSoftwareIO\QrCode\Facades\QrCode::format('png')
                    ->size(110)->margin(1)->generate($payload);

                if (is_string($png) && $png !== '') {
                    return 'data:image/png;base64,' . base64_encode($png);
                }
            }
        } catch (\Throwable $e) {
            // ignore -> fallback SVG
        }

        // 2) SVG via SimpleSoftwareIO
        try {
            if (class_exists(\SimpleSoftwareIO\QrCode\Facades\QrCode::class)) {
                $svg = \SimpleSoftwareIO\QrCode\Facades\QrCode::format('svg')
                    ->size(110)->margin(0)->generate($payload);

                if (is_string($svg) && trim($svg) !== '') {
                    $svg2 = $svg;

                    // Ensure svg has explicit width/height (helps dompdf)
                    if (stripos($svg2, 'width=') === false) {
                        $svg2 = preg_replace('/<svg\b/', '<svg width="110" height="110"', $svg2, 1);
                    }

                    return 'data:image/svg+xml;base64,' . base64_encode($svg2);
                }
            }
        } catch (\Throwable $e) {
            // ignore -> fallback bacon
        }

        // 3) BaconQrCode SVG fallback (very reliable)
        try {
            if (
                class_exists(\BaconQrCode\Writer::class) &&
                class_exists(\BaconQrCode\Renderer\ImageRenderer::class) &&
                class_exists(\BaconQrCode\Renderer\RendererStyle\RendererStyle::class) &&
                class_exists(\BaconQrCode\Renderer\Image\SvgImageBackEnd::class)
            ) {
                $style = new \BaconQrCode\Renderer\RendererStyle\RendererStyle(110);
                $backend = new \BaconQrCode\Renderer\Image\SvgImageBackEnd();
                $renderer = new \BaconQrCode\Renderer\ImageRenderer($style, $backend);
                $writer = new \BaconQrCode\Writer($renderer);

                $svg = $writer->writeString($payload);
                if (is_string($svg) && trim($svg) !== '') {
                    $svg2 = $svg;
                    if (stripos($svg2, 'width=') === false) {
                        $svg2 = preg_replace('/<svg\b/', '<svg width="110" height="110"', $svg2, 1);
                    }
                    return 'data:image/svg+xml;base64,' . base64_encode($svg2);
                }
            }
        } catch (\Throwable $e) {
            // ignore
        }

        return null;
    }

    /**
     * last-resort: tiny 1x1 transparent PNG
     */
    private static function fallbackBlankPngDataUri(): string
    {
        // 1x1 transparent PNG
        $b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7W7mQAAAAASUVORK5CYII=';
        return 'data:image/png;base64,' . $b64;
    }
}
