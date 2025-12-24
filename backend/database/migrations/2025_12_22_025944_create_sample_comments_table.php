<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sample_comments', function (Blueprint $table) {
            $table->bigIncrements('comment_id');

            $table->unsignedBigInteger('sample_id');
            $table->unsignedBigInteger('staff_id'); // author (Lab Head)

            $table->text('body');

            // snapshot status saat komentar dibuat (mis: in_progress)
            $table->string('status_snapshot', 20);

            // target role(s) yang boleh melihat komentar ini (json array of role_id)
            // Postgres: jsonb recommended
            $table->jsonb('visible_to_role_ids');

            $table->timestampTz('created_at')->useCurrent();

            $table->index('sample_id', 'idx_sample_comments_sample');
            $table->index('staff_id', 'idx_sample_comments_staff');
            $table->index('status_snapshot', 'idx_sample_comments_status');

            $table->foreign('sample_id', 'fk_sample_comments_sample')
                ->references('sample_id')->on('samples')
                ->cascadeOnUpdate()
                ->cascadeOnDelete();

            $table->foreign('staff_id', 'fk_sample_comments_staff')
                ->references('staff_id')->on('staffs')
                ->cascadeOnUpdate()
                ->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('sample_comments', function (Blueprint $table) {
            $table->dropForeign('fk_sample_comments_sample');
            $table->dropForeign('fk_sample_comments_staff');
            $table->dropIndex('idx_sample_comments_sample');
            $table->dropIndex('idx_sample_comments_staff');
            $table->dropIndex('idx_sample_comments_status');
        });

        Schema::dropIfExists('sample_comments');
    }
};