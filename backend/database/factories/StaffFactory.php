<?php

namespace Database\Factories;

use App\Models\Staff;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class StaffFactory extends Factory
{
    protected $model = Staff::class;

    public function definition(): array
    {
        return [
            'name' => $this->faker->name(),
            'email' => $this->faker->unique()->safeEmail(),

            // IMPORTANT: kolom kamu namanya password_hash dan NOT NULL
            'password_hash' => Hash::make('password'),

            // sesuaikan kalau role_id default kamu beda
            'role_id' => 4,

            'is_active' => true,
        ];
    }

    /**
     * Optional helpers (kalau kamu suka rapihin test)
     */
    public function inactive(): static
    {
        return $this->state(fn() => ['is_active' => false]);
    }

    public function role(int $roleId): static
    {
        return $this->state(fn() => ['role_id' => $roleId]);
    }
}
