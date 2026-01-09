@extends('reports.coa.layout')

@section('content')
    <div class="center bold" style="font-size: 14pt;">SERTIFIKAT HASIL UJI (CERTIFICATE OF ANALYSIS)</div>
    <div class="center small">Template Institusi (Versi 2)</div>
    <div class="hr"></div>

    {{-- Shell dulu. Step layout detail kita rapikan saat implement PDF final dari Form halaman 9-10 --}}
    <table class="grid">
        <tr>
            <th style="width:30%;">Pelanggan</th>
            <td>{{ $client_name ?? '...' }}</td>
        </tr>
        <tr>
            <th>Alamat</th>
            <td>{{ $client_address ?? '...' }}</td>
        </tr>
        <tr>
            <th>No. Laporan</th>
            <td>{{ $report_no ?? '...' }}</td>
        </tr>
        <tr>
            <th>Tanggal</th>
            <td>{{ $report_date ?? '...' }}</td>
        </tr>
        <tr>
            <th>Kode Sampel</th>
            <td>{{ $sample_code ?? '...' }}</td>
        </tr>
    </table>

    <div class="section-title">Hasil Uji</div>
    <table class="grid">
        <thead>
            <tr>
                <th>Parameter</th>
                <th>Metode</th>
                <th>Hasil</th>
                <th>Satuan</th>
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
        <div class="bold">Kepala Laboratorium</div>
        <div style="height: 22mm;"></div>
        <div class="bold">{{ $lh_name ?? '...' }}</div>
    </div>
@endsection