@extends('reports.coa.layout')

@section('content')
@php
    // Inisialisasi Data
    $lab = $lab ?? [];
    $reportNo = $reportNo ?? ($report['report_no'] ?? ($report->report_no ?? ''));
    
    $clientName = $clientName ?? ($client['name'] ?? ($client->name ?? '-'));
    $clientPhone = $clientPhone ?? ($client['phone'] ?? ($client->phone ?? '-'));
    
    $printedAt = $printedAt ?? ($printed_at ?? now());
    $receivedAt = $receivedAt ?? ($sample['received_at'] ?? ($sample->received_at ?? null));
    $testDate = $testDate ?? ($report['test_date'] ?? ($report->test_date ?? null));
    
    $items = $items ?? ($reportItems ?? ($report_items ?? []));
    
    $fmtDate = function($dt) {
        if (!$dt) return '-';
        try { return \Illuminate\Support\Carbon::parse($dt)->format('d/m/Y'); } catch (\Throwable $e) { return (string)$dt; }
    };
@endphp

<style>
    body { font-family: Arial, sans-serif; font-size: 11px; line-height: 1.2; color: #000; }
    .header-table td { vertical-align: middle; }
    .title { text-align: center; font-weight: bold; margin: 15px 0; }
    .info-table { width: 100%; margin-bottom: 5px; }
    .info-table td { vertical-align: top; padding: 1px 0; }
    
    .result-table, .qc-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .result-table th, .result-table td, .qc-table th, .qc-table td { 
        border: 1px solid black; padding: 4px; text-align: center; font-size: 10px;
    }
    .result-table th { background-color: #f2f2f2; }

    .interpretation-box, .footer-note { 
        border: 1px solid black; padding: 6px; margin-top: 8px; font-size: 10px; width: 100%;
    }
    .small-text { font-size: 9px; font-style: italic; color: #333; }
    .sign-by { font-size: 8px; text-align: right; vertical-align: top; }
    
    .form-footer { position: fixed; bottom: 0; right: 0; font-size: 10px; font-weight: bold; text-align: right; }
    .disclaimer { font-size: 8px; margin-top: 15px; font-style: italic; }
</style>

<table class="header-table" width="100%" cellspacing="0" cellpadding="0">
    <tr>
        <td width="15%" align="left">
            {{-- Menggunakan path logo yang Doctor minta --}}
            <img src="{{ public_path('logo-unsrat.png') }}" style="height:80px;">
        </td>
        <td width="70%" align="center">
            <div style="font-size:22px; font-weight:bold; letter-spacing: 1px;">LABORATORIUM BIOMOLEKULER</div>
            <div style="font-size:20px; font-weight:bold;">UNIVERSITAS SAM RATULANGI</div>
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
        <td width="55%">
            <table width="100%">
                <tr>
                    <td width="45%">Nama Pelanggan Permintaan Pengujian / Instansi Pengirim<br><span class="small-text">Customer's Name / sender</span></td>
                    <td>: {{ $clientName }}</td>
                </tr>
                <tr>
                    <td>No. Handphone</td>
                    <td>: {{ $clientPhone }}</td>
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
        <td width="45%" style="padding-left: 15px;">
            <table width="100%">
                <tr>
                    <td width="50%">Tanggal Validasi Hasil<br><span class="small-text">Validation Date</span></td>
                    <td>: {{ $fmtDate($printedAt) }}</td>
                    <td class="sign-by">Sign by</td>
                </tr>
                <tr>
                    <td>Tanggal Cetak Hasil<br><span class="small-text">Print out date</span></td>
                    <td>: {{ $fmtDate($printedAt) }}</td>
                    <td class="sign-by">Sign by</td>
                </tr>
                <tr>
                    <td>Tanggal Keluar Hasil<br><span class="small-text">Date of Result</span></td>
                    <td>: {{ $fmtDate($printedAt) }}</td>
                    <td class="sign-by">Sign by</td>
                </tr>
                <tr>
                    <td>Tipe Sampel / <span class="small-text">Sample Type</span></td>
                    <td>: Cairan Tubuh Manusia</td>
                    <td></td>
                </tr>
            </table>
        </td>
    </tr>
</table>

<table class="info-table" style="margin-top: 5px;">
    <tr>
        <td width="25%">Referensi Metode / <span class="small-text">Method Reference</span></td>
        <td>: WHO, 2020</td>
    </tr>
    <tr>
        <td>Parameter Pengujian / <span class="small-text">Parameter of examination</span></td>
        <td>: SARS-CoV-2</td>
    </tr>
    <tr>
        <td>Tanggal Penerimaan Sampel / <span class="small-text">Date Received</span></td>
        <td>: {{ $fmtDate($receivedAt) }}</td>
    </tr>
    <tr>
        <td>Tanggal Pelaksanaan Pengujian / <span class="small-text">Date of Testing</span></td>
        <td>: {{ $fmtDate($testDate) }}</td>
    </tr>
    <tr>
        <td>Tempat Analisa / <span class="small-text">Location of Analysis</span></td>
        <td>: Laboratorium Biomolekuler Universitas Sam Ratulangi Manado</td>
    </tr>
    <tr>
        <td>Tujuan Pengujian / <span class="small-text">Aim Of The Test</span></td>
        <td>: Surveilans</td>
    </tr>
</table>

<table class="result-table">
    <thead>
        <tr>
            <th rowspan="2" width="20%">Nama Pelanggan<br><span class="small-text">Customer Name</span></th>
            <th rowspan="2" width="15%">Kode Sampel Lab<br><span class="small-text">Lab Sample ID</span></th>
            <th colspan="3">Gen Target (Targeted Gene)</th>
            <th rowspan="2" width="20%">Hasil Pengujian<br><span class="small-text">Result</span></th>
        </tr>
        <tr>
            <th width="10%">ORF1b</th>
            <th width="10%">RdRp</th>
            <th width="10%">RPP30</th>
        </tr>
    </thead>
    <tbody>
        @forelse($items as $item)
        <tr>
            {{-- Menampilkan data per baris untuk institusi --}}
            <td>{{ $item['client_name'] ?? $clientName }}</td>
            <td>{{ $item['sample_id'] ?? '-' }}</td>
            <td>{{ $item['orf1b'] ?? '-' }}</td>
            <td>{{ $item['rdrp'] ?? '-' }}</td>
            <td>{{ $item['rpp30'] ?? '-' }}</td>
            <td style="font-weight: bold;">{{ strtoupper($item['result'] ?? '-') }}</td>
        </tr>
        @empty
        <tr>
            <td colspan="6" style="padding: 10px;">Belum ada data hasil pengujian.</td>
        </tr>
        @endforelse
    </tbody>
</table>

<div style="width: 250px; margin-top: 15px;">
    <table class="qc-table" style="font-size: 9px;">
        <tr style="background-color: #f2f2f2;"><th colspan="3">Quality Control</th></tr>
        <tr><td width="34%"></td><td width="33%">QC Positive</td><td width="33%">QC Negative</td></tr>
        <tr><td>ORF1b</td><td>+</td><td>-</td></tr>
        <tr><td>RdRp</td><td>+</td><td>-</td></tr>
        <tr><td>RPP30</td><td>+</td><td>-</td></tr>
    </table>
</div>

<div class="interpretation-box">
    <b>Interpretasi Hasil / Result Interpretation</b>
    <ul style="margin: 5px 0; padding-left: 15px; list-style-type: disc; font-size: 9px;">
        <li><b>Hasil Positif atau terdeteksi</b> menunjukkan bahwa pada sampel terdeteksi material genetik SARS-CoV-2.<br>
            <span class="small-text">Positive or Detected results indicate that the SARS-CoV-2 genetic material was detected in the sample.</span>
        </li>
        <li><b>Hasil negatif atau tidak terdeteksi</b> menunjukkan bahwa material genetik SARS-CoV-2 yang dimaksud tidak ditemukan di dalam sampel atau kadar sampel belum dapat terdeteksi oleh alat.<br>
            <span class="small-text">Negative or Undetectable results indicate that the SARS-CoV-2 genetic material in question was not detected in the sample or sample levels could be detected by the instrument.</span>
        </li>
    </ul>
</div>

<div class="footer-note">
    <b>Keterangan :</b><br>
    - Hasil yang ditampilkan hanya berhubungan dengan sampel diterima/ The test result valid for samples received at the laboratory<br>
    - Laporan Hasil Uji tidak dapat digandakan kecuali seluruhnya dan atas persetujuan tertulis laboratorium/ Do not reproduce this report, except in full, without written approval of the laboratory
</div>

<table width="100%" style="margin-top: 20px;">
    <tr>
        <td width="40%"></td>
        <td width="60%" align="center">
            <p style="font-weight: bold; margin-bottom: 50px;">
                KEPALA LABORATORIUM BIOMOLEKULER UNSRAT
            </p>
            <p style="font-weight: bold; text-decoration: underline; margin-bottom: 0;">
                Dr. dr. Janno B. B. Bernadus, M.Biomed, Sp.KKLP
            </p>
            <p style="margin-top: 2px;">
                NIP. 197010262005011003
            </p>
        </td>
    </tr>
</table>

<div class="disclaimer">
    *Dokumen ini menjadi tidak terkendali apabila sudah diluar ruang lingkup Laboratorium dan dilarang merubah substansi dari surat ini
</div>

<div class="form-footer">
    FORM/LAB-BM/ADM/16.Rev02.10-06-25
</div>

@endsection