@extends('reports.coa.layout')

@section('content')
<style>
@page { margin: 40px; }

.watermark {
    position: fixed;
    top: 40%;
    left: 10%;
    width: 80%;
    text-align: center;
    opacity: 0.12;
    font-size: 72px;
    font-weight: bold;
    transform: rotate(-30deg);
    z-index: -1000;
}

.qr {
    position: fixed;
    bottom: 30px;
    right: 30px;
    width: 90px;
}
</style>

@if($report->is_locked)
    <div class="watermark">FINAL / LOCKED</div>
@endif

@php
    $lab = $lab ?? [];

    $reportNo = $report->report_no ?? '-';
    $clientName = $client->name ?? '-';
    $sampleId = $sample->sample_id ?? '-';
    $sampleType = $sample->sample_type ?? '-';
    $receivedAt = $sample->received_at ?? null;
    $printedAt = now();

    $fmtDate = function($dt) {
        if (!$dt) return '-';
        try {
            return \Illuminate\Support\Carbon::parse($dt)->format('d/m/Y');
        } catch (\Throwable $e) {
            return (string) $dt;
        }
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
            <div class="text-bold">{{ $reportNo }}</div>
        </td>
    </tr>
</table>

<div class="hr"></div>

<div class="text-center text-bold mb-10" style="font-size: 13px;">
    SERTIFIKAT HASIL PENGUJIAN
</div>

<table class="tbl mb-10">
    <tr><td class="label">Nama Pelanggan</td><td>{{ $clientName }}</td></tr>
    <tr><td class="label">Kode Sampel Lab</td><td>{{ $sampleId }}</td></tr>
    <tr><td class="label">Jenis Sampel</td><td>{{ $sampleType }}</td></tr>
    <tr><td class="label">Tanggal Terima</td><td>{{ $fmtDate($receivedAt) }}</td></tr>
    <tr><td class="label">Tanggal Cetak</td><td>{{ $fmtDate($printedAt) }}</td></tr>
</table>

<table class="tbl mb-10">
    <tr class="text-bold text-center">
        <td>Parameter</td>
        <td>Metode</td>
        <td>Hasil</td>
        <td>Satuan</td>
    </tr>
    @foreach($items as $it)
        <tr class="text-center">
            <td>{{ $it->parameter_name }}</td>
            <td>{{ $it->method_name }}</td>
            <td>{{ $it->result_value ?? '-' }}</td>
            <td>{{ $it->unit_label ?? '-' }}</td>
        </tr>
    @endforeach
</table>

<table class="no-border" style="margin-top: 24px;">
    <tr>
        <td style="width: 55%;"></td>
        <td style="width: 45%; text-align: center;">
            <div>Manado, {{ $fmtDate($printedAt) }}</div>
            <div class="text-bold mt-6">Kepala Laboratorium</div>
            <div class="signature-box" style="height: 70px;"></div>
            <div class="text-bold mt-6">
                {{ optional($signatures->firstWhere('role_code','LH')->signer)->name ?? 'LAB HEAD' }}
            </div>
        </td>
    </tr>
</table>

@if($report->is_locked)
    <div class="qr">
        <img
            src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=https://google.com"
            width="90"
            alt="QR Verification"
        >
    </div>
@endif
@endsection
