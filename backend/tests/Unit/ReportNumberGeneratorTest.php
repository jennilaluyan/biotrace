<?php

namespace Tests\Unit;

use App\Services\ReportNumberGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ReportNumberGeneratorTest extends TestCase
{
    use RefreshDatabase;

    public function test_generates_number_in_expected_format_and_increments(): void
    {
        // arrange: pastikan counter row ada
        DB::table('report_counters')->updateOrInsert(
            ['counter_key' => ReportNumberGenerator::COUNTER_KEY],
            ['next_seq' => 1, 'updated_at' => now()]
        );

        $gen = new ReportNumberGenerator('UNSRAT-BML');

        // act
        $first = $gen->next();
        $second = $gen->next();

        // assert
        $year = now()->format('Y');
        $this->assertStringStartsWith($year . '/', $first);
        $this->assertStringEndsWith('/UNSRAT-BML', $first);

        $this->assertNotEquals($first, $second);

        // make sure counter advanced to 3
        $row = DB::table('report_counters')
            ->where('counter_key', ReportNumberGenerator::COUNTER_KEY)
            ->first();

        $this->assertEquals(3, (int) $row->next_seq);
    }
}
