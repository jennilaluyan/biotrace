@extends('reports.coa.layout')

@section('content')
    @php
        $clientName = $client->name ?? '-';
        $phone = $client->phone ?? '-';

        $reportGeneratedAt = $report->generated_at ? \Carbon\Carbon::parse($report->generated_at) : now();
        $validationDate = $reportGeneratedAt->format('d/m/Y');
        $printedAt = $reportGeneratedAt->format('d/m/Y');

        $receivedAt = isset($sample->received_at) ? \Carbon\Carbon::parse($sample->received_at)->format('d/m/Y') : '-';
        $testDate = isset($report->test_date) ? \Carbon\Carbon::parse($report->test_date)->format('d/m/Y') : '-';

        $items = $items ?? ($reportItems ?? []);
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
                        <td>: <b>RevREK/LAB-BM/ADM/16/</b></td>
                    </tr>
                    <tr>
                        <td>Nama Pelanggan Permintaan Pengujian/ Instansi Pengirim<br><span
                                class="italic text-small">Customer's Name/sender</span></td>
                        <td>: {{ $clientName }}</td>
                    </tr>
                    <tr>
                        <td>No. Handphone</td>
                        <td>: {{ $phone }}</td>
                    </tr>
                    <tr>
                        <td>Metode Pengujian<br><span class="italic text-small">Test Method</span></td>
                        <td>
                            : <b>Next Genome Sequencing (NGS)</b><br>
                            &nbsp; IKM/LAB-BM/TKS/01 EKSTRAKSI RNA METODE<br>
                            &nbsp; SPIN KOLOM<br>
                            &nbsp; IKM/LAB-BM/TKS/04 NEXT GENERATION<br>
                            &nbsp; SEQUENCING
                        </td>
                    </tr>
                    <tr>
                        <td>Peralatan / <span class="italic text-small">Machine</span></td>
                        <td>: Illumina Miseq</td>
                    </tr>
                </table>
            </td>

            {{-- KOLOM KANAN --}}
            <td width="45%" style="padding-left:10px;">
                <table width="100%">
                    <tr>
                        <td width="50%">Tanggal Validasi Hasil<br><span class="italic text-small">Validation Date</span>
                        </td>
                        <td>: {{ $validationDate }}</td>
                        <td class="text-xs text-right">Sign by</td>
                    </tr>
                    <tr>
                        <td>Tanggal Cetak Hasil<br><span class="italic text-small">Print out date</span></td>
                        <td>: {{ $printedAt }}</td>
                        <td class="text-xs text-right">Sign by</td>
                    </tr>
                    <tr>
                        <td>Tanggal Keluar Hasil<br><span class="italic text-small">Date of Result</span></td>
                        <td>: {{ $printedAt }}</td>
                        <td></td>
                    </tr>
                    <tr>
                        <td>Tipe Sampel / <span class="italic text-small">Sample Type</span></td>
                        <td>: DNA</td>
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
            <td>: {{ $receivedAt }}</td>
        </tr>
        <tr>
            <td>Tanggal Pelaksanaan Pengujian / <span class="italic text-small">Date of Testing</span></td>
            <td>: {{ $testDate }}</td>
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

    {{-- TABEL HASIL WGS --}}
    <table class="bordered" style="margin-top:10px; text-align:center;">
        <tr style="background-color: #f2f2f2;">
            <th rowspan="2" width="25%">Customer's Name</th>
            <th rowspan="2" width="25%">Sampel ID</th>
            <th colspan="2">SEQUENCE RESULT</th>
        </tr>
        <tr style="background-color: #f2f2f2;">
            <th width="25%">LINEAGE</th>
            <th width="25%">VARIAN</th>
        </tr>
        @forelse($items as $item)
            <tr>
                <td>{{ $item['client_name'] ?? $clientName }}</td>
                <td>{{ $item['sample_id'] ?? '-' }}</td>
                <td>{{ $item['lineage'] ?? '-' }}</td>
                <td>{{ $item['variant'] ?? '-' }}</td>
            </tr>
        @empty
            {{-- Baris kosong jika tidak ada data, sesuai contoh PDF yang ada grid kosongnya --}}
            @for($i = 0; $i < 5; $i++)
                <tr>
                    <td style="height:20px;"></td>
                    <td></td>
                    <td></td>
                    <td></td>
                </tr>
            @endfor
        @endforelse
    </table>

    {{-- TTD --}}
    <table width="100%" class="signature-section" style="margin-top:40px;">
        <tr>
            <td width="50%"></td>
            <td width="50%" align="center">
                <div class="text-bold">
                    KEPALA UNIT PENUNJANG AKADEMIK (UPA)<br>
                    LABORATORIUM BIOMOLEKULER UNSRAT
                </div>

                <div style="height: 80px; margin: 10px 0;">
                    @if(!empty($lh_signature_data_uri))
                        <img src="{{ $lh_signature_data_uri }}" style="width:80px; height:80px;">
                    @elseif(!empty($qr_data_uri))
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