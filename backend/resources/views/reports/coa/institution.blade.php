@extends('reports.coa.layout')

@section('content')
    @php
        $clientName = $clientName ?? ($client['name'] ?? ($client->name ?? '-'));
        $clientPhone = $clientPhone ?? ($client['phone'] ?? ($client->phone ?? '-'));
        $printedAt = $printedAt ?? ($printed_at ?? now());
        $receivedAt = $receivedAt ?? ($sample['received_at'] ?? ($sample->received_at ?? null));
        $testDate = $testDate ?? ($report['test_date'] ?? ($report->test_date ?? null));
        $items = $items ?? ($reportItems ?? ($report_items ?? []));

        // Format dates
        $fmtDate = function ($dt) {
            return $dt ? \Carbon\Carbon::parse($dt)->format('d/m/Y') : '-';
        };
    @endphp

    {{-- HEADER --}}
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

    {{-- JUDUL --}}
    <div class="text-center text-bold" style="margin: 15px 0; font-size:14px;">
        LAPORAN HASIL UJI<br>
        <span class="italic" style="font-weight:normal;">CERTIFICATE OF ANALYSIS (COA)</span>
    </div>

    {{-- INFORMASI --}}
    <table class="info-table" width="100%">
        <tr>
            {{-- KOLOM KIRI --}}
            <td width="55%">
                <table width="100%">
                    <tr>
                        <td width="40%">No. Rekaman</td>
                        <td>: <b>RevREK/LAB-BM/ADM/02/</b></td>
                    </tr>
                    <tr>
                        <td>Nama Pelanggan Permintaan Pengujian/ Instansi Pengirim<br><span
                                class="italic text-small">Customer's Name/sender</span></td>
                        <td>: {{ $clientName }}</td>
                    </tr>
                    <tr>
                        <td>No. Handphone</td>
                        <td>: {{ $clientPhone }}</td>
                    </tr>
                    <tr>
                        <td>Metode Pengujian<br><span class="italic text-small">Test Method</span></td>
                        <td>
                            : qRT-PCR<br>
                            &nbsp; IKM/LAB-BM/TKS/01<br>
                            &nbsp; EKSTRAKSI RNA METODE SPIN KOLOM<br>
                            &nbsp; IKM/LAB-BM/TKS/03<br>
                            &nbsp; PENCAMPURAN RNA-PCR REAGEN DAN<br>
                            &nbsp; PEMBACAAN qRT-PCR
                        </td>
                    </tr>
                    <tr>
                        <td>Peralatan / <span class="italic text-small">Machine</span></td>
                        <td>: Real-Time PCR CFX96 Merk Bio-Rad</td>
                    </tr>
                </table>
            </td>

            {{-- KOLOM KANAN --}}
            <td width="45%" style="padding-left:10px;">
                <table width="100%">
                    <tr>
                        <td width="50%">Tanggal Validasi Hasil<br><span class="italic text-small">Validation Date</span>
                        </td>
                        <td>: {{ $fmtDate($printedAt) }}</td>
                        <td class="text-xs text-right">Sign by</td>
                    </tr>
                    <tr>
                        <td>Tanggal Cetak Hasil<br><span class="italic text-small">Print out date</span></td>
                        <td>: {{ $fmtDate($printedAt) }}</td>
                        <td class="text-xs text-right">Sign by</td>
                    </tr>
                    <tr>
                        <td>Tanggal Keluar Hasil<br><span class="italic text-small">Date of Result</span></td>
                        <td>: {{ $fmtDate($printedAt) }}</td>
                        <td></td>
                    </tr>
                    <tr>
                        <td>Tipe Sampel / <span class="italic text-small">Sample Type</span></td>
                        <td>: Cairan Tubuh Manusia</td>
                        <td></td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>

    <table class="info-table" style="margin-top:5px;">
        <tr>
            <td width="22%">Referensi Metode / <span class="italic text-small">Method Reference</span></td>
            <td>: WHO, 2020</td>
        </tr>
        <tr>
            <td>Parameter Pengujian / <span class="italic text-small">Parameter of examination</span></td>
            <td>: SARS-CoV-2</td>
        </tr>
        <tr>
            <td>Tanggal Penerimaan Sampel / <span class="italic text-small">Date Received</span></td>
            <td>: {{ $fmtDate($receivedAt) }}</td>
        </tr>
        <tr>
            <td>Tanggal Pelaksanaan Pengujian / <span class="italic text-small">Date of Testing</span></td>
            <td>: {{ $fmtDate($testDate) }}</td>
        </tr>
        <tr>
            <td>Tempat Analisa / <span class="italic text-small">Location of Analysis</span></td>
            <td>: Laboratorium Biomolekuler Universitas Sam Ratulangi Manado</td>
        </tr>
        <tr>
            <td>Tujuan Pengujian / <span class="italic text-small">Aim Of The Test</span></td>
            <td>: Surveilans</td>
        </tr>
    </table>

    {{-- TABEL HASIL - PERBEDAAN DENGAN MANDIRI ADA DISINI --}}
    <table class="bordered" style="margin-top:10px; text-align:center;">
        <tr style="background-color: #f2f2f2;">
            <th rowspan="2" width="25%">Nama Pelanggan<br><span class="italic text-small">Customer Name</span></th>
            <th rowspan="2" width="15%">Kode Sampel Lab<br><span class="italic text-small">Lab Sample ID</span></th>
            <th colspan="3">Gen Target (Targeted Gene)</th>
            <th rowspan="2" width="20%">Hasil Pengujian<br><span class="italic text-small">Result</span></th>
        </tr>
        <tr style="background-color: #f2f2f2;">
            <th width="10%">ORF1b</th>
            <th width="10%">RdRp</th>
            <th width="10%">RPP30</th>
        </tr>
        @forelse($items as $item)
            <tr>
                <td>{{ $item['client_name'] ?? $clientName }}</td>
                <td>{{ $item['sample_id'] ?? '-' }}</td>
                <td>{{ $item['orf1b'] ?? '-' }}</td>
                <td>{{ $item['rdrp'] ?? '-' }}</td>
                <td>{{ $item['rpp30'] ?? '-' }}</td>
                <td class="text-bold">{{ strtoupper($item['result'] ?? '-') }}</td>
            </tr>
        @empty
            <tr>
                <td colspan="6">Data tidak tersedia.</td>
            </tr>
        @endforelse
    </table>

    {{-- QC & INTERPRETASI --}}
    <table width="100%" style="margin-top:10px;">
        <tr>
            <td width="30%" valign="top">
                <table class="bordered text-small" width="100%">
                    <tr style="background-color: #f2f2f2;">
                        <th colspan="3">Quality Control</th>
                    </tr>
                    <tr>
                        <td></td>
                        <td align="center">QC Positive</td>
                        <td align="center">QC Negative</td>
                    </tr>
                    <tr>
                        <td>ORF1b</td>
                        <td align="center">+</td>
                        <td align="center">-</td>
                    </tr>
                    <tr>
                        <td>RdRp</td>
                        <td align="center">+</td>
                        <td align="center">-</td>
                    </tr>
                    <tr>
                        <td>RPP30</td>
                        <td align="center">+</td>
                        <td align="center">-</td>
                    </tr>
                </table>
            </td>
            <td width="70%" valign="top" style="padding-left:15px;">
                <div style="border:1px solid #000; padding:5px;">
                    <div class="text-bold text-small">Interpretasi Hasil/Result Interpretation</div>
                    <div class="text-small mt-5">
                        Hasil Positif atau terdeteksi menunjukan bahwa pada sampel terdeteksi material genetik
                        SARS-CoV-2<br>
                        <span class="italic">Positive or Detected results indicate that the SARS-CoV-2 genetic material was
                            detected in the sample.</span>
                    </div>
                    <div class="text-small mt-5">
                        Hasil negatif atau tidak terdeteksi menunjukan bahwa material genetik SARS-CoV-2 yang dimaksud tidak
                        ditemukan di dalam sampel atau kadar sampel belum dapat terdeteksi oleh alat.<br>
                        <span class="italic">Negative or Undetectable results indicate that the SARS-CoV-2 genetic material
                            in question was not detected in the sample or sample levels could be detected by the
                            instrument.</span>
                    </div>
                </div>
            </td>
        </tr>
    </table>

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