@extends('reports.coa.layout')

@section('content')
    <div class="center bold" style="font-size: 14pt;">SERTIFIKAT HASIL UJI (CERTIFICATE OF ANALYSIS)</div>
    <div class="center small">Laboratorium Biomolekuler UNSRAT</div>
    <div class="hr"></div>

    <table class="no-border">
        <tr>
            <td>
                <div class="bold">Pelanggan (Institusi)</div>
                <div>{{ $client_name ?? '...' }}</div>
                <div class="small">{{ $client_address ?? '' }}</div>
            </td>
            <td class="right">
                <div><span class="bold">No. Laporan:</span> {{ $report_no ?? '...' }}</div>
                <div><span class="bold">Tanggal:</span> {{ $report_date ?? '...' }}</div>
            </td>
        </tr>
    </table>

    <div class="section-title">Informasi Sampel</div>
    <table class="grid">
        <tr>
            <th style="width: 35%;">Kode Sampel</th>
            <td>{{ $sample_code ?? '...' }}</td>
        </tr>
        <tr>
            <th>Nama Sampel</th>
            <td>{{ $sample_name ?? '...' }}</td>
        </tr>
        <tr>
            <th>Tanggal Terima</th>
            <td>{{ $received_at ?? '...' }}</td>
        </tr>
    </table>

    <div class="section-title">Hasil Uji</div>
    <table class="grid">
        <thead>
            <tr>
                <th style="width: 40%;">Parameter</th>
                <th style="width: 30%;">Metode</th>
                <th style="width: 15%;">Hasil</th>
                <th style="width: 15%;">Satuan</th>
            </tr>
        </thead>
        <tbody>
            @if(!empty($items))
                @foreach($items as $it)
                    <tr>
                        <td>{{ $it['parameter_name'] ?? '' }}</td>
                        <td>{{ $it['method_name'] ?? '' }}</td>
                        <td>{{ $it['result_value'] ?? '' }}</td>
                        <td>{{ $it['unit_label'] ?? '' }}</td>
                    </tr>
                @endforeach
            @else
                <tr>
                    <td colspan="4" class="center">...</td>
                </tr>
            @endif
        </tbody>
    </table>

    <div class="mt-8 right">
        <div class="bold">Disetujui oleh,</div>
        <div class="small">Kepala Laboratorium</div>

        {{-- TTD image akan kita isi di Step sign + PDF render --}}
        <div style="height: 22mm;"></div>

        <div class="bold">{{ $lh_name ?? '...' }}</div>
        <div class="small">NIP: {{ $lh_nip ?? '...' }}</div>
    </div>
@endsection