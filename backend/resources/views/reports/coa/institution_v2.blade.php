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
    
    .result-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .result-table th, .result-table td { 
        border: 1px solid black; padding: 4px; text-align: center; font-size: 10px;
    }
    .result-table th { background-color: #f2f2f2; }

    .small-text { font-size: 9px; font-style: italic; color: #333; }
    .sign-by { font-size: 8px; text-align: right; vertical-align: top; }
    
    .form-footer { position: fixed; bottom: 0; right: 0; font-size: 10px; font-weight: bold; text-align: right; }
    .disclaimer { font-size: 8px; margin-top: 15px; font-style: italic; }
</style>

<table class="header-table" width="100%" cellspacing="0" cellpadding="0">
    <tr>
        <td width="15%" align="left">
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
            <b>No. Rekaman : RevREK/LAB-BM/ADM/16/</b>
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
                        : <b>Next Genome Sequencing (NGS)</b><br>
                        &nbsp; IKM/LAB-BM/TKS/01 (EKSTRAKSI RNA METODE SPIN KOLOM)<br>
                        &nbsp; IKM/LAB-BM/TKS/04 (NEXT GENERATION SEQUENCING)
                    </td>
                </tr>
                <tr>
                    <td>Peralatan / <span class="small-text">Machine</span></td>
                    <td>: <b>Illumina Miseq</b></td>
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
                    <td>: <b>DNA</b></td>
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
            <th rowspan="2" width="25%">Customer's Name</th>
            <th rowspan="2" width="15%">Sampel ID</th>
            <th colspan="2">SEQUENCE RESULT</th>
        </tr>
        <tr>
            <th width="25%">LINEAGE</th>
            <th width="35%">VARIAN</th>
        </tr>
    </thead>
    <tbody>
        @forelse($items as $item)
        <tr>
            <td>{{ $item['client_name'] ?? $clientName }}</td>
            <td>{{ $item['sample_id'] ?? '-' }}</td>
            <td>{{ $item['lineage'] ?? '-' }}</td>
            <td>{{ $item['variant'] ?? '-' }}</td>
        </tr>
        @empty
        {{-- Jika data kosong, buat 10 baris kosong sesuai gambar ac31a5 --}}
        @for ($i = 0; $i < 10; $i++)
        <tr>
            <td height="18">&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
        </tr>
        @endfor
        @endforelse
    </tbody>
</table>

<table width="100%" style="margin-top: 30px;">
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