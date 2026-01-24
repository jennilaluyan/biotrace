<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('client_applications', function (Blueprint $table) {
            $table->bigIncrements('client_application_id');

            // status workflow: pending -> approved/rejected
            $table->string('status', 12)->default('pending'); // constrained via CHECK

            // common fields
            $table->string('type', 12); // individual / institution (CHECK)
            $table->string('name', 150);
            $table->string('phone', 30);
            $table->string('email', 150);
            $table->string('email_ci', 150)->nullable(); // for case-insensitive match if you use it

            // auth
            $table->text('password_hash');

            // Individual fields
            $table->string('national_id', 50)->nullable();
            $table->date('date_of_birth')->nullable();
            $table->string('gender', 10)->nullable();
            $table->string('address_ktp', 255)->nullable();
            $table->string('address_domicile', 255)->nullable();

            // Institution fields
            $table->string('institution_name', 200)->nullable();
            $table->string('institution_address', 255)->nullable();
            $table->string('contact_person_name', 150)->nullable();
            $table->string('contact_person_phone', 30)->nullable();
            $table->string('contact_person_email', 150)->nullable();

            // review info (admin/staff who approved/rejected)
            $table->unsignedBigInteger('reviewed_by_staff_id')->nullable();
            $table->timestampTz('reviewed_at')->nullable();
            $table->string('rejection_reason', 255)->nullable();

            // link to created client after approve
            $table->unsignedBigInteger('approved_client_id')->nullable();

            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('updated_at')->nullable();
            $table->softDeletesTz(); // deleted_at

            // Indexes
            $table->index('status', 'idx_client_apps_status');
            $table->index('type', 'idx_client_apps_type');
            $table->index('email', 'idx_client_apps_email');
            $table->index('email_ci', 'idx_client_apps_email_ci');
            $table->index('national_id', 'idx_client_apps_national_id');

            // FK (optional but useful)
            $table->foreign('reviewed_by_staff_id', 'fk_client_apps_staffs')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->nullOnDelete();

            $table->foreign('approved_client_id', 'fk_client_apps_clients')
                ->references('client_id')->on('clients')
                ->cascadeOnUpdate()
                ->nullOnDelete();
        });

        // CHECK constraints
        DB::statement("
            ALTER TABLE client_applications
            ADD CONSTRAINT chk_client_apps_type
            CHECK (type IN ('individual', 'institution'));
        ");

        DB::statement("
            ALTER TABLE client_applications
            ADD CONSTRAINT chk_client_apps_status
            CHECK (status IN ('pending', 'approved', 'rejected'));
        ");

        // Unique email_ci for PENDING/ACTIVE applications only (soft delete excluded)
        // This prevents duplicate “pending registration” spam with same email.
        DB::statement("
            CREATE UNIQUE INDEX IF NOT EXISTS uq_client_apps_email_ci_pending
            ON client_applications (COALESCE(email_ci, LOWER(email)))
            WHERE deleted_at IS NULL AND status = 'pending';
        ");
    }

    public function down(): void
    {
        DB::statement("DROP INDEX IF EXISTS uq_client_apps_email_ci_pending;");
        DB::statement("ALTER TABLE client_applications DROP CONSTRAINT IF EXISTS chk_client_apps_type;");
        DB::statement("ALTER TABLE client_applications DROP CONSTRAINT IF EXISTS chk_client_apps_status;");

        Schema::table('client_applications', function (Blueprint $table) {
            $table->dropForeign('fk_client_apps_staffs');
            $table->dropForeign('fk_client_apps_clients');
        });

        Schema::dropIfExists('client_applications');
    }
};