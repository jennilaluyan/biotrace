<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ReagentRequestDraftSaveRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // role guard biasanya di middleware
    }

    public function rules(): array
    {
        return [
            'lo_id' => ['required', 'integer', 'exists:letters_of_order,lo_id'],

            'items' => ['sometimes', 'array'],
            'items.*.catalog_id' => ['required_with:items', 'integer', 'exists:consumables_catalog,catalog_id'],
            'items.*.qty' => ['required_with:items', 'numeric', 'min:0.000001'],
            'items.*.unit_text' => ['nullable', 'string', 'max:50'],
            'items.*.note' => ['nullable', 'string', 'max:500'],

            'bookings' => ['sometimes', 'array'],
            'bookings.*.booking_id' => ['nullable', 'integer'],
            'bookings.*.equipment_id' => ['required_with:bookings', 'integer', 'exists:equipment_catalog,equipment_id'],
            'bookings.*.planned_start_at' => ['required_with:bookings', 'date'],
            'bookings.*.planned_end_at' => ['required_with:bookings', 'date', 'after:bookings.*.planned_start_at'],
            'bookings.*.note' => ['nullable', 'string', 'max:500'],
        ];
    }
}
