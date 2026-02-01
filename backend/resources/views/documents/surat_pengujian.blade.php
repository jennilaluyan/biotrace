@extends('reports.coa.layout')

@section('content')
    @php
        $number = $loo->number ?? data_get($payload, 'loo_number', data_get($payload, 'loa_number', '-'));
        $today = \Illuminate\Support\Carbon::now();
        $year = $today->format('Y');

        $clientName = data_get($client, 'name', data_get($payload, 'client.name', '-'));
        $clientOrg = data_get($client, 'organization', data_get($payload, 'client.organization', '-'));

        $items = $items ?? data_get($payload, 'items', []);
        if (!is_array($items))
            $items = [];

        // ✅ Step 9 — signature status (checkbox indicator)
        $sigByRole = [];
        if (isset($loo) && isset($loo->signatures)) {
            try {
                foreach ($loo->signatures as $s) {
                    $sigByRole[strtoupper((string) data_get($s, 'role_code', ''))] = $s;
                }
            } catch (\Throwable $e) {
                // ignore
            }
        }
        $omSigned = !empty(data_get($sigByRole, 'OM.signed_at'));
        $lhSigned = !empty(data_get($sigByRole, 'LH.signed_at'));

        $makeQr = function (?string $payload): ?string {
            try {
                $payload = $payload ? trim($payload) : '';
                if ($payload === '')
                    return null;

                if (class_exists(\SimpleSoftwareIO\QrCode\Facades\QrCode::class)) {
                    $png = \SimpleSoftwareIO\QrCode\Facades\QrCode::format('png')
                        ->size(110)->margin(1)->generate($payload);
                    return 'data:image/png;base64,' . base64_encode($png);
                }
            } catch (\Throwable $e) {
                // ignore
            }
            return null;
        };

        // Build verification URL (audit-friendly) from signature_hash
        $omHash = (string) data_get($sigByRole, 'OM.signature_hash', '');
        $lhHash = (string) data_get($sigByRole, 'LH.signature_hash', '');

        $omVerifyUrl = $omHash !== '' ? url("/api/v1/loo/signatures/verify/{$omHash}") : null;
        $lhVerifyUrl = $lhHash !== '' ? url("/api/v1/loo/signatures/verify/{$lhHash}") : null;

        $omQr = $makeQr($omVerifyUrl);
        $lhQr = $makeQr($lhVerifyUrl);

    @endphp

    <style>
        body {
            font-family: Arial, sans-serif;
            font-size: 11px;
            line-height: 1.25;
            color: #000;
        }

        .title {
            text-align: center;
            font-weight: bold;
            margin: 16px 0 10px;
            font-size: 15px;
        }

        .muted {
            font-size: 10px;
        }

        .line {
            border-top: 1px solid #000;
            margin: 10px 0;
        }

        .meta td {
            padding: 2px 0;
            vertical-align: top;
        }

        .table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }

        .table th,
        .table td {
            border: 1px solid #000;
            padding: 6px;
            vertical-align: top;
        }

        .table th {
            text-align: center;
            font-weight: bold;
        }

        .sign-row {
            margin-top: 22px;
            width: 100%;
        }

        .sign-col {
            width: 50%;
            text-align: center;
            vertical-align: top;
        }

        .sig-box {
            height: 72px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .sig-name {
            margin-top: 6px;
            font-weight: bold;
        }

        .sig-role {
            margin-top: 2px;
            font-size: 10px;
        }

        .qr-ph {
            width: 110px;
            height: 110px;
            border: 1px dashed #333;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 9px;
        }

        .checkbox {
            font-size: 12px;
            margin-bottom: 4px;
        }
    </style>

    <table class="header-table" width="100%" cellspacing="0" cellpadding="0">
        <tr>
            <td width="15%" align="left">
                <img src="{{ public_path('logo-unsrat.png') }}" style="height:80px;">
            </td>
            <td width="70%" align="center">
                <div style="font-size:20px; font-weight:bold; letter-spacing: 1px;">LABORATORIUM BIOMOLEKULER</div>
                <div style="font-size:18px; font-weight:bold;">UNIVERSITAS SAM RATULANGI</div>
                <div style="font-size:12px; font-weight:bold;">SAM RATULANGI UNIVERSITY</div>
                <div style="font-size:12px; font-weight:bold;">BIOMOLECULAR LABORATORY</div>
            </td>
            <td width="15%"></td>
        </tr>
    </table>

    <div style="background-color:#b30000;height:3px;margin-top:5px;"></div>

    <table width="100%" style="font-size: 8.5px; margin-top: 2px; border-bottom: 1px solid black; padding-bottom: 2px;">
        <tr>
            <td width="75%">
                Jalan Kampus Universitas Sam Ratulangi Manado 95115 &nbsp; Telepon 0813 4396 6554 &nbsp;
                E-mail labbiomolekuler@unsrat.ac.id &nbsp; Laman http://biomolekuler.unsrat.ac.id/
            </td>
            <td width="25%" align="right">
                <b>No. Rekaman : REK/LAB-BM/ADM/25/</b>
            </td>
        </tr>
    </table>

    <div class="title">
        SURAT PERINTAH PENGUJIAN SAMPEL<br>
        <span class="muted">No. {{ $number }}</span>
    </div>

    <table class="meta" width="100%">
        <tr>
            <td width="18%">Pelanggan</td>
            <td width="2%">:</td>
            <td>{{ $clientName }}</td>
        </tr>
        <tr>
            <td>Instansi</td>
            <td>:</td>
            <td>{{ $clientOrg }}</td>
        </tr>
        <tr>
            <td style="width: 180px;">Tanggal Dokumen</td>
            <td>{{ \Carbon\Carbon::now()->translatedFormat('d F Y') }}</td>
        </tr>
        <tr>
            <td style="width: 180px;">Tanggal Penerimaan</td>
            <td>
                @php
                    $rx = data_get($payload ?? [], 'received_at', null);
                @endphp

                @if($rx)
                    {{ \Carbon\Carbon::parse($rx)->translatedFormat('d F Y') }}
                @else
                    -
                @endif
            </td>
        </tr>
    </table>

    <div class="line"></div>

    <table class="table">
        <thead>
            <tr>
                <th width="6%">No</th>
                <th width="22%">Kode Sampel</th>
                <th>Parameter Uji</th>
            </tr>
        </thead>
        <tbody>
            @forelse ($items as $row)
                @php
                    $no = data_get($row, 'no', '-');
                    $code = data_get($row, 'lab_sample_code', '-');
                    $params = data_get($row, 'parameters', []);
                    if (!is_array($params))
                        $params = [];
                @endphp
                <tr>
                    <td align="center">{{ $no }}</td>
                    <td>{{ $code }}</td>
                    <td>
                        @if (count($params) === 0)
                            -
                        @else
                            @foreach ($params as $p)
                                @php
                                    $pCode = data_get($p, 'code', '');
                                    $pName = data_get($p, 'name', '');
                                @endphp
                                <div>- {{ trim($pCode . ' ' . $pName) }}</div>
                            @endforeach
                        @endif
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="3" align="center">No items selected.</td>
                </tr>
            @endforelse
        </tbody>
    </table>

    <table class="sign-row" width="100%" cellspacing="0" cellpadding="0">
        <tr>
            <td class="sign-col">
                <div class="sig-name">OPERATIONAL MANAGER</div>

                <div class="checkbox">
                    {!! $omSigned ? '&#9745;' : '&#9744;' !!} <span style="font-weight:normal;">Signed</span>
                </div>

                <div class="sig-box">
                    @if ($omQr)
                        <img src="{{ $omQr }}" style="width:110px;height:110px;" />
                    @else
                        <div class="qr-ph">OM QR</div>
                    @endif
                </div>
                <div class="sig-role">( OM )</div>
            </td>

            <td class="sign-col">
                <div class="sig-name">LABORATORY HEAD</div>

                <div class="checkbox">
                    {!! $lhSigned ? '&#9745;' : '&#9744;' !!} <span style="font-weight:normal;">Signed</span>
                </div>

                <div class="sig-box">
                    @if ($lhQr)
                        <img src="{{ $lhQr }}" style="width:110px;height:110px;" />
                    @else
                        <div class="qr-ph">LH QR</div>
                    @endif
                </div>
                <div class="sig-role">( LH )</div>
            </td>
        </tr>
    </table>
@endsection