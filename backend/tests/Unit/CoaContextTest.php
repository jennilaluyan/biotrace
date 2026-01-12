<?php

namespace Tests\Unit;

use App\Models\Client;
use App\Support\CoaContext;
use Tests\TestCase;

class CoaContextTest extends TestCase
{
    public function test_resolve_client_type_individual(): void
    {
        $c = new Client();
        $c->type = 'individual';

        $this->assertSame('individual', CoaContext::resolveClientType($c));
    }

    public function test_resolve_client_type_institution(): void
    {
        $c = new Client();
        $c->type = 'institution';

        $this->assertSame('institution', CoaContext::resolveClientType($c));
    }

    public function test_default_template_key_mapping(): void
    {
        $this->assertSame('institution_v1', CoaContext::resolveDefaultTemplateKey('institution'));
        $this->assertSame('individual', CoaContext::resolveDefaultTemplateKey('individual'));
    }
}
