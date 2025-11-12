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
            // PK
            $table->bigIncrements('staff_id');

            // Main collumns
            $table->string('name', 100);
            $table->string('email', 255)->unique();
            $table->text('password_hash');

            // FK to roles.role_id
            $table->unsignedBigInteger('role_id');

            // Active status
            $table->boolean('is_active')->default(true);

            // Timestamps
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // Indexes for Quick Access
            $table->index('role_id', 'idx_staffs_role');

            // FK Constraints
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
        // Drop UNIQUE email index
        Schema::table('staffs', function (Blueprint $table) {
            $table->dropForeign('fk_staffs_roles');
            $table->dropIndex('idx_staffs_role');
        });

        Schema::dropIfExists('staffs');
    }
};
