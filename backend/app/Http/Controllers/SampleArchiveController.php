<?php

namespace App\Http\Controllers;

use App\Models\Sample;
use App\Models\Staff;
use App\Services\SampleArchiveService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SampleArchiveController extends Controller
{
    public function __construct(private readonly SampleArchiveService $svc) {}

    private function assertStaffRoleAllowed(Staff $staff, array $allowedRoleNames): void
    {
        $roleName = (string) ($staff->role?->name ?? '');

        if (!in_array($roleName, $allowedRoleNames, true)) {
            abort(403, 'Forbidden.');
        }
    }

    private function requireArchiveAccess(): Staff
    {
        /** @var Staff $staff */
        $staff = Auth::user();
        if (!$staff instanceof Staff) {
            abort(500, 'Authenticated staff not found.');
        }

        // ✅ Only Admin / OM / LH (pakai role name agar tidak tergantung role_id)
        $this->assertStaffRoleAllowed($staff, [
            'Administrator',
            'Operational Manager',
            'Laboratory Head',
        ]);

        return $staff;
    }

    private function humanizeAction(string $action): string
    {
        $s = strtolower(trim($action));
        $s = str_replace('_', ' ', $s);
        $s = preg_replace('/\s+/', ' ', $s) ?: $s;
        return ucwords($s);
    }

    private function pushEvent(array &$out, $at, string $title, ?string $actorName = null, ?string $note = null, ?array $meta = null): void
    {
        if (empty($at)) return;

        try {
            $iso = $at instanceof Carbon ? $at->toIso8601String() : Carbon::parse((string) $at)->toIso8601String();
        } catch (\Throwable $e) {
            $iso = (string) $at; // fallback (still sortable-ish on FE)
        }

        $out[] = [
            'at' => $iso,
            'title' => $title,
            'actor_name' => $actorName,
            'note' => $note,
            'meta' => $meta,
        ];
    }

    private function fetchAuditTimeline(int $sampleId): array
    {
        if (!Schema::hasTable('audit_logs')) return [];

        $hasStaffs = Schema::hasTable('staffs') && Schema::hasColumn('staffs', 'staff_id');
        $staffHasName = $hasStaffs && Schema::hasColumn('staffs', 'name');
        $staffHasEmail = $hasStaffs && Schema::hasColumn('staffs', 'email');

        $hasSampleTests =
            Schema::hasTable('sample_tests') &&
            Schema::hasColumn('sample_tests', 'sample_test_id') &&
            Schema::hasColumn('sample_tests', 'sample_id');

        $q = DB::table('audit_logs as al')
            ->select([
                'al.timestamp',
                'al.action',
                'al.entity_name',
                'al.entity_id',
                'al.staff_id',
                'al.old_values',
                'al.new_values',
            ]);

        if ($hasStaffs) {
            $q->leftJoin('staffs as st', 'st.staff_id', '=', 'al.staff_id');
            if ($staffHasName) $q->addSelect('st.name as staff_name');
            if ($staffHasEmail) $q->addSelect('st.email as staff_email');
        }

        $q->where(function ($w) use ($sampleId, $hasSampleTests) {
            // logs langsung untuk sample
            $w->where(function ($x) use ($sampleId) {
                $x->where('al.entity_name', 'samples')
                    ->where('al.entity_id', $sampleId);
            });

            // logs untuk sample_test yang terkait sample ini
            if ($hasSampleTests) {
                $w->orWhere(function ($x) use ($sampleId) {
                    $x->where('al.entity_name', 'sample_test')
                        ->whereIn('al.entity_id', function ($sub) use ($sampleId) {
                            $sub->from('sample_tests')
                                ->select('sample_test_id')
                                ->where('sample_id', $sampleId);
                        });
                });
            }
        });

        $rows = $q->orderBy('al.timestamp', 'asc')->limit(300)->get();

        $out = [];
        foreach ($rows as $r) {
            $actor = null;

            $name = $r->staff_name ?? null;
            $email = $r->staff_email ?? null;
            if ($name) $actor = (string) $name;
            elseif ($email) $actor = (string) $email;

            $note = null;
            // ambil note kalau ada di JSON old/new
            foreach (['new_values', 'old_values'] as $k) {
                $raw = $r->{$k} ?? null;
                if (!$raw) continue;

                $arr = is_array($raw) ? $raw : json_decode((string) $raw, true);
                if (is_array($arr)) {
                    $maybe = $arr['note'] ?? ($arr['_meta']['note'] ?? null);
                    if ($maybe) {
                        $note = is_string($maybe) ? $maybe : json_encode($maybe);
                        break;
                    }
                }
            }

            $out[] = [
                'at' => (string) $r->timestamp,
                'title' => $this->humanizeAction((string) $r->action),
                'actor_name' => $actor,
                'note' => $note,
                'meta' => [
                    'entity_name' => $r->entity_name ?? null,
                    'entity_id' => $r->entity_id ?? null,
                    'staff_id' => $r->staff_id ?? null,
                ],
            ];
        }

        return $out;
    }

    private function buildTimeline(Sample $sample, array $detailData = []): array
    {
        $events = [];

        // --- 1) Synthetic timeline (always available)
        $this->pushEvent(
            $events,
            $sample->received_at ?? $sample->created_at ?? null,
            'Sample Received'
        );

        // Physical workflow timestamps (best-effort)
        if (Schema::hasColumn('samples', 'admin_received_from_client_at')) {
            $this->pushEvent($events, $sample->admin_received_from_client_at ?? null, 'Admin Received From Client');
        }
        if (Schema::hasColumn('samples', 'sc_delivered_to_analyst_at')) {
            $this->pushEvent($events, $sample->sc_delivered_to_analyst_at ?? null, 'Delivered To Analyst');
        }
        if (Schema::hasColumn('samples', 'analyst_received_at')) {
            $this->pushEvent($events, $sample->analyst_received_at ?? null, 'Analyst Received');
        }

        // Crosscheck
        if (Schema::hasColumn('samples', 'crosschecked_at')) {
            $status = Schema::hasColumn('samples', 'crosscheck_status')
                ? (string) ($sample->crosscheck_status ?? '')
                : '';
            $title = $status ? ('Crosscheck ' . ucfirst(strtolower($status))) : 'Crosscheck';
            $this->pushEvent($events, $sample->crosschecked_at ?? null, $title);
        }

        // LOO & COA from detail payload (lebih akurat)
        $loAt = $detailData['lo_generated_at'] ?? ($sample->lo_generated_at ?? null);
        $this->pushEvent($events, $loAt, 'LOO Generated');

        $coaAt = $detailData['coa_generated_at'] ?? ($sample->coa_generated_at ?? null);
        $this->pushEvent($events, $coaAt, 'COA Generated');

        // Archived
        if (Schema::hasColumn('samples', 'archived_at')) {
            $this->pushEvent($events, $sample->archived_at ?? null, 'Archived');
        }

        // --- 2) Audit timeline (if exists)
        $audit = $this->fetchAuditTimeline((int) $sample->sample_id);
        $events = array_merge($events, $audit);

        // --- 3) Dedupe + sort ascending
        $seen = [];
        $events = array_values(array_filter($events, function ($e) use (&$seen) {
            $k = ($e['at'] ?? '') . '|' . ($e['title'] ?? '') . '|' . ($e['actor_name'] ?? '');
            if (isset($seen[$k])) return false;
            $seen[$k] = true;
            return true;
        }));

        usort($events, function ($a, $b) {
            return strtotime((string) ($a['at'] ?? '')) <=> strtotime((string) ($b['at'] ?? ''));
        });

        return $events;
    }

    /**
     * GET /v1/sample-archive
     * Query:
     * - q?: string (search lab code / client name / coa/report no)
     * - per_page?: int (default 15)
     * - page?: int (default 1)
     */
    public function index(Request $request): JsonResponse
    {
        $this->requireArchiveAccess();

        $perPage = (int) $request->query('per_page', 15);
        if ($perPage < 1) $perPage = 15;
        if ($perPage > 100) $perPage = 100;

        $q = trim((string) $request->query('q', ''));

        $result = $this->svc->paginate([
            'q' => $q,
            'per_page' => $perPage,
        ]);

        return response()->json($result);
    }

    /**
     * GET /v1/sample-archive/{sampleId}
     */
    public function show(Request $request, int $sampleId): JsonResponse
    {
        $this->requireArchiveAccess();

        $sample = Sample::query()
            ->with(['client', 'requestedParameters'])
            ->findOrFail($sampleId);

        // ✅ Only archived/reported sample can be viewed here
        if (Schema::hasColumn('samples', 'current_status')) {
            if ((string) ($sample->current_status ?? '') !== 'reported') {
                abort(404, 'Not found.');
            }
        }

        $data = $this->svc->detail($sample);

        // ✅ ensure $data array (service biasanya array, tapi kita guard)
        $dataArr = is_array($data) ? $data : (array) $data;

        // ✅ attach timeline (key yg FE pasti baca)
        $dataArr['timeline'] = $this->buildTimeline($sample, $dataArr);

        return response()->json(['data' => $dataArr]);
    }
}