<!doctype html>
<html lang="en">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>LOO Signature Verification</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 24px;
            color: #111;
        }

        .card {
            border: 1px solid #ddd;
            border-radius: 10px;
            padding: 18px;
            max-width: 720px;
        }

        .ok {
            color: #0a7a28;
            font-weight: bold;
        }

        .bad {
            color: #b00020;
            font-weight: bold;
        }

        .meta {
            margin-top: 12px;
            font-size: 14px;
        }

        .meta dt {
            font-weight: bold;
            margin-top: 10px;
        }

        .hash {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
            font-size: 12px;
            background: #f5f5f5;
            padding: 6px 8px;
            border-radius: 6px;
            display: inline-block;
        }

        .muted {
            color: #666;
            font-size: 13px;
        }
    </style>
</head>

<body>
    <div class="card">
        @if($valid)
            <div class="ok">✅ VALID SIGNATURE</div>
            <div class="muted">This QR code matches a signature record in the system.</div>

            <dl class="meta">
                <dt>Signature Hash</dt>
                <dd><span class="hash">{{ $hash }}</span></dd>

                <dt>Role</dt>
                <dd>{{ data_get($sig, 'role_code', '-') }}</dd>

                <dt>Signed At</dt>
                <dd>{{ optional(data_get($sig, 'signed_at'))->toDateTimeString() ?? '-' }}</dd>

                <dt>LOO Number</dt>
                <dd>{{ data_get($letter, 'number', '-') }}</dd>

                <dt>LOO Status</dt>
                <dd>{{ data_get($letter, 'loa_status', '-') }}</dd>

                <dt>Signer</dt>
                <dd>
                    @if($signer)
                        {{ $signer->full_name ?? ($signer->name ?? '-') }}
                        @if(!empty($signer->email))
                            <div class="muted">{{ $signer->email }}</div>
                        @endif
                    @else
                        -
                    @endif
                </dd>
            </dl>
        @else
            <div class="bad">❌ INVALID / NOT FOUND</div>
            <div class="muted">No signature record exists for this QR code.</div>

            <dl class="meta">
                <dt>Hash</dt>
                <dd><span class="hash">{{ $hash }}</span></dd>
            </dl>
        @endif
    </div>
</body>

</html>