<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ParameterRequest
 *
 * Represents a create/update request for a Parameter master-data record.
 *
 * Business rule:
 * - Admin/Analyst submit CREATE/UPDATE requests.
 * - OM/LH approve/reject.
 * - Requester must acknowledge decided requests (approved/rejected) before they disappear
 *   from requester inbox (requester_ack_at).
 */
class ParameterRequest extends Model
{
    use HasFactory;

    public const TYPE_CREATE = 'create';
    public const TYPE_UPDATE = 'update';

    public const STATUS_PENDING = 'pending';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';

    protected $table = 'parameter_requests';

    public $timestamps = true;

    /**
     * NOTE:
     * payload is used only for TYPE_UPDATE and contains proposed changes.
     *
     * Example payload:
     *  {
     *    "name": "New name",
     *    "workflow_group": "pcr" | null,
     *    "status": "Active" | "Inactive",
     *    "tag": "Routine" | "Research"
     *  }
     */
    protected $fillable = [
        // routing
        'request_type',
        'parameter_id',
        'payload',

        // display & context
        'parameter_name',
        'category',
        'reason',

        // requester read receipt
        'requester_ack_at',

        // decision
        'status',
        'requested_by',
        'requested_at',
        'decided_by',
        'decided_at',
        'decision_note',
        'approved_parameter_id',
    ];

    protected $casts = [
        'requested_at' => 'datetime',
        'decided_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'requester_ack_at' => 'datetime',

        'approved_parameter_id' => 'integer',
        'requested_by' => 'integer',
        'decided_by' => 'integer',
        'parameter_id' => 'integer',

        // update proposal payload
        'payload' => 'array',
    ];

    public function requester(): BelongsTo
    {
        return $this->belongsTo(Staff::class, 'requested_by', 'staff_id');
    }

    public function decider(): BelongsTo
    {
        return $this->belongsTo(Staff::class, 'decided_by', 'staff_id');
    }

    public function approvedParameter(): BelongsTo
    {
        return $this->belongsTo(Parameter::class, 'approved_parameter_id', 'parameter_id');
    }

    public function targetParameter(): BelongsTo
    {
        return $this->belongsTo(Parameter::class, 'parameter_id', 'parameter_id');
    }

    public function isPending(): bool
    {
        return (string) $this->status === self::STATUS_PENDING;
    }

    public function isDecided(): bool
    {
        return !$this->isPending();
    }

    public function isCreateRequest(): bool
    {
        return (string) $this->request_type === self::TYPE_CREATE;
    }

    public function isUpdateRequest(): bool
    {
        return (string) $this->request_type === self::TYPE_UPDATE;
    }

    public function needsRequesterAck(): bool
    {
        return $this->isDecided() && !$this->requester_ack_at;
    }
}
