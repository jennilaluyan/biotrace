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
            // Primary Key
            $table->bigIncrements('client_id');

            // FK to staffs: PIC internal yang handle client ini
            $table->unsignedBigInteger('staff_id');

            // Jenis client: individual / institution (form PKS vs individu)
            $table->string('type', 12); // constrained via CHECK

            // --- Common fields (dipakai keduanya) ---
            $table->string('name', 150);                // Nama klien (individu) atau nama instansi utama
            $table->string('phone', 30)->nullable();    // Kontak utama
            $table->string('email', 150)->nullable();   // Kontak utama

            // --- Individual client fields (form "Individu") ---
            $table->string('national_id', 50)->nullable();   // NIK / KTP
            $table->date('date_of_birth')->nullable();
            $table->string('gender', 10)->nullable();        // 'L', 'P', atau deskriptif
            $table->string('address_ktp', 255)->nullable();  // Alamat sesuai KTP
            $table->string('address_domicile', 255)->nullable(); // Alamat domisili bila beda

            // --- Institutional client fields (form "Institusi/PKS") ---
            $table->string('institution_name', 200)->nullable();       // Nama instansi (kalau type = institution)
            $table->string('institution_address', 255)->nullable();    // Alamat instansi
            $table->string('contact_person_name', 150)->nullable();    // Nama pengirim sampel / PIC
            $table->string('contact_person_phone', 30)->nullable();
            $table->string('contact_person_email', 150)->nullable();

            // Timestamps
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();

            // Indexes
            $table->index('staff_id', 'idx_clients_staff');
            $table->index('type', 'idx_clients_type');
            $table->index('national_id', 'idx_clients_national_id');
            $table->index('institution_name', 'idx_clients_institution_name');

            // FK Constraints
            $table->foreign('staff_id', 'fk_clients_staffs')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });

        // CHECK Constraint untuk kolom type
        DB::statement("
            ALTER TABLE clients
            ADD CONSTRAINT chk_clients_type
            CHECK (type IN ('individual', 'institution'));
        ");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Drop CHECK constraint
        DB::statement('ALTER TABLE clients DROP CONSTRAINT IF EXISTS chk_clients_type;');

        // Drop FK and Indexes
        Schema::table('clients', function (Blueprint $table) {
            $table->dropForeign('fk_clients_staffs');
            $table->dropIndex('idx_clients_staff');
            $table->dropIndex('idx_clients_type');
            $table->dropIndex('idx_clients_national_id');
            $table->dropIndex('idx_clients_institution_name');
        });

        Schema::dropIfExists('clients');
    }
};
