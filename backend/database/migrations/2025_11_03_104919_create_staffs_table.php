<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('staffs', function (Blueprint $table) {
            $table->bigIncrements('staff_id');
            $table->string('name', 100);
            $table->string('email', 255);
            $table->text('password_hash');

            $table->unsignedBigInteger('role_id');

            $table->boolean('is_active')->default(true);

            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            $table->index('role_id', 'idx_staffs_role');

            $table->foreign('role_id', 'fk_staffs_roles')
                ->references('role_id')->on('roles')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });

        // UNIQUE email case-insensitive
        DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS uq_staffs_email_ci ON staffs (LOWER(email));');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('staffs', function (Blueprint $table) {
            $table->dropForeign('fk_staffs_roles');
            $table->dropIndex('idx_staffs_role');
        });

        Schema::dropIfExists('staffs');
    }
};
