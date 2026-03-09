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
        $staff = Auth::user();

        if (!$staff instanceof Staff) {
            abort(500, 'Authenticated staff not found.');
        }

        $this->assertStaffRoleAllowed($staff, [
            'Administrator',
            'Operational Manager',
            'Laboratory Head',
        ]);

        return $staff;
    }

    private function humanizeAction(string $action): string
    {
        $text = strtolower(trim($action));
        $text = str_replace('_', ' ', $text);
        $text = preg_replace('/\s+/', ' ', $text) ?: $text;

        return ucwords($text);
    }

    private function pushEvent(array &$out, $at, string $title, ?string $actorName = null, ?string $note = null, ?array $meta = null): void
    {
        if (empty($at)) {
            return;
        }

        try {
            $iso = $at instanceof Carbon
                ? $at->toIso8601String()
                : Carbon::parse((string) $at)->toIso8601String();
        } catch (\Throwable $e) {
            $iso = (string) $at;
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
        if (!Schema::hasTable('audit_logs')) {
            return [];
        }

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

            if ($staffHasName) {
                $q->addSelect('st.name as staff_name');
            }

            if ($staffHasEmail) {
                $q->addSelect('st.email as staff_email');
            }
        }

        $q->where(function ($w) use ($sampleId, $hasSampleTests) {
            $w->where(function ($x) use ($sampleId) {
                $x->where('al.entity_name', 'samples')
                    ->where('al.entity_id', $sampleId);
            });

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

        foreach ($rows as $row) {
            $actor = null;

            if (!empty($row->staff_name)) {
                $actor = (string) $row->staff_name;
            } elseif (!empty($row->staff_email)) {
                $actor = (string) $row->staff_email;
            }

            $note = null;

            foreach (['new_values', 'old_values'] as $key) {
                $raw = $row->{$key} ?? null;

                if (!$raw) {
                    continue;
                }

                $arr = is_array($raw) ? $raw : json_decode((string) $raw, true);

                if (!is_array($arr)) {
                    continue;
                }

                $maybe = $arr['note'] ?? ($arr['_meta']['note'] ?? null);

                if ($maybe) {
                    $note = is_string($maybe) ? $maybe : json_encode($maybe);
                    break;
                }
            }

            $out[] = [
                'at' => (string) $row->timestamp,
                'title' => $this->humanizeAction((string) $row->action),
                'actor_name' => $actor,
                'note' => $note,
                'meta' => [
                    'entity_name' => $row->entity_name ?? null,
                    'entity_id' => $row->entity_id ?? null,
                    'staff_id' => $row->staff_id ?? null,
                ],
            ];
        }

        return $out;
    }

    private function buildTimeline(Sample $sample, array $detailData = []): array
    {
        $events = [];

        $this->pushEvent(
            $events,
            $sample->received_at ?? $sample->created_at ?? null,
            'Sample Received'
        );

        if (Schema::hasColumn('samples', 'admin_received_from_client_at')) {
            $this->pushEvent(
                $events,
                $sample->admin_received_from_client_at ?? null,
                'Admin Received From Client'
            );
        }

        if (Schema::hasColumn('samples', 'collector_intake_completed_at')) {
            $failed = $sample->relationLoaded('intakeChecklist')
                ? ($sample->intakeChecklist?->is_passed === false)
                : in_array(
                    strtolower((string) ($sample->request_status ?? '')),
                    ['inspection_failed', 'returned_to_admin', 'returned', 'rejected'],
                    true
                );

            $this->pushEvent(
                $events,
                $sample->collector_intake_completed_at ?? null,
                $failed
                    ? 'Sample Collector Completed Intake (Failed)'
                    : 'Sample Collector Completed Intake (Passed)'
            );
        }

        if (Schema::hasColumn('samples', 'collector_returned_to_admin_at')) {
            $this->pushEvent(
                $events,
                $sample->collector_returned_to_admin_at ?? null,
                'Sample Collector Returned Sample To Admin'
            );
        }

        if (Schema::hasColumn('samples', 'admin_received_from_collector_at')) {
            $this->pushEvent(
                $events,
                $sample->admin_received_from_collector_at ?? null,
                'Admin Received Sample Back From Sample Collector'
            );
        }

        if (
            Schema::hasColumn('samples', 'request_returned_at') &&
            in_array(strtolower((string) ($sample->request_status ?? '')), ['returned', 'rejected'], true)
        ) {
            $this->pushEvent(
                $events,
                $sample->request_returned_at ?? null,
                'Admin Notified Client To Pick Up Sample',
                null,
                $sample->request_return_note
            );
        }

        if (Schema::hasColumn('samples', 'client_picked_up_at')) {
            $this->pushEvent(
                $events,
                $sample->client_picked_up_at ?? null,
                'Client Picked Up Sample'
            );
        }

        if (Schema::hasColumn('samples', 'sc_delivered_to_analyst_at')) {
            $this->pushEvent(
                $events,
                $sample->sc_delivered_to_analyst_at ?? null,
                'Delivered To Analyst'
            );
        }

        if (Schema::hasColumn('samples', 'analyst_received_at')) {
            $this->pushEvent(
                $events,
                $sample->analyst_received_at ?? null,
                'Analyst Received'
            );
        }

        if (Schema::hasColumn('samples', 'crosschecked_at')) {
            $status = Schema::hasColumn('samples', 'crosscheck_status')
                ? (string) ($sample->crosscheck_status ?? '')
                : '';

            $title = $status
                ? 'Crosscheck ' . ucfirst(strtolower($status))
                : 'Crosscheck';

            $this->pushEvent($events, $sample->crosschecked_at ?? null, $title);
        }

        $loAt = $detailData['lo_generated_at'] ?? ($sample->lo_generated_at ?? null);
        $this->pushEvent($events, $loAt, 'LOO Generated');

        $coaAt = $detailData['coa_generated_at'] ?? ($sample->coa_generated_at ?? null);
        $this->pushEvent($events, $coaAt, 'COA Generated');

        if (Schema::hasColumn('samples', 'archived_at')) {
            $this->pushEvent(
                $events,
                $sample->archived_at ?? $sample->client_picked_up_at ?? null,
                'Archived'
            );
        }

        $audit = $this->fetchAuditTimeline((int) $sample->sample_id);
        $events = array_merge($events, $audit);

        $seen = [];
        $events = array_values(array_filter($events, function ($event) use (&$seen) {
            $key = ($event['at'] ?? '') . '|' . ($event['title'] ?? '') . '|' . ($event['actor_name'] ?? '');

            if (isset($seen[$key])) {
                return false;
            }

            $seen[$key] = true;

            return true;
        }));

        usort($events, function ($a, $b) {
            return strtotime((string) ($a['at'] ?? '')) <=> strtotime((string) ($b['at'] ?? ''));
        });

        return $events;
    }

    private function isFailedRequestArchiveCandidate(Sample $sample): bool
    {
        $requestStatus = strtolower((string) ($sample->request_status ?? ''));

        if (!in_array($requestStatus, ['returned', 'rejected'], true)) {
            return false;
        }

        if (!empty($sample->lab_sample_code)) {
            return false;
        }

        if (empty($sample->client_picked_up_at)) {
            return false;
        }

        if ($sample->relationLoaded('intakeChecklist') && $sample->intakeChecklist?->is_passed === true) {
            return false;
        }

        return true;
    }

    private function toFailedRequestArchiveRow(Sample $sample): array
    {
        return [
            'archive_kind' => 'failed_requests',
            'sample_id' => (int) $sample->sample_id,
            'lab_sample_code' => null,
            'workflow_group' => $sample->workflow_group,
            'sample_type' => $sample->sample_type,
            'scheduled_delivery_at' => $sample->scheduled_delivery_at,
            'client_id' => $sample->client_id,
            'client_name' => $sample->client?->name,
            'request_status' => $sample->request_status,
            'request_return_note' => $sample->request_return_note,
            'collector_intake_completed_at' => $sample->collector_intake_completed_at,
            'collector_returned_to_admin_at' => $sample->collector_returned_to_admin_at,
            'admin_received_from_collector_at' => $sample->admin_received_from_collector_at,
            'client_picked_up_at' => $sample->client_picked_up_at,
            'archived_at' => $sample->archived_at ?? $sample->client_picked_up_at,
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $this->requireArchiveAccess();

        $perPage = (int) $request->query('per_page', 15);
        if ($perPage < 1) {
            $perPage = 15;
        }
        if ($perPage > 100) {
            $perPage = 100;
        }

        $q = trim((string) $request->query('q', ''));
        $kind = trim((string) $request->query('kind', 'reported'));

        if ($kind === 'failed_requests') {
            $query = Sample::query()
                ->with(['client', 'requestedParameters', 'intakeChecklist.checker'])
                ->whereNull('lab_sample_code');

            if (Schema::hasColumn('samples', 'client_picked_up_at')) {
                $query->whereNotNull('client_picked_up_at');
            }

            if (Schema::hasColumn('samples', 'request_status')) {
                $query->whereIn('request_status', ['returned', 'rejected']);
            }

            if ($q !== '') {
                $like = "%{$q}%";
                $driver = Schema::getConnection()->getDriverName();
                $op = $driver === 'pgsql' ? 'ILIKE' : 'LIKE';

                $query->where(function ($w) use ($q, $like, $op) {
                    $w->where('sample_type', $op, $like)
                        ->orWhere('request_status', $op, $like);

                    if (ctype_digit($q)) {
                        $w->orWhere('sample_id', (int) $q);
                    }

                    $w->orWhereHas('client', function ($c) use ($op, $like) {
                        $c->where('name', $op, $like)
                            ->orWhere('email', $op, $like);
                    });
                });
            }

            $orderCol = Schema::hasColumn('samples', 'archived_at')
                ? 'archived_at'
                : 'client_picked_up_at';

            $rows = $query
                ->orderByDesc($orderCol)
                ->orderByDesc('sample_id')
                ->paginate($perPage);

            return response()->json([
                'data' => collect($rows->items())
                    ->map(fn(Sample $sample) => $this->toFailedRequestArchiveRow($sample))
                    ->values()
                    ->all(),
                'meta' => [
                    'current_page' => $rows->currentPage(),
                    'last_page' => $rows->lastPage(),
                    'per_page' => $rows->perPage(),
                    'total' => $rows->total(),
                ],
            ]);
        }

        $result = $this->svc->paginate([
            'q' => $q,
            'per_page' => $perPage,
        ]);

        return response()->json($result);
    }

    public function show(Request $request, int $sampleId): JsonResponse
    {
        $this->requireArchiveAccess();

        $kind = trim((string) $request->query('kind', 'reported'));

        $sample = Sample::query()
            ->with(['client', 'requestedParameters', 'intakeChecklist.checker'])
            ->findOrFail($sampleId);

        if ($kind === 'failed_requests') {
            if (!$this->isFailedRequestArchiveCandidate($sample)) {
                abort(404, 'Not found.');
            }

            $dataArr = $this->toFailedRequestArchiveRow($sample);
            $dataArr['sample'] = $sample;
            $dataArr['client'] = $sample->client;
            $dataArr['requested_parameters'] = $sample->requestedParameters
                ->map(fn($p) => [
                    'parameter_id' => (int) $p->parameter_id,
                    'code' => $p->code ?? null,
                    'name' => $p->name ?? null,
                    'unit' => $p->unit ?? null,
                ])
                ->values()
                ->all();
            $dataArr['intake_checklist'] = $sample->intakeChecklist;
            $dataArr['timeline'] = $this->buildTimeline($sample, $dataArr);

            return response()->json(['data' => $dataArr]);
        }

        if (Schema::hasColumn('samples', 'current_status')) {
            if ((string) ($sample->current_status ?? '') !== 'reported') {
                abort(404, 'Not found.');
            }
        }

        $data = $this->svc->detail($sample);
        $dataArr = is_array($data) ? $data : (array) $data;
        $dataArr['timeline'] = $this->buildTimeline($sample, $dataArr);

        return response()->json(['data' => $dataArr]);
    }
}
