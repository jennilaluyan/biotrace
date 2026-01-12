<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class CoaSignatureResolver
{
    /**
     * Resolve Lab Head signature image.
     *
     * Priority:
     * 1. config('coa.lh_signature.disk' + path)
     * 2. staffs.signature_path (if exists)
     *
     * @return array{disk:string,path:string,bytes:string,data_uri:string}
     */
    public static function resolveLabHeadSignature(int $lhStaffId): array
    {
        // 1️⃣ From config
        $disk = config('coa.lh_signature.disk');
        $path = config('coa.lh_signature.path');

        if ($disk && $path && Storage::disk($disk)->exists($path)) {
            $bytes = Storage::disk($disk)->get($path);

            return [
                'disk' => $disk,
                'path' => $path,
                'bytes' => $bytes,
                'data_uri' => self::toDataUri($bytes),
            ];
        }

        // 2️⃣ From staffs table (optional fallback)
        $staff = DB::table('staffs')->where('staff_id', $lhStaffId)->first();

        if ($staff && isset($staff->signature_path)) {
            $staffDisk = $staff->signature_disk ?? 'local';

            if (Storage::disk($staffDisk)->exists($staff->signature_path)) {
                $bytes = Storage::disk($staffDisk)->get($staff->signature_path);

                return [
                    'disk' => $staffDisk,
                    'path' => $staff->signature_path,
                    'bytes' => $bytes,
                    'data_uri' => self::toDataUri($bytes),
                ];
            }
        }

        throw new RuntimeException(
            'TTD Lab Head belum dikonfigurasi (coa.lh_signature.path / staffs.signature_path).'
        );
    }

    private static function toDataUri(string $bytes): string
    {
        return 'data:image/png;base64,' . base64_encode($bytes);
    }
}
