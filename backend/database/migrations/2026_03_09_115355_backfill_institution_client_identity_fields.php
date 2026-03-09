<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            UPDATE clients
            SET name = institution_name
            WHERE type = 'institution'
              AND institution_name IS NOT NULL
              AND (name IS NULL OR TRIM(name) = '')
        ");

        DB::statement("
            UPDATE clients
            SET phone = contact_person_phone
            WHERE type = 'institution'
              AND contact_person_phone IS NOT NULL
              AND (phone IS NULL OR TRIM(phone) = '')
        ");

        DB::statement("
            UPDATE client_applications
            SET name = institution_name
            WHERE type = 'institution'
              AND institution_name IS NOT NULL
              AND (name IS NULL OR TRIM(name) = '')
        ");

        DB::statement("
            UPDATE client_applications
            SET phone = contact_person_phone
            WHERE type = 'institution'
              AND contact_person_phone IS NOT NULL
              AND (phone IS NULL OR TRIM(phone) = '')
        ");
    }

    public function down(): void
    {
        //
    }
};
