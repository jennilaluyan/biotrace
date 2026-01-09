@extends('reports.coa.layout')

@section('content')
@php
    // make templates resilient: accept either array or model-like objects
    $lab = $lab ?? [];

    $reportNo = $reportNo ?? ($report['report_no'] ?? ($report->report_no ?? ''));
    $templateCode = $templateCode ?? ($template_code ?? ($report['template_code'] ?? ($report->template_code ?? 'INST_V1')));

    $clientName = $clientName ?? ($client['name'] ?? ($client->name ?? ''));
    $clientType = $clientType ?? ($client['type'] ?? ($client->type ?? 'institution'));

    $sampleId = $sampleId ?? ($sample['sample_id'] ?? ($sample->sample_id ?? ''));
    $sampleType = $sampleType ?? ($sample['sample_type'] ?? ($sample->sample_type ?? ''));
    $receivedAt = $receivedAt ?? ($sample['received_at'] ?? ($sample->received_at ?? null));

    $printedAt = $printedAt ?? ($printed_at ?? now());

    $items = $items ?? ($reportItems ?? ($report_items ?? []));
    // Build map by PARAMETER NAME for gene targets (ORF1b, RdRp, RPP30)
    $map = [];
    foreach ($items as $it) {
        $p = $it['parameter_name'] ?? ($it->parameter_name ?? '');
        $k = strtoupper(trim((string)$p));
        if ($k !== '') $map[$k] = $it;
    }
    $getVal = function(string $key) use ($map) {
        $it = $map[strtoupper($key)] ?? null;
        if (!$it) return '-';
        $v = $it['result_value'] ?? ($it->result_value ?? ($it['value_final'] ?? ($it->value_final ?? null)));
        $u = $it['unit_label'] ?? ($it->unit_label ?? '');
        $v = ($v === null || $v === '') ? '-' : $v;
        $u = ($u === null) ? '' : $u;
        return trim((string)$v . ' ' . (string)$u);
    };

    $overall = $overall_result ?? ($overallResult ?? '-');

    $signatureDataUri = $signature_data_uri ?? null; // Step 6 will fill this

    $fmtDate = function($dt) {
        if (!$dt) return '-';
        try { return \Illuminate\Support\Carbon::parse($dt)->format('d/m/Y'); } catch (\Throwable $e) { return (string)$dt; }
    };
@endphp

<table class="header">
    <tr>
        <td style="width: 18%;">
            @if(!empty($lab['logo_data_uri']))
                <img src="{{ $lab['logo_data_uri'] }}" style="height: 55px;">
            @endif
        </td>
        <td class="text-center" style="width: 64%;">
            <div class="text-bold" style="font-size: 13px;">LABORATORIUM BIOMOLEKULER</div>
            <div class="text-bold" style="font-size: 11px;">FAKULTAS KEDOKTERAN UNIVERSITAS SAM RATULANGI</div>
            <div class="small">
                {{ $lab['address'] ?? '' }}<br>
                {{ $lab['phone'] ?? '' }}
            </div>
        </td>
        <td class="text-right" style="width: 18%;">
            <div class="small">No. CoA</div>
            <div class="text-bold">{{ $reportNo ?: '-' }}</div>
        </td>
    </tr>
</table>

<div class="hr"></div>

<div class="text-center text-bold mb-10" style="font-size: 13px;">
    SERTIFIKAT HASIL PENGUJIAN
</div>

<table class="tbl mb-10">
    <tr>
        <td class="label">Nama Institusi</td>
        <td class="value">{{ $clientName ?: '-' }}</td>
    </tr>
    <tr>
        <td class="label">Kode Sampel Lab</td>
        <td class="value">{{ $sampleId ?: '-' }}</td>
    </tr>
    <tr>
        <td class="label">Jenis Sampel</td>
        <td class="value">{{ $sampleType ?: '-' }}</td>
    </tr>
    <tr>
        <td class="label">Tanggal Penerimaan Sampel</td>
        <td class="value">{{ $fmtDate($receivedAt) }}</td>
    </tr>
    <tr>
        <td class="label">Tanggal Cetak Hasil</td>
        <td class="value">{{ $fmtDate($printedAt) }}</td>
    </tr>
</table>

<table class="tbl mb-10">
    <tr class="text-center text-bold">
        <td style="width: 22%;">Nama Pelanggan</td>
        <td style="width: 16%;">Kode Sampel Lab</td>
        <td style="width: 12%;">ORF1b</td>
        <td style="width: 12%;">RdRp</td>
        <td style="width: 12%;">RPP30</td>
        <td style="width: 26%;">Hasil Pengujian</td>
    </tr>
    <tr class="text-center">
        <td>{{ $clientName ?: '-' }}</td>
        <td>{{ $sampleId ?: '-' }}</td>
        <td>{{ $getVal('ORF1b') }}</td>
        <td>{{ $getVal('RdRp') }}</td>
        <td>{{ $getVal('RPP30') }}</td>
        <td>{{ $overall }}</td>
    </tr>
</table>

<table class="tbl mb-10">
    <tr class="text-bold text-center">
        <td colspan="2">Kontrol Kualitas (QC)</td>
    </tr>
    <tr>
        <td style="width: 35%;">Status QC</td>
        <td style="width: 65%;">LULUS (PASS)</td>
    </tr>
    <tr>
        <td>Keterangan</td>
        <td class="small">QC telah memenuhi persyaratan sistem (dibatasi oleh aturan eligibility).</td>
    </tr>
</table>

<div class="small mb-10">
    Catatan: Hasil pada sertifikat ini berlaku untuk sampel yang diuji. Dilarang mengutip sebagian tanpa izin tertulis.
</div>

<table class="no-border" style="margin-top: 18px;">
    <tr>
        <td style="width: 55%;"></td>
        <td style="width: 45%;">
            <div class="text-center mb-6">Manado, {{ $fmtDate($printedAt) }}</div>
            <div class="text-center text-bold mb-6">Kepala Laboratorium</div>
            <div class="signature-box text-center">
                @if(!empty($signatureDataUri))
                    <img src="{{ $signatureDataUri }}" style="height: 70px;">
                @endif
            </div>
            <div class="text-center text-bold mt-6">
                {{ $lab_head_name ?? ($labHeadName ?? 'LAB HEAD') }}
            </div>
        </td>
    </tr>
</table>
@endsection
