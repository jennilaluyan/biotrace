<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('letter_of_order_items')) {
            return;
        }

        // Kalau kolom lo_id sudah ada, stop.
        if (Schema::hasColumn('letter_of_order_items', 'lo_id')) {
            return;
        }

        // 1) Tambah kolom lo_id + index
        Schema::table('letter_of_order_items', function (Blueprint $table) {
            $table->unsignedBigInteger('lo_id')->nullable();
            $table->index('lo_id', 'idx_letter_of_order_items_lo_id');
        });

        // 2) Backfill dari kolom lama (kalau ada)
        // Beberapa versi lama biasanya pakai letter_of_order_id atau loo_id
        if (Schema::hasColumn('letter_of_order_items', 'letter_of_order_id')) {
            DB::table('letter_of_order_items')
                ->whereNull('lo_id')
                ->update(['lo_id' => DB::raw('letter_of_order_id')]);
        } elseif (Schema::hasColumn('letter_of_order_items', 'loo_id')) {
            DB::table('letter_of_order_items')
                ->whereNull('lo_id')
                ->update(['lo_id' => DB::raw('loo_id')]);
        }

        // 3) Add FK (Postgres only) — pakai nama constraint yang eksplisit biar gampang di-manage
        try {
            if (DB::getDriverName() === 'pgsql' && Schema::hasTable('letters_of_order')) {
                DB::statement("
                    ALTER TABLE letter_of_order_items
                    ADD CONSTRAINT fk_letter_of_order_items_lo_id
                    FOREIGN KEY (lo_id)
                    REFERENCES letters_of_order(lo_id)
                    ON UPDATE CASCADE
                    ON DELETE CASCADE
                ");
            }
        } catch (\Throwable $e) {
            // Kalau constraint sudah ada / beda environment, jangan bikin deploy gagal.
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('letter_of_order_items')) {
            return;
        }

        if (!Schema::hasColumn('letter_of_order_items', 'lo_id')) {
            return;
        }

        // Drop FK (Postgres only), lalu drop index + column
        try {
            if (DB::getDriverName() === 'pgsql') {
                DB::statement("
                    ALTER TABLE letter_of_order_items
                    DROP CONSTRAINT IF EXISTS fk_letter_of_order_items_lo_id
                ");
            }
        } catch (\Throwable $e) {
            // ignore
        }

        Schema::table('letter_of_order_items', function (Blueprint $table) {
            // dropIndex pakai nama index
            $table->dropIndex('idx_letter_of_order_items_lo_id');
            $table->dropColumn('lo_id');
        });
    }
};
