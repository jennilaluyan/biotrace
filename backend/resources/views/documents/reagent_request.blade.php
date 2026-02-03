{{-- resources/views/documents/reagent_request.blade.php --}}
@extends('reports.coa.layout')

@section('content')
    @php
        /**
         * View receives:
         * - $payload (array): mapped pdf fields
         * - $items (collection/array): reagent_request_items rows
         * - $bookings (collection/array): equipment_bookings rows (+ equipment_name best-effort)
         */
        $payload = $payload ?? [];
        $itemsRaw = $items ?? [];
        $bookingsRaw = $bookings ?? [];

        // normalize items/bookings into arrays (dompdf friendly)
        if ($itemsRaw instanceof \Illuminate\Support\Collection)
            $itemsRaw = $itemsRaw->values()->all();
        if (!is_array($itemsRaw))
            $itemsRaw = [];

        if ($bookingsRaw instanceof \Illuminate\Support\Collection)
            $bookingsRaw = $bookingsRaw->values()->all();
        if (!is_array($bookingsRaw))
            $bookingsRaw = [];

        $recordNo = data_get($payload, 'record_no', 'REK/LAB-BM/TKS/11');
        $recordSuffix = data_get($payload, 'record_suffix', '');
        $recText = trim($recordNo . ($recordSuffix ? '/' . $recordSuffix : ''));

        $formRev = data_get($payload, 'form_rev_code', 'FORM/LAB-BM/TKS/11.Rev00.31-01-24');

        $requestedAt = data_get($payload, 'requested_at', null);
        try {
            $requestedAtText = $requestedAt ? \Illuminate\Support\Carbon::parse($requestedAt)->translatedFormat('d F Y') : '-';
        } catch (\Throwable $e) {
            $requestedAtText = is_string($requestedAt) ? $requestedAt : '-';
        }

        $requesterName = data_get($payload, 'requester_name', '-');
        $requesterDiv = data_get($payload, 'requester_division', '-');

        // ✅ sesuai instruksi: koordinator analis fixed
        $coordName = 'Rendy V. Worotikan, S.Si';

        $omName = data_get($payload, 'om_name', 'dr. Olivia A. Waworuntu, MPH, Sp.MK');
        $omNip = data_get($payload, 'om_nip', '197910242008012006');

        $omQrSrc = data_get($payload, 'om_qr_src', null);
        $omVerifyUrl = data_get($payload, 'om_verify_url', null);

        // ✅ PERMINTAAN BARU:
        // HAPUS tabel REAGEN -> semua items masuk tabel BHP / CONSUMABLE
        $itemsBhp = $itemsRaw;

        // helper format qty => "1 box"
        $fmtQty = function ($qty, $unitText): string {
            if ($qty === null || $qty === '')
                return '';
            $n = rtrim(rtrim(number_format((float) $qty, 3, '.', ''), '0'), '.');
            $u = trim((string) $unitText);
            return trim($n . ($u !== '' ? ' ' . $u : ''));
        };

        // helper format datetime
        $fmtDt = function ($v): string {
            $v = $v ? (string) $v : '';
            if (trim($v) === '')
                return '';
            try {
                return \Illuminate\Support\Carbon::parse($v)->translatedFormat('d F Y H:i');
            } catch (\Throwable) {
                return $v;
            }
        };

        // Fallback generator for OM QR if controller could not embed
        $makeQrDataUri = function (?string $payload): ?string {
            $payload = $payload ? trim($payload) : '';
            if ($payload === '')
                return null;

            // 1) Try PNG via SimpleSoftwareIO
            try {
                if (class_exists(\SimpleSoftwareIO\QrCode\Facades\QrCode::class)) {
                    $png = \SimpleSoftwareIO\QrCode\Facades\QrCode::format('png')
                        ->size(110)->margin(1)->generate($payload);

                    if (is_string($png) && $png !== '') {
                        return 'data:image/png;base64,' . base64_encode($png);
                    }
                }
            } catch (\Throwable) {
            }

            // 2) SVG via SimpleSoftwareIO
            try {
                if (class_exists(\SimpleSoftwareIO\QrCode\Facades\QrCode::class)) {
                    $svg = \SimpleSoftwareIO\QrCode\Facades\QrCode::format('svg')
                        ->size(110)->margin(0)->generate($payload);

                    if (is_string($svg) && trim($svg) !== '') {
                        $svg2 = $svg;
                        if (stripos($svg2, 'width=') === false) {
                            $svg2 = preg_replace('/<svg\b/', '<svg width="110" height="110"', $svg2, 1);
                        }
                        return 'data:image/svg+xml;base64,' . base64_encode($svg2);
                    }
                }
            } catch (\Throwable) {
            }

            // 3) BaconQrCode SVG fallback
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
            } catch (\Throwable) {
            }

            return null;
        };

        if (!$omQrSrc && $omVerifyUrl) {
            $omQrSrc = $makeQrDataUri($omVerifyUrl);
        }
    @endphp

    <style>
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
            margin: 18px 0 12px;
            font-size: 14px;
            text-transform: uppercase;
        }

        .meta-table {
            width: 100%;
            margin: 10px 0 10px;
        }

        .meta-table td {
            vertical-align: top;
            padding: 2px 0;
        }

        .meta-label {
            width: 22%;
        }

        .meta-colon {
            width: 3%;
        }

        .meta-value {
            width: 75%;
        }

        .section-title {
            margin-top: 10px;
            font-weight: bold;
            text-transform: uppercase;
        }

        .table-items {
            width: 100%;
            border-collapse: collapse;
            margin-top: 6px;
        }

        .table-items th,
        .table-items td {
            border: 1px solid #000;
            padding: 6px;
            vertical-align: top;
        }

        .table-items th {
            text-align: center;
            font-weight: bold;
        }

        .sign-row {
            margin-top: 18px;
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

        .name-line {
            margin-top: 44px;
            font-weight: bold;
            text-decoration: underline;
        }

        .nip-line {
            margin-top: 2px;
        }

        .qr-box {
            width: 110px;
            height: 110px;
            margin: 6px auto 6px;
            line-height: 0;
            text-align: center;
            border: 1px dashed #666;
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
            line-height: 110px;
            font-size: 9px;
            color: #444;
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
                <b>No. Rekaman : {{ $recText }}</b>
            </td>
        </tr>
    </table>

    <div class="title-doc">FORMULIR PERMINTAAN REAGEN</div>

    {{-- META --}}
    <table class="meta-table">
        <tr>
            <td class="meta-label">HARI/TANGGAL</td>
            <td class="meta-colon">:</td>
            <td class="meta-value">{{ $requestedAtText }}</td>
        </tr>
        <tr>
            <td class="meta-label">NAMA</td>
            <td class="meta-colon">:</td>
            <td class="meta-value">{{ $requesterName }}</td>
        </tr>
        <tr>
            <td class="meta-label">BAGIAN</td>
            <td class="meta-colon">:</td>
            <td class="meta-value">{{ $requesterDiv }}</td>
        </tr>
    </table>

    {{-- ✅ ONLY TABLE: BHP / CONSUMABLE (rows dynamic) --}}
    <div class="section-title">BHP / CONSUMABLE</div>
    <table class="table-items">
        <thead>
            <tr>
                <th width="6%">NO</th>
                <th width="54%">NAMA REAGEN</th>
                <th width="18%">JUMLAH</th>
                <th width="22%">KETERANGAN</th>
            </tr>
        </thead>
        <tbody>
            @if (count($itemsBhp) === 0)
                <tr>
                    <td align="center">1</td>
                    <td></td>
                    <td></td>
                    <td></td>
                </tr>
            @else
                @foreach ($itemsBhp as $idx => $row)
                    @php
                        $no = $idx + 1;
                        $itemName = (string) data_get($row, 'item_name', '');
                        $qty = data_get($row, 'qty', null);
                        $unitText = (string) data_get($row, 'unit_text', '');
                        $note = (string) data_get($row, 'note', '');
                        $qtyText = $fmtQty($qty, $unitText);
                    @endphp
                    <tr>
                        <td align="center">{{ $no }}</td>
                        <td>{{ $itemName }}</td>
                        <td>{{ $qtyText }}</td>
                        <td>{{ $note }}</td>
                    </tr>
                @endforeach
            @endif
        </tbody>
    </table>

    {{-- TABLE: ALAT (rows dynamic) --}}
    <div class="section-title">ALAT</div>
    <table class="table-items">
        <thead>
            <tr>
                <th width="6%">NO</th>
                <th width="40%">NAMA ALAT</th>
                <th width="20%">WAKTU MULAI</th>
                <th width="20%">WAKTU SELESAI</th>
                <th width="14%">KETERANGAN</th>
            </tr>
        </thead>
        <tbody>
            @if (count($bookingsRaw) === 0)
                <tr>
                    <td align="center">1</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                </tr>
            @else
                @foreach ($bookingsRaw as $idx => $row)
                    @php
                        $no = $idx + 1;
                        $equipName = (string) (data_get($row, 'equipment_name')
                            ?? data_get($row, 'equipment_code')
                            ?? ('Alat #' . (int) data_get($row, 'equipment_id', 0)));

                        $start = $fmtDt(data_get($row, 'planned_start_at'));
                        $end = $fmtDt(data_get($row, 'planned_end_at'));
                        $note = (string) data_get($row, 'note', '');
                    @endphp
                    <tr>
                        <td align="center">{{ $no }}</td>
                        <td>{{ $equipName }}</td>
                        <td>{{ $start }}</td>
                        <td>{{ $end }}</td>
                        <td>{{ $note }}</td>
                    </tr>
                @endforeach
            @endif
        </tbody>
    </table>

    {{-- SIGNATURES --}}
    <table class="sign-row" cellspacing="0" cellpadding="0">
        <tr>
            <td class="sign-cell">
                <div class="role-title">Yang Meminta :</div>
                <div class="name-line">{{ $requesterName }}</div>
            </td>
            <td class="sign-cell">
                <div class="role-title">Koordinator Analis :</div>
                <div class="name-line">{{ $coordName }}</div>
            </td>
        </tr>
    </table>

    <div style="margin-top: 18px; text-align:center;">
        <div class="role-title">Mengetahui<br>Manajer Operasional</div>

        <div class="qr-box">
            @if ($omQrSrc)
                <img src="{{ $omQrSrc }}" alt="OM QR" class="qr-img">
            @else
                <span class="qr-fallback">OM QR</span>
            @endif
        </div>

        <div style="font-weight:bold; text-decoration: underline;">{{ $omName }}</div>
        <div style="margin-top: 2px;">NIP. {{ $omNip }}</div>
    </div>

    {{-- DOCUMENT FOOTER CODE --}}
    <div style="position: absolute; bottom: 0; right: 0; font-size: 9px;">
        {{ $formRev }}
    </div>
@endsection