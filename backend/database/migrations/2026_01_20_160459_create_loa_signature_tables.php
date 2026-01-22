<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('loa_signature_roles', function (Blueprint $table) {
            $table->string('role_code', 24)->primary(); // OM, LH, CLIENT
            $table->string('role_name', 60);
            $table->smallInteger('sort_order')->default(0);
            $table->boolean('is_required')->default(true);
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();
        });

        Schema::create('loa_signatures', function (Blueprint $table) {
            $table->bigIncrements('signature_id');
            $table->unsignedBigInteger('lo_id');
            $table->string('role_code', 24);

            // signer bisa staff atau client
            $table->unsignedBigInteger('signed_by_staff')->nullable();
            $table->unsignedBigInteger('signed_by_client')->nullable();
            $table->timestampTz('signed_at')->nullable();

            $table->string('signature_hash', 128)->nullable();
            $table->text('note')->nullable();

            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            $table->unique(['lo_id', 'role_code'], 'uq_loa_signatures_lo_role');

            $table->foreign('lo_id', 'fk_loa_signatures_lo')
                ->references('lo_id')->on('letters_of_order')
                ->cascadeOnUpdate()
                ->cascadeOnDelete();

            $table->foreign('role_code', 'fk_loa_signatures_roles')
                ->references('role_code')->on('loa_signature_roles')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreign('signed_by_staff', 'fk_loa_signatures_staff')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();

            $table->foreign('signed_by_client', 'fk_loa_signatures_client')
                ->references('client_id')->on('clients')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });

        // seed roles (idempotent-ish)
        DB::table('loa_signature_roles')->insert([
            ['role_code' => 'OM',     'role_name' => 'Operational Manager', 'sort_order' => 1, 'is_required' => true,  'created_at' => now()],
            ['role_code' => 'LH',     'role_name' => 'Laboratory Head',     'sort_order' => 2, 'is_required' => true,  'created_at' => now()],
            ['role_code' => 'CLIENT', 'role_name' => 'Client',             'sort_order' => 3, 'is_required' => true,  'created_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('loa_signatures');
        Schema::dropIfExists('loa_signature_roles');
    }
};
