<?php

namespace App\Http\Controllers;

use App\Models\Sample;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

class SampleRequestQueueController extends Controller
{
    /**
     * GET /api/v1/samples/requests
     * Backoffice queue:
     * - ONLY non-draft (client draft is private)
     * - ONLY requests (no lab_sample_code yet)
     * - supports q + request_status/status + date filter (today/7d/30d)
     */
    public function index(Request $request): JsonResponse
    {
        $q = trim((string) $request->get('q', ''));
        // ✅ frontend sends request_status; keep backward compatibility with status
        $status = trim((string) ($request->get('request_status', $request->get('status', ''))));
        $date = trim((string) $request->get('date', ''));

        $query = Sample::query()->with(['client', 'requestedParameters']);

        // ✅ Queue = request yang belum punya lab_sample_code
        if (Schema::hasColumn('samples', 'lab_sample_code')) {
            $query->whereNull('lab_sample_code');
        }

        // Draft is client-private
        if (Schema::hasColumn('samples', 'request_status')) {
            $query->where(function ($w) {
                $w->whereNull('request_status')
                    ->orWhere('request_status', '!=', 'draft');
            });
        }

        if ($status !== '') {
            if (Schema::hasColumn('samples', 'request_status')) {
                $query->where('request_status', $status);
            }
        }

        // Date filter: prefer submitted_at, else created_at, else sample_id as fallback (no filter)
        if ($date !== '') {
            $now = Carbon::now();
            $from = null;

            if ($date === 'today') {
                $from = $now->copy()->startOfDay();
            } elseif ($date === '7d') {
                $from = $now->copy()->subDays(7);
            } elseif ($date === '30d') {
                $from = $now->copy()->subDays(30);
            }

            if ($from) {
                if (Schema::hasColumn('samples', 'submitted_at')) {
                    $query->where('submitted_at', '>=', $from);
                } elseif (Schema::hasColumn('samples', 'created_at')) {
                    $query->where('created_at', '>=', $from);
                }
            }
        }

        if ($q !== '') {
            $like = "%{$q}%";

            $query->where(function ($w) use ($like) {
                // Database-agnostic search (avoid ILIKE hard dependency)
                $driver = Schema::getConnection()->getDriverName();
                $op = $driver === 'pgsql' ? 'ILIKE' : 'LIKE';

                $w->where('sample_type', $op, $like)
                    ->orWhere('request_status', $op, $like)
                    ->orWhere('lab_sample_code', $op, $like);

                // client name/email
                if (method_exists(Sample::class, 'client')) {
                    $w->orWhereHas('client', function ($c) use ($op, $like) {
                        $c->where('name', $op, $like)->orWhere('email', $op, $like);
                    });
                }
            });
        }

        $rows = $query->orderByDesc('sample_id')->paginate(15);

        $items = collect($rows->items())->map(function ($s) {
            // $s adalah Sample model (karena paginate dari Eloquent)
            $arr = $s->toArray();

            $arr['client_name']  = $s->client?->name ?? null;
            $arr['client_email'] = $s->client?->email ?? null;

            return $arr;
        })->values()->all();

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $rows->currentPage(),
                'last_page' => $rows->lastPage(),
                'per_page' => $rows->perPage(),
                'total' => $rows->total(),
            ],
        ]);
    }
}