{{-- resources/views/documents/reagent_request.blade.php --}}
@extends('reports.coa.layout')

@section('content')
    @php
        /**
         * Expected view data shape (step 8.1 mapping only; step 8.2+ will feed real data):
         *
         * $payload = [
         *   'record_no' => 'REK/LAB-BM/TKS/11',
         *   'record_suffix' => '...optional...',
         *   'form_rev_code' => 'FORM/LAB-BM/TKS/11.Rev00.31-01-24',
         *   'requested_at' => '2026-02-03T10:00:00Z' | '2026-02-03',
         *   'requester_name' => '...',
         *   'requester_division' => 'Analis',
         *   'coordinator_name' => '...',
         *   'om_name' => '...',
         *   'om_nip' => '...',
         *   'om_qr_src' => 'data:image/png;base64,...' (optional placeholder; step 8.3 will ensure QR)
         * ];
         *
         * $items = [
         *   ['item_name'=>'...', 'qty'=>1, 'unit_text'=>'box', 'note'=>'...'],
         *   ...
         * ];
         */
        $payload = $payload ?? [];
        $items = $items ?? [];

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

        $coordName = data_get($payload, 'coordinator_name', '-');

        // Default mengikuti template yang kamu sudah hardcode di dokumen lain (nanti bisa dipindah ke config)
        $omName = data_get($payload, 'om_name', 'dr. Olivia A. Waworuntu, MPH, Sp.MK');
        $omNip = data_get($payload, 'om_nip', '197910242008012006');

        $omQrSrc = data_get($payload, 'om_qr_src', null);
    @endphp

    <style>
        /* DOMPDF safest */
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
            margin-top: 26px;
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

        /* QR box DOMPDF-friendly (no flex) */
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

    {{-- HEADER (ikuti dokumen existing) --}}
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

    {{-- ITEMS TABLE (fixed 10 rows like paper form) --}}
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
            @for ($i = 1; $i <= 10; $i++)
                @php
                    $row = $items[$i - 1] ?? null;
                    $itemName = $row ? (string) data_get($row, 'item_name', '') : '';
                    $qty = $row ? data_get($row, 'qty', null) : null;
                    $unitText = $row ? (string) data_get($row, 'unit_text', '') : '';
                    $note = $row ? (string) data_get($row, 'note', '') : '';

                    $qtyText = '';
                    if ($qty !== null && $qty !== '') {
                        // Keep it human-friendly: "1 box", "2.5 mL", etc.
                        $qtyText = rtrim(rtrim(number_format((float) $qty, 3, '.', ''), '0'), '.');
                        if ($unitText !== '')
                            $qtyText .= ' ' . $unitText;
                    }
                @endphp
                <tr>
                    <td align="center">{{ $i }}</td>
                    <td>{{ $itemName }}</td>
                    <td>{{ $qtyText }}</td>
                    <td>{{ $note }}</td>
                </tr>
            @endfor
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