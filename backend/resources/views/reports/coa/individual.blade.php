@extends('reports.coa.layout')

@section('content')
    @php
        $reportNo = $report->report_no ?? '-';
        $clientName = $client->name ?? '-';
        $instansi = $client->organization ?? '-';
        $phone = $client->phone ?? '-';
        $sampleCode = $sample->sample_id ?? '-';
        $sampleType = $sample->sample_type ?? 'Cairan Tubuh Manusia';
        $receivedAt = isset($sample->received_at) ? \Carbon\Carbon::parse($sample->received_at)->format('d/m/Y') : '-';
        $testDate = isset($report->test_date) ? \Carbon\Carbon::parse($report->test_date)->format('d/m/Y') : '-';
        $validationDate = isset($report->validated_at) ? \Carbon\Carbon::parse($report->validated_at)->format('d/m/Y') : '-';
        $printedAt = now()->format('d/m/Y');
    @endphp

    <style>
        body {
            font-family: Arial, sans-serif;
            font-size: 11px;
            line-height: 1.2;
            color: #000;
        }

        .header-table td {
            vertical-align: middle;
        }

        .title {
            text-align: center;
            font-weight: bold;
            margin: 15px 0;
        }

        .info-table {
            width: 100%;
            margin-bottom: 5px;
        }

        .info-table td {
            vertical-align: top;
            padding: 1px 0;
        }

        .result-table,
        .qc-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }

        .result-table th,
        .result-table td,
        .qc-table th,
        .qc-table td {
            border: 1px solid black;
            padding: 4px;
            text-align: center;
        }

        .interpretation-box,
        .footer-note {
            border: 1px solid black;
            padding: 6px;
            margin-top: 8px;
            font-size: 10px;
            width: 100%;
        }

        .small-text {
            font-size: 9px;
            font-style: italic;
            color: #333;
        }

        .sign-by {
            font-size: 8px;
            text-align: right;
            vertical-align: top;
        }

        /* Footer Style untuk Form Code */
        .form-footer {
            position: fixed;
            bottom: 0;
            right: 0;
            font-size: 10px;
            font-weight: bold;
            text-align: right;
        }

        .qr-box {
            margin-top: 10px;
            text-align: center;
        }

        .qr-box img {
            width: 90px;
            height: 90px;
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

    <div style="background-color: #b30000; height: 3px; margin-top: 5px;"></div>
    <table width="100%" style="font-size: 8.5px; margin-top: 2px; border-bottom: 1px solid black; padding-bottom: 2px;">
        <tr>
            <td width="75%">
                Jalan Kampus Universitas Sam Ratulangi Manado 95115 &nbsp; Telepon 0813 4396 6554 &nbsp;
                E-mail labbiomolekuler@unsrat.ac.id &nbsp; Laman http://biomolekuler.unsrat.ac.id/
            </td>
            <td width="25%" align="right">
                <b>No. Rekaman : RevREK/LAB-BM/ADM/02/</b>
            </td>
        </tr>
    </table>

    <div class="title">
        LAPORAN HASIL UJI<br>
        <span style="font-style:italic; font-weight:normal;">CERTIFICATE OF ANALYSIS (COA)</span>
    </div>

    <table class="info-table" cellpadding="0" cellspacing="0">
        <tr>
            <td width="50%">
                <table width="100%">
                    <tr>
                        <td width="40%">Nama Pelanggan /<br><span class="small-text">Customer's Name</span></td>
                        <td>: {{ $clientName }}</td>
                    </tr>
                    <tr>
                        <td>Instansi Pengirim</td>
                        <td>: {{ $instansi }}</td>
                    </tr>
                    <tr>
                        <td>No. Handphone</td>
                        <td>: {{ $phone }}</td>
                    </tr>
                    <tr>
                        <td>Metode Pengujian<br><span class="small-text">Test Method</span></td>
                        <td style="font-size: 8.5px;">
                            : qRT-PCR<br>
                            &nbsp; IKM/LAB-BM/TKS/01 (EKSTRAKSI RNA)<br>
                            &nbsp; IKM/LAB-BM/TKS/03 (READING qRT-PCR)
                        </td>
                    </tr>
                    <tr>
                        <td>Peralatan / <span class="small-text">Machine</span></td>
                        <td>: Real-Time PCR CFX96 Merk Bio-Rad</td>
                    </tr>
                </table>
            </td>
            <td width="50%" style="padding-left: 15px;">
                <table width="100%">
                    <tr>
                        <td width="45%">Tgl Validasi / <span class="small-text">Valid Date</span></td>
                        <td>: {{ $validationDate }}</td>
                        <td class="sign-by">Sign by</td>
                    </tr>
                    <tr>
                        <td>Tgl Cetak / <span class="small-text">Print Date</span></td>
                        <td>: {{ $printedAt }}</td>
                        <td class="sign-by">Sign by</td>
                    </tr>
                    <tr>
                        <td>Tgl Keluar / <span class="small-text">Result Date</span></td>
                        <td>: {{ $printedAt }}</td>
                        <td class="sign-by">Sign by</td>
                    </tr>
                    <tr>
                        <td>Tipe Sampel / <span class="small-text">Sample Type</span></td>
                        <td>: {{ $sampleType }}</td>
                        <td></td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>

    <table class="info-table" style="margin-top: 5px;">
        <tr>
            <td width="22%">Referensi Metode</td>
            <td width="78%">: WHO, 2020 (Method Reference)</td>
        </tr>
        <tr>
            <td>Parameter Pengujian</td>
            <td>: SARS-CoV-2 (Parameter of examination)</td>
        </tr>
        <tr>
            <td>Tgl Terima Sampel</td>
            <td>: {{ $receivedAt }} (Date Received)</td>
        </tr>
        <tr>
            <td>Tgl Pengujian</td>
            <td>: {{ $testDate }} (Date of Testing)</td>
        </tr>
        <tr>
            <td>Tempat Analisa</td>
            <td>: Laboratorium Biomolekuler Universitas Sam Ratulangi Manado</td>
        </tr>
    </table>

    <table class="result-table">
        <tr style="background-color: #eee;">
            <th rowspan="2" width="30%">Kode Sampel Pelanggan<br><span class="small-text">Customer Sample ID</span></th>
            <th colspan="3">Gen Target (Targeted Gene)</th>
            <th rowspan="2" width="25%">Hasil Pengujian<br><span class="small-text">Result</span></th>
        </tr>
        <tr style="background-color: #eee;">
            <th width="15%">ORF1b</th>
            <th width="15%">RdRp</th>
            <th width="15%">RPP30</th>
        </tr>
        <tr>
            <td>{{ $sampleCode }}</td>
            <td>{{ $report->orf1b ?? '-' }}</td>
            <td>{{ $report->rdrp ?? '-' }}</td>
            <td>{{ $report->rpp30 ?? '-' }}</td>
            <td style="font-weight: bold;">{{ strtoupper($report->result ?? 'NEGATIVE') }}</td>
        </tr>
    </table>

    <table width="100%" style="margin-top: 10px;" cellpadding="0" cellspacing="0">
        <tr>
            <td width="30%" style="vertical-align: top;">
                <table class="qc-table" style="font-size: 8.5px; margin-top: 0;">
                    <tr style="background-color: #eee;">
                        <th colspan="3">Quality Control</th>
                    </tr>
                    <tr>
                        <td width="34%"></td>
                        <td width="33%">Pos</td>
                        <td width="33%">Neg</td>
                    </tr>
                    <tr>
                        <td>ORF1b</td>
                        <td>+</td>
                        <td>-</td>
                    </tr>
                    <tr>
                        <td>RdRp</td>
                        <td>+</td>
                        <td>-</td>
                    </tr>
                    <tr>
                        <td>RPP30</td>
                        <td>+</td>
                        <td>-</td>
                    </tr>
                </table>
            </td>
            <td width="70%" style="vertical-align: top; padding-left: 10px;">
                <div class="interpretation-box" style="margin-top: 0;">
                    <b>Interpretasi Hasil / Result Interpretation</b>
                    <div style="font-size: 8.5px; margin-top: 4px;">
                        • <b>Hasil Positif</b>: Terdeteksi material genetik SARS-CoV-2.<br>
                        • <b>Hasil Negatif</b>: Material genetik SARS-CoV-2 tidak ditemukan atau di bawah limit deteksi
                        alat.
                    </div>
                </div>
            </td>
        </tr>
    </table>

    <div class="footer-note">
        <b>Keterangan :</b><br>
        - Hasil hanya berhubungan dengan sampel yang diterima di laboratorium.<br>
        - Laporan ini tidak boleh digandakan tanpa persetujuan tertulis dari laboratorium.
    </div>

    <table width="100%" style="margin-top: 20px;">
        <tr>
            <td width="40%"></td>

            {{-- KOLOM TTD --}}
            <td width="60%" align="center">

                <p style="font-weight: bold; margin-bottom: 8px;">
                    KEPALA LABORATORIUM BIOMOLEKULER UNSRAT
                </p>

                {{-- QR VERIFICATION (DI DALAM TTD) --}}
                @if(!empty($qr_data_uri))
                    <div style="margin: 8px 0;">
                        <img
                            src="{{ $qr_data_uri }}"
                            style="width:90px;height:90px;"
                            alt="QR Verification"
                        >
                    </div>
                @endif

                <p style="font-weight: bold; text-decoration: underline; margin-bottom: 0;">
                    Dr. dr. Janno B. B. Bernadus, M.Biomed, Sp.KKLP
                </p>

                <p style="margin-top: 2px;">
                    NIP. 197010262005011003
                </p>

            </td>
        </tr>
    </table>

    <div style="font-size: 8px; margin-top: 15px; font-style: italic;">
        *Dokumen ini sah tanpa tanda tangan basah jika dicetak langsung dari sistem BioTrace.
    </div>

    <div class="form-footer">
        FORM/LAB-BM/ADM/16.Rev02.10-06-25
    </div>

@endsection