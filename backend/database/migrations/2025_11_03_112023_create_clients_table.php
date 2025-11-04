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
        Schema::create('clients', function (Blueprint $table) {
            // PK
            $table->bigIncrements('client_id');

            // FK to staffs.staff_id
            $table->unsignedBigInteger('staff_id');

            // Main collumns
            $table->string('name', 150);
            $table->string('type', 12);
            $table->string('institution_name', 200)->nullable();

            // Timestamps
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // Index for Quick Access
            $table->index('staff_id', 'idx_clients_staff');

            // FK Constraints
            $table->foreign('staff_id', 'fk_clients_staffs')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });

        // CHECK Constraint for type column
        DB::statement("ALTER TABLE clients ADD CONSTRAINT chk_clients_type CHECK (type IN ('individual', 'institution'));");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // DROP CHECK Constraint
        DB::statement('ALTER TABLE clients DROP CONSTRAINT IF EXISTS chk_clients_type;');

        // DROP FK and Index
        Schema::table('clients', function (Blueprint $table) {
            $table->dropForeign('fk_clients_staffs');
            $table->dropIndex('idx_clients_staff');
        });

        Schema::dropIfExists('clients');
    }
};
