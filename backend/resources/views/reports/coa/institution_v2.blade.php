@extends('reports.coa.layout')

@section('content')
@php
    $lab = $lab ?? [];

    $reportNo = $reportNo ?? ($report['report_no'] ?? ($report->report_no ?? ''));
    $clientName = $clientName ?? ($client['name'] ?? ($client->name ?? ''));

    $sampleId = $sampleId ?? ($sample['sample_id'] ?? ($sample->sample_id ?? ''));
    $printedAt = $printedAt ?? ($printed_at ?? now());

    $items = $items ?? ($reportItems ?? ($report_items ?? []));
    $map = [];
    foreach ($items as $it) {
        $p = $it['parameter_name'] ?? ($it->parameter_name ?? '');
        $k = strtolower(trim((string)$p));
        if ($k !== '') $map[$k] = $it;
    }

    $findLike = function(string $needle) use ($items) {
        foreach ($items as $it) {
            $p = strtolower((string)($it['parameter_name'] ?? ($it->parameter_name ?? '')));
            if (str_contains($p, strtolower($needle))) return $it;
        }
        return null;
    };

    $lineageIt = $findLike('lineage');
    $variantIt = $findLike('variant');

    $val = function($it) {
        if (!$it) return '-';
        $v = $it['result_value'] ?? ($it->result_value ?? ($it['value_final'] ?? ($it->value_final ?? null)));
        $u = $it['unit_label'] ?? ($it->unit_label ?? '');
        $v = ($v === null || $v === '') ? '-' : $v;
        $u = ($u === null) ? '' : $u;
        return trim((string)$v . ' ' . (string)$u);
    };

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
    SERTIFIKAT HASIL PENGUJIAN (WGS / NGS)
</div>

<table class="tbl mb-10">
    <tr class="text-center text-bold">
        <td style="width: 30%;">Nama Pelanggan</td>
        <td style="width: 18%;">Kode Sampel Lab</td>
        <td style="width: 20%;">Lineage</td>
        <td style="width: 32%;">Hasil Sekuensing (Variant)</td>
    </tr>
    <tr class="text-center">
        <td>{{ $clientName ?: '-' }}</td>
        <td>{{ $sampleId ?: '-' }}</td>
        <td>{{ $val($lineageIt) }}</td>
        <td>{{ $val($variantIt) }}</td>
    </tr>
</table>

<div class="small mb-10">
    Tanggal cetak hasil: {{ $fmtDate($printedAt) }}
</div>

<table class="no-border" style="margin-top: 18px;">
    <tr>
        <td style="width: 55%;"></td>
        <td style="width: 45%;">
            <div class="text-center mb-6">Manado, {{ $fmtDate($printedAt) }}</div>
            <div class="text-center text-bold mb-6">Kepala Laboratorium</div>
            <div class="signature-box text-center">
                {{-- signature injected in Step 6 --}}
            </div>
            <div class="text-center text-bold mt-6">
                {{ $lab_head_name ?? ($labHeadName ?? 'LAB HEAD') }}
            </div>
        </td>
    </tr>
</table>
@endsection
