@extends('reports.coa.layout')

@section('content')
    @php
        $number = $loo->number ?? data_get($payload, 'loo_number', data_get($payload, 'loa_number', '-'));

        $clientName = data_get($client, 'name', data_get($payload, 'client.name', '-'));
        $clientOrg = data_get($client, 'organization', data_get($payload, 'client.organization', '-'));

        $items = $items ?? data_get($payload, 'items', []);
        if (!is_array($items))
            $items = [];

        // --- Signatures map (role_code => signature model/array) ---
        $sigByRole = [];
        if (isset($loo) && isset($loo->signatures)) {
            try {
                foreach ($loo->signatures as $s) {
                    $k = strtoupper(trim((string) data_get($s, 'role_code', '')));
                    if ($k !== '')
                        $sigByRole[$k] = $s;
                }
            } catch (\Throwable $e) {
                // ignore
            }
        }

        // alias-safe role picking
        $pickSig = function (array $roleCandidates) use ($sigByRole) {
            foreach ($roleCandidates as $rc) {
                $k = strtoupper(trim((string) $rc));
                if ($k !== '' && isset($sigByRole[$k]))
                    return $sigByRole[$k];
            }
            return null;
        };

        $omSig = $pickSig(['OM', 'OPERATIONAL_MANAGER', 'OP_MANAGER', 'MANAGER_OPERASIONAL', 'MANAGER_OPS']);
        $lhSig = $pickSig(['LH', 'LABORATORY_HEAD', 'LAB_HEAD', 'KEPALA_LAB', 'HEAD_OF_LAB']);

        $omHash = trim((string) data_get($omSig, 'signature_hash', ''));
        $lhHash = trim((string) data_get($lhSig, 'signature_hash', ''));

        // Verification URL (existing backend endpoint)
        $omVerifyUrl = $omHash !== '' ? url("/api/v1/loo/signatures/verify/{$omHash}") : null;
        $lhVerifyUrl = $lhHash !== '' ? url("/api/v1/loo/signatures/verify/{$lhHash}") : null;

        /**
         * DOMPDF-safe QR:
         * 1) Try PNG via SimpleSoftwareIO (needs GD/Imagick)
         * 2) Fallback SVG via SimpleSoftwareIO (embed as data:image/svg+xml;base64)
         * 3) Fallback BaconQrCode -> SVG backend (embed)
         *
         * return: data-uri string or null
         */
        $makeQrDataUri = function (?string $payload): ?string {
            $payload = $payload ? trim($payload) : '';
            if ($payload === '')
                return null;

            // 1) Try PNG
            try {
                if (class_exists(\SimpleSoftwareIO\QrCode\Facades\QrCode::class)) {
                    $png = \SimpleSoftwareIO\QrCode\Facades\QrCode::format('png')
                        ->size(110)->margin(1)->generate($payload);

                    if (is_string($png) && $png !== '') {
                        return 'data:image/png;base64,' . base64_encode($png);
                    }
                }
            } catch (\Throwable $e) {
                // ignore -> fallback SVG
            }

            // 2) SVG via SimpleSoftwareIO
            try {
                if (class_exists(\SimpleSoftwareIO\QrCode\Facades\QrCode::class)) {
                    $svg = \SimpleSoftwareIO\QrCode\Facades\QrCode::format('svg')
                        ->size(110)->margin(0)->generate($payload);

                    if (is_string($svg) && trim($svg) !== '') {
                        $svg2 = $svg;

                        // Ensure svg has explicit width/height (helps dompdf)
                        if (stripos($svg2, 'width=') === false) {
                            $svg2 = preg_replace('/<svg\b/', '<svg width="110" height="110"', $svg2, 1);
                        }

                        return 'data:image/svg+xml;base64,' . base64_encode($svg2);
                    }
                }
            } catch (\Throwable $e) {
                // ignore -> fallback bacon
            }

            // 3) BaconQrCode SVG fallback (very reliable)
            try {
                if (
                    class_exists(\BaconQrCode\Writer::class) &&
                    class_exists(\BaconQrCode\Renderer\ImageRenderer::class) &&
                    class_exists(\BaconQrCode\Renderer\RendererStyle\RendererStyle::class) &&
                    class_exists(\BaconQrCode\Renderer\Image\SvgImageBackEnd::class)
                ) {
                    $style = new \BaconQrCode\Renderer\RendererStyle\RendererStyle(110);
                    $backend = new \BaconQrCode\Renderer\Image\SvgImageBackEnd();
                    $renderer = new \BaconQrCode\Renderer\ImageRenderer($style, $backend);
                    $writer = new \BaconQrCode\Writer($renderer);

                    $svg = $writer->writeString($payload);
                    if (is_string($svg) && trim($svg) !== '') {
                        $svg2 = $svg;
                        if (stripos($svg2, 'width=') === false) {
                            $svg2 = preg_replace('/<svg\b/', '<svg width="110" height="110"', $svg2, 1);
                        }
                        return 'data:image/svg+xml;base64,' . base64_encode($svg2);
                    }
                }
            } catch (\Throwable $e) {
                // ignore
            }

            return null;
        };

        $omQrSrc = $makeQrDataUri($omVerifyUrl);
        $lhQrSrc = $makeQrDataUri($lhVerifyUrl);

        // ✅ HARDCODE sesuai template gambar
        $omName = 'dr. Olivia A. Waworuntu, MPH, Sp.MK';
        $omNip = '197910242008012006';

        $lhName = 'Dr. dr. Janno B. B. Bernadus, M.Biomed, Sp.KKLP';
        $lhNip = '197010262005011003';
    @endphp

    <style>
        /* DOMPDF paling aman pakai DejaVu */
        body {
            font-family: DejaVu Sans, Arial, sans-serif;
            font-size: 11px;
            line-height: 1.3;
            color: #000;
        }

        .header-serif {
            font-family: "Times New Roman", Times, serif;
        }

        .title-doc {
            text-align: center;
            font-weight: bold;
            text-decoration: underline;
            margin: 20px 0 18px;
            font-size: 14px;
            text-transform: uppercase;
        }

        .meta-table {
            width: 100%;
            margin-bottom: 10px;
        }

        .meta-table td {
            vertical-align: top;
            padding: 2px 0;
        }

        .table-items {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
        }

        .table-items th,
        .table-items td {
            border: 1px solid #000;
            padding: 7px;
            vertical-align: top;
        }

        .table-items th {
            text-align: center;
            font-weight: bold;
            background-color: #fff;
        }

        .sign-table {
            margin-top: 38px;
            width: 100%;
        }

        .sign-cell {
            text-align: center;
            vertical-align: top;
            width: 50%;
            padding: 0 10px;
        }

        .role-title {
            margin-bottom: 8px;
            font-weight: normal;
        }

        /* ✅ DOMPDF-friendly QR: NO flex, NO weird layout */
        .qr-box {
            width: 110px;
            height: 110px;
            margin: 6px auto 6px;
            padding: 0;
            line-height: 0;
            /* prevent baseline gaps */
            text-align: center;
        }

        .qr-img {
            width: 110px;
            height: 110px;
            display: block;
            margin: 0 auto;
        }

        .qr-fallback {
            width: 110px;
            height: 110px;
            display: block;
            margin: 0 auto;
            line-height: 110px;
            font-size: 9px;
            color: #444;
            border: 1px dashed #666;
        }

        .signer-name {
            font-weight: bold;
            text-decoration: underline;
            margin-top: 6px;
            font-size: 11px;
        }

        .signer-nip {
            margin-top: 2px;
            font-size: 11px;
        }
    </style>

    {{-- HEADER --}}
    <table width="100%" cellspacing="0" cellpadding="0">
        <tr>
            <td width="15%" align="left" style="vertical-align: middle;">
                <img src="{{ public_path('logo-unsrat.png') }}" style="height:85px; width:auto;">
            </td>
            <td width="85%" align="center" style="padding-left: 10px;">
                <div class="header-serif" style="font-size:22px; font-weight:bold;">LABORATORIUM BIOMOLEKULER</div>
                <div class="header-serif" style="font-size:20px; font-weight:bold; margin-top: 2px;">UNIVERSITAS SAM
                    RATULANGI</div>
                <div style="font-size:11px; font-weight:bold; margin-top: 4px;">SAM RATULANGI UNIVERSITY</div>
                <div style="font-size:11px; font-weight:bold;">BIOMOLECULAR LABORATORY</div>
            </td>
        </tr>
    </table>

    {{-- RED BAR --}}
    <div style="border-bottom: 4px solid #b30000; margin-top: 8px; margin-bottom: 4px;"></div>

    {{-- ADDRESS & REC NUMBER --}}
    <table width="100%" style="font-size: 9px;">
        <tr>
            <td width="65%" align="left">
                Jalan Kampus Universitas Sam Ratulangi Manado 95115 &nbsp; Telepon 0813-4396-6554<br>
                E-mail labbiomolekuler@unsrat.ac.id &nbsp; Laman http://biomolekuler.unsrat.ac.id/
            </td>
            <td width="35%" align="right" style="vertical-align: top;">
                <b>No. Rekaman : REK/LAB-BM/TKS/32</b>
            </td>
        </tr>
    </table>

    {{-- TITLE --}}
    <div class="title-doc">
        SURAT PERINTAH PENGUJIAN SAMPEL
    </div>

    {{-- META DATA --}}
    <table class="meta-table">
        <tr>
            <td width="55%">
                <table width="100%">
                    <tr>
                        <td width="30%">Metode Uji</td>
                        <td width="5%">:</td>
                        <td width="65%">-</td>
                    </tr>
                    <tr>
                        <td>Pelanggan/Instansi</td>
                        <td>:</td>
                        <td>{{ $clientName }} / {{ $clientOrg }}</td>
                    </tr>
                    <tr>
                        <td>Jumlah Sampel</td>
                        <td>:</td>
                        <td>{{ count($items) }}</td>
                    </tr>
                </table>
            </td>

            <td width="45%">
                <table width="100%">
                    <tr>
                        <td width="45%">Tanggal Penerimaan</td>
                        <td width="5%">:</td>
                        <td width="50%">
                            @php $rx = data_get($payload ?? [], 'received_at', null); @endphp
                            {{ $rx ? \Carbon\Carbon::parse($rx)->translatedFormat('d F Y') : '-' }}
                        </td>
                    </tr>
                    <tr>
                        <td>Tanggal Dokumen</td>
                        <td>:</td>
                        <td>{{ \Carbon\Carbon::now()->translatedFormat('d F Y') }}</td>
                    </tr>
                    <tr>
                        <td>No. Surat</td>
                        <td>:</td>
                        <td>{{ $number }}</td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>

    {{-- ITEMS TABLE --}}
    <table class="table-items">
        <thead>
            <tr>
                <th width="8%">No.</th>
                <th width="35%">KODE SAMPEL</th>
                <th>PARAMETER UJI</th>
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
                @for ($i = 0; $i < 5; $i++)
                    <tr>
                        <td>&nbsp;</td>
                        <td></td>
                        <td></td>
                    </tr>
                @endfor
            @endforelse
        </tbody>
    </table>

    {{-- SIGNATURES --}}
    <table class="sign-table">
        <tr>
            <td class="sign-cell">
                <div class="role-title">
                    <span style="display:block;">&nbsp;</span>
                    Manajer Operasional
                </div>

                <div class="qr-box">
                    @if ($omQrSrc)
                        <img src="{{ $omQrSrc }}" alt="OM QR" class="qr-img">
                    @else
                        <span class="qr-fallback">OM QR</span>
                    @endif
                </div>

                <div class="signer-name">{{ $omName }}</div>
                <div class="signer-nip">NIP. {{ $omNip }}</div>
            </td>

            <td class="sign-cell">
                <div class="role-title">
                    Mengetahui<br>
                    Kepala Laboratorium
                </div>

                <div class="qr-box">
                    @if ($lhQrSrc)
                        <img src="{{ $lhQrSrc }}" alt="LH QR" class="qr-img">
                    @else
                        <span class="qr-fallback">LH QR</span>
                    @endif
                </div>

                <div class="signer-name">{{ $lhName }}</div>
                <div class="signer-nip">NIP. {{ $lhNip }}</div>
            </td>
        </tr>
    </table>

    {{-- DOCUMENT FOOTER CODE --}}
    <div style="position: absolute; bottom: 0; right: 0; font-size: 9px;">
        FORM/LAB-BM/TKS/32.Rev00.31-01-24
    </div>
@endsection