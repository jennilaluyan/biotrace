<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1) Tambah kolom auth untuk portal client
        Schema::table('clients', function (Blueprint $table) {
            if (!Schema::hasColumn('clients', 'password_hash')) {
                $table->text('password_hash')->nullable();
            }

            if (!Schema::hasColumn('clients', 'is_active')) {
                // client default: belum diverifikasi admin
                $table->boolean('is_active')->default(false);
            }
        });

        // 2) Pastikan soft delete column ada (kalau ternyata belum)
        Schema::table('clients', function (Blueprint $table) {
            if (!Schema::hasColumn('clients', 'deleted_at')) {
                $table->softDeletesTz();
            }
        });

        // 3) Soft-delete duplikat email (case-insensitive) yang masih aktif (deleted_at is null)
        //    Simpan record terlama (client_id paling kecil), sisanya di-soft-delete.
        DB::statement("
            WITH ranked AS (
                SELECT
                    client_id,
                    email,
                    ROW_NUMBER() OVER (
                        PARTITION BY LOWER(email)
                        ORDER BY client_id ASC
                    ) AS rn
                FROM clients
                WHERE email IS NOT NULL
                  AND deleted_at IS NULL
            )
            UPDATE clients
            SET deleted_at = NOW()
            WHERE client_id IN (
                SELECT client_id FROM ranked WHERE rn > 1
            )
        ");

        // 4) Buat unique index email case-insensitive hanya untuk record yang belum soft-deleted
        //    Ini aman walaupun ada duplikat email di row yang sudah soft-deleted.
        DB::statement("
            CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_email_ci_active
            ON clients (LOWER(email))
            WHERE deleted_at IS NULL
        ");
    }

    public function down(): void
    {
        // Drop index
        DB::statement("DROP INDEX IF EXISTS uq_clients_email_ci_active");

        // Kolom (opsional: kalau kamu mau bisa rollback clean)
        Schema::table('clients', function (Blueprint $table) {
            if (Schema::hasColumn('clients', 'is_active')) {
                $table->dropColumn('is_active');
            }
            if (Schema::hasColumn('clients', 'password_hash')) {
                $table->dropColumn('password_hash');
            }
        });
    }
};
