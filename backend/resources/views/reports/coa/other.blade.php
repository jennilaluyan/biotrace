@extends('reports.coa.layout')

@section('content')
    @php
        $clientName = $client->name ?? '-';
        $phone = $client->phone ?? '-';

        $sampleCode = $sample->sample_id ?? '-';
        $receivedAt = isset($sample->received_at) ? \Carbon\Carbon::parse($sample->received_at)->format('d/m/Y') : '-';
        $testDate = isset($report->test_date) ? \Carbon\Carbon::parse($report->test_date)->format('d/m/Y') : '-';
        $validationDate = isset($report->validated_at) ? \Carbon\Carbon::parse($report->validated_at)->format('d/m/Y') : '-';
        $printedAt = now()->format('d/m/Y');

        // notes source: prefer report_items "Notes", fallback to report->result
        $notes = '';
        $rawItems = $report_items ?? ($reportItems ?? []);
        if (is_array($rawItems)) {
            foreach ($rawItems as $it) {
                $pn = strtolower(trim((string) ($it['parameter_name'] ?? '')));
                if ($pn !== '' && (str_contains($pn, 'notes') || str_contains($pn, 'catatan'))) {
                    $notes = (string) (($it['interpretation'] ?? null) ?: ($it['result_value'] ?? ''));
                    break;
                }
            }
        }
        if (trim($notes) === '') {
            $notes = (string) ($report->result ?? '');
        }
    @endphp

    {{-- HEADER (copy style dari individual/institution) --}}
    <table class="header-table" width="100%">
        <tr>
            <td width="15%" align="left">
                <img src="{{ public_path('logo-unsrat.png') }}" style="height:75px;">
            </td>
            <td width="65%" align="center">
                <div style="font-size:14px; font-weight:bold;">UNIT PENUNJANG AKADEMIK (UPA)</div>
                <div style="font-size:14px; font-weight:bold;">LABORATORIUM BIOMOLEKULER</div>
                <div style="font-size:14px; font-weight:bold;">UNIVERSITAS SAM RATULANGI</div>
                <div class="italic text-small" style="margin-top:2px;">Sam Ratulangi University Biomolecular Laboratory
                </div>
            </td>
            <td width="20%" align="center">
                <div class="kan-box">
                    @if(file_exists(public_path('logo-kan.png')))
                        <img src="{{ public_path('logo-kan.png') }}" style="height:45px;"><br>
                    @endif
                    <div style="margin-top:2px;">Komite Akreditasi Nasional</div>
                    <div>LP-2138-IDN</div>
                    <div style="font-size:6px; font-weight:normal;">(Accredited Testing Laboratory ISO/IEC 17025:2017)</div>
                </div>
            </td>
        </tr>
    </table>

    <div style="border-bottom: 2px solid #000; margin-top: 5px; margin-bottom: 2px;"></div>

    <table width="100%" class="text-small">
        <tr>
            <td width="70%">
                Jalan Kampus Universitas Sam Ratulangi Manado 95115 &nbsp; Telepon 0813-4396-6554 <br>
                Email: labbiomolekuler@unsrat.ac.id &nbsp; https://www.unsrat.ac.id/labbiomolekuler
            </td>
        </tr>
    </table>

    <div class="text-center text-bold" style="margin: 15px 0; font-size:14px;">
        LAPORAN HASIL UJI<br>
        <span class="italic" style="font-weight:normal;">CERTIFICATE OF ANALYSIS (COA)</span>
    </div>

    <table class="info-table" width="100%">
        <tr>
            <td width="55%">
                <table width="100%">
                    <tr>
                        <td width="40%">No. Rekaman</td>
                        <td>: <b>RevREK/LAB-BM/ADM/02/</b></td>
                    </tr>
                    <tr>
                        <td>Nama Pelanggan / <span class="italic text-small">Customer</span></td>
                        <td>: {{ $clientName }}</td>
                    </tr>
                    <tr>
                        <td>No. Handphone</td>
                        <td>: {{ $phone }}</td>
                    </tr>
                    <tr>
                        <td>Kode Sampel / <span class="italic text-small">Sample ID</span></td>
                        <td>: {{ $sampleCode }}</td>
                    </tr>
                </table>
            </td>
            <td width="45%" style="padding-left:10px;">
                <table width="100%">
                    <tr>
                        <td width="50%">Tanggal Validasi<br><span class="italic text-small">Validation Date</span></td>
                        <td>: {{ $validationDate }}</td>
                    </tr>
                    <tr>
                        <td>Tanggal Cetak<br><span class="italic text-small">Print out date</span></td>
                        <td>: {{ $printedAt }}</td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>

    <table class="info-table" style="margin-top:5px;">
        <tr>
            <td width="22%">Tanggal Penerimaan / <span class="italic text-small">Date Received</span></td>
            <td>: {{ $receivedAt }}</td>
        </tr>
        <tr>
            <td>Tanggal Pengujian / <span class="italic text-small">Date of Testing</span></td>
            <td>: {{ $testDate }}</td>
        </tr>
        <tr>
            <td>Tempat Analisa</td>
            <td>: Laboratorium Biomolekuler Universitas Sam Ratulangi Manado</td>
        </tr>
    </table>

    {{-- ✅ HASIL: textbox notes --}}
    <div style="border:1px solid #000; padding:10px; margin-top:10px;" class="text-small">
        <div class="text-bold">Hasil / Catatan</div>
        <div style="margin-top:6px; white-space: pre-wrap;">{{ $notes !== '' ? $notes : '-' }}</div>
    </div>

    {{-- KETERANGAN --}}
    <div style="border:1px solid #000; padding:5px; margin-top:10px;" class="text-small">
        <b>Keterangan:</b><br>
        Hasil yang ditampilkan hanya berhubungan dengan sampel diterima/ The test result valid for samples received at the
        laboratory<br>
        Laporan Hasil Uji tidak dapat digandakan kecuali seluruhnya dan atas persetujuan tertulis laboratorium/ Do not
        reproduce this report, except in full, without written approval of the laboratory
    </div>

    {{-- TTD --}}
    <table width="100%" class="signature-section">
        <tr>
            <td width="50%"></td>
            <td width="50%" align="center">
                <div class="text-bold">
                    KEPALA UNIT PENUNJANG AKADEMIK (UPA)<br>
                    LABORATORIUM BIOMOLEKULER UNSRAT
                </div>

                <div style="height: 80px; margin: 10px 0;">
                    @if(!empty($qr_data_uri))
                        <img src="{{ $qr_data_uri }}" style="width:80px; height:80px;">
                    @endif
                </div>

                <div class="text-bold" style="text-decoration: underline;">
                    Dr. dr. Janno B. B. Bernadus, M.Biomed, Sp.KKLP
                </div>
                <div>NIP. 197010262005011003</div>
            </td>
        </tr>
    </table>

    <div class="text-xs italic" style="margin-top:10px;">
        *Dokumen ini menjadi tidak terkendali apabila sudah diluar ruang lingkup Laboratorium dan dilarang merubah substansi
        dari surat ini
    </div>

    <div class="form-footer">
        FORM/LAB-BM/ADM/16.Rev02.10-06-25
    </div>
@endsection