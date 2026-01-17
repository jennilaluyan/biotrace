<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('samples', function (Blueprint $table) {
            /**
             * ===========================
             * REQUEST / INTAKE TRACK
             * ===========================
             *
             * request_status meng-cover workflow sebelum “lab workflow” aktif.
             * Kita set default 'physically_received' supaya sample existing (yang memang sudah diterima) tetap konsisten.
             */
            $table->string('request_status', 32)
                ->default('physically_received')
                ->after('current_status');

            $table->timestampTz('submitted_at')->nullable()->after('request_status');
            $table->timestampTz('reviewed_at')->nullable()->after('submitted_at');
            $table->timestampTz('ready_at')->nullable()->after('reviewed_at');
            $table->timestampTz('physically_received_at')->nullable()->after('ready_at');

            /**
             * Lab sample code (contoh: BML-001)
             * Akan di-generate setelah intake checklist PASS + LH validate (step berikutnya).
             */
            $table->string('lab_sample_code', 32)->nullable()->after('physically_received_at');

            // Indexes (biar query cepat dan aman)
            $table->index('request_status', 'idx_samples_request_status');
            $table->index('submitted_at', 'idx_samples_submitted_at');
            $table->unique('lab_sample_code', 'uq_samples_lab_sample_code');
        });

        /**
         * received_at sekarang harus nullable, karena pada fase request belum ada penerimaan fisik.
         * Ini perlu raw SQL supaya benar-benar drop NOT NULL di PostgreSQL.
         */
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE samples ALTER COLUMN received_at DROP NOT NULL;");
        } else {
            // Untuk driver lain, kita coba change() (kalau didukung).
            // Jika tidak didukung, minimal Step 1 tetap aman untuk environment pgsql kamu.
            try {
                Schema::table('samples', function (Blueprint $table) {
                    $table->timestampTz('received_at')->nullable()->change();
                });
            } catch (\Throwable $e) {
                // silently ignore: we only enforce correctness on pgsql here
            }
        }

        /**
         * Backfill data existing:
         * - request_status: physically_received (sesuai kondisi lama)
         * - submitted_at: pakai received_at (biar timeline tidak kosong)
         * - physically_received_at: pakai received_at
         */
        DB::statement("
            UPDATE samples
            SET
                request_status = COALESCE(request_status, 'physically_received'),
                submitted_at = COALESCE(submitted_at, received_at),
                physically_received_at = COALESCE(physically_received_at, received_at)
        ");

        /**
         * CHECK constraint untuk request_status (PostgreSQL only).
         * Ini penting biar status tidak “ngaco” dan traceability enak.
         */
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("
                ALTER TABLE samples
                ADD CONSTRAINT chk_samples_request_status
                CHECK (request_status IN (
                    'draft',
                    'submitted',
                    'returned',
                    'ready_for_delivery',
                    'physically_received',
                    'rejected'
                ));
            ");
        }
    }

    public function down(): void
    {
        // Drop CHECK constraint (pgsql)
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE samples DROP CONSTRAINT IF EXISTS chk_samples_request_status;");
        }

        // Revert received_at NOT NULL (pgsql only)
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE samples ALTER COLUMN received_at SET NOT NULL;");
        }

        Schema::table('samples', function (Blueprint $table) {
            $table->dropUnique('uq_samples_lab_sample_code');
            $table->dropIndex('idx_samples_request_status');
            $table->dropIndex('idx_samples_submitted_at');

            $table->dropColumn([
                'request_status',
                'submitted_at',
                'reviewed_at',
                'ready_at',
                'physically_received_at',
                'lab_sample_code',
            ]);
        });
    }
};
