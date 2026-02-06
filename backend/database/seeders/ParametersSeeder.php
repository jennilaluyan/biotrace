<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ParametersSeeder extends Seeder
{
    public function run(): void
    {
        // ambil staff pertama untuk created_by (fallback 1)
        $createdBy = DB::table('staffs')->orderBy('staff_id')->value('staff_id') ?? 1;

        // cek kolom yang tersedia (karena schema kamu evolving)
        $hasUnitText = Schema::hasColumn('parameters', 'unit');       // string (migration lama)
        $hasUnitId   = Schema::hasColumn('parameters', 'unit_id');    // fk (migration baru)

        // cari unit_id untuk "sampel" jika units table sudah ada & sudah diseed
        $unitIdSampel = null;
        if ($hasUnitId && Schema::hasTable('units')) {
            $unitIdSampel = DB::table('units')
                ->whereRaw('LOWER(name) = ?', ['sampel'])
                ->orWhereRaw('LOWER(symbol) = ?', ['sampel'])
                ->value('unit_id');
        }

        // referensi dokumen tarif (biar konsisten dan bisa ditrace)
        $methodRef = 'SK Rektor UNSRAT 339/UW12/LL/2025 (28 Februari 2025) - Tarif Layanan Penunjang Akademik';

        // 32 parameter dari gambar (name persis, tarif hanya sebagai komentar)
        $items = [
            // 1 - 22
            ['no' => 1,  'name' => 'Pemeriksaan PCR (Molekuler) COVID 19 (WHO Standard KIT)', 'price' => 300000],
            ['no' => 2,  'name' => 'Pemeriksaan PCR (Molekuler) HPV (Urine) with Genotipe HPV 16, 18, 52 and other HPV', 'price' => 500000],
            ['no' => 3,  'name' => 'Pemeriksaan PCR (Molekuler) HPV (Swab) with Genotipe HPV 16, 18, 52 and other HPV', 'price' => 750000],
            ['no' => 4,  'name' => 'PCR HPV (Sitologi) with Genotipe HPV 16, 18, 52 and other HPV', 'price' => 1300000],
            ['no' => 5,  'name' => 'Pemeriksaan PCR (Molekuler) Halal - Mandiri', 'price' => 750000],
            ['no' => 6,  'name' => 'PCR Halal - Subsidi Pemerintah', 'price' => 300000],
            ['no' => 7,  'name' => 'Pemeriksaan TCM Mycobacterium Tuberculosa/RIF ULTRA (Genexpert Tb) - Mandiri', 'price' => 1000000],
            ['no' => 8,  'name' => 'TCM Mycobacterium Tuberculosa MDR/SDR (Genexpert Tb) - Mandiri', 'price' => 1500000],
            ['no' => 9,  'name' => 'Pemeriksaan TCM Mycobacterium Tuberculosa (Genexpert Tb) - Subsidi Pemerintah (hanya layanan pengolahan sampel)', 'price' => 250000],
            ['no' => 10, 'name' => 'Pemeriksaan PCR (Molekuler) Real Time-PCR TB', 'price' => 500000],
            ['no' => 11, 'name' => 'Pemeriksaan Screening TB (TCM GeneXpert+IGRA)', 'price' => 1000000],
            ['no' => 12, 'name' => 'Pemeriksaan Sequensing COVID - Mandiri', 'price' => 5000000],
            ['no' => 13, 'name' => 'Pemeriksaan Sequensing COVID - Subsidi Pemerintah (hanya layanan pengolahan sampel)', 'price' => 148500],
            ['no' => 14, 'name' => 'Pemeriksaan Sequensing TB MDR - Mandiri', 'price' => 7500000],
            ['no' => 15, 'name' => 'Pemeriksaan Sequensing TB MDR - Subsidi Pemerintah (hanya layanan pengolahan sampel)', 'price' => 148500],
            ['no' => 16, 'name' => 'Pemeriksaan Metagenomik 16s Bacterial', 'price' => 5000000],
            ['no' => 17, 'name' => 'Pemeriksaan Metagenomik Virome (Virus)', 'price' => 7000000],
            ['no' => 18, 'name' => 'Pemeriksaan Antigen Covid 19', 'price' => 100000],
            ['no' => 19, 'name' => 'Pemeriksaan Antibodi SARS-CoV-2 Kuantitatif', 'price' => 250000],
            ['no' => 20, 'name' => 'Kultur dan sensitivity test bakteri anaerob Darah/Cairan Tubuh Lainnya', 'price' => 1000000],
            ['no' => 21, 'name' => 'Kultur dan sensitivity test bakteri anaerob/pus/sputum/jaringan/swab lain', 'price' => 1250000],
            ['no' => 22, 'name' => 'Kultur bakteri aerob Darah/Cairan Tubuh Lainnya (manual)', 'price' => 600000],

            // 23 - 32
            ['no' => 23, 'name' => 'Kultur bakteri aerob Pus/sputum/jaringan/swab lain (manual)', 'price' => 700000],
            ['no' => 24, 'name' => 'Kultur bakteri Urine (manual)', 'price' => 750000],
            ['no' => 25, 'name' => 'Kultur bakteri Rectal Swab/Feses (manual)', 'price' => 600000],
            ['no' => 26, 'name' => 'Kultur bakteri Corynebacterium diptheriae (manual)', 'price' => 1000000],
            ['no' => 27, 'name' => 'Kultur Identifikasi Bakteri Automatic (VERSATREK)', 'price' => 400000],
            ['no' => 28, 'name' => 'Kultur Identifikasi Bakteri Manual (sampel Darah/urine/pus/feses)', 'price' => 500000],
            ['no' => 29, 'name' => 'Biakan TB', 'price' => 600000],
            ['no' => 30, 'name' => 'Biakan Jamur + Sensitivity', 'price' => 500000],
            ['no' => 31, 'name' => 'Biakan Jamur (Candida, cryptococcus dan ragi lainnya)', 'price' => 400000],
            ['no' => 32, 'name' => 'Sensitivity Test (antimicrobial Susceptibility Testing)', 'price' => 600000],
        ];

        foreach ($items as $it) {
            $no = (int) $it['no'];

            // code max 40 char, simple & stabil:
            // BM-001 ... BM-032
            // ... di dalam foreach ($items as $it) {
            $no = (int) $it['no'];

            // ✅ code baru sesuai permintaan: P01..P32
            $newCode = sprintf('P%02d', $no);

            // ✅ kalau dulu sudah terlanjur ada BM-001..BM-032, kita treat sebagai legacy
            $legacyCode = sprintf('BM-%03d', $no);

            $payload = [
                'catalog_no' => $no,
                'code' => $newCode,
                'name' => $it['name'],
                'method_ref' => $methodRef,
                'created_by' => $createdBy,
                'status' => 'Active',
                'tag' => 'Routine',
                'updated_at' => now(),
            ];

            if ($hasUnitText) {
                $payload['unit'] = 'sampel';
            }
            if ($hasUnitId) {
                $payload['unit_id'] = $unitIdSampel;
            }

            // 1) coba update row legacy BM-* dulu (kalau ada)
            $updatedLegacy = DB::table('parameters')
                ->where('code', $legacyCode)
                ->update($payload);

            // 2) kalau legacy tidak ada, upsert by catalog_no (paling stabil)
            if ($updatedLegacy === 0) {
                DB::table('parameters')->updateOrInsert(
                    ['catalog_no' => $no],
                    $payload
                );
            }
        }
    }
}
