@extends('reports.coa.layout')

@section('content')
    @php
        $number = $loa->number ?? ($payload['loa_number'] ?? '-');
        $year = \Illuminate\Support\Carbon::now()->format('Y');

        $clientName = data_get($client, 'name', '-');
        $clientOrg = data_get($client, 'organization', '-');

        $sampleLabCode = data_get($sample, 'lab_sample_code', data_get($payload, 'lab_sample_code', '-'));
        $sampleType = data_get($sample, 'sample_type', data_get($payload, 'sample_type', '-'));

        $today = \Illuminate\Support\Carbon::now();
        $day = $today->translatedFormat('l'); // e.g. Senin
        $date = $today->format('d');
        $month = $today->translatedFormat('F');
    @endphp

    <style>
        body {
            font-family: Arial, sans-serif;
            font-size: 11px;
            line-height: 1.25;
            color: #000;
        }

        .title {
            text-align: center;
            font-weight: bold;
            margin: 18px 0 10px;
        }

        .muted {
            font-size: 10px;
        }

        .line {
            border-top: 1px solid #000;
            margin: 8px 0;
        }

        .dots {
            border-bottom: 1px dotted #000;
            display: inline-block;
            min-width: 220px;
            height: 14px;
        }

        .field td {
            padding: 2px 0;
            vertical-align: top;
        }

        .sign-block {
            margin-top: 28px;
        }

        .sign-col {
            width: 50%;
            text-align: center;
        }

        .sign-title {
            font-weight: bold;
        }

        .sign-space {
            height: 60px;
        }

        .form-footer {
            position: fixed;
            bottom: 0;
            right: 0;
            font-size: 10px;
            font-weight: bold;
            text-align: right;
        }
    </style>

    <table class="header-table" width="100%" cellspacing="0" cellpadding="0">
        <tr>
            <td width="15%" align="left">
                <img src="{{ public_path('logo-unsrat.png') }}" style="height:80px;">
            </td>
            <td width="70%" align="center">
                <div style="font-size:20px; font-weight:bold; letter-spacing: 1px;">LABORATORIUM BIOMOLEKULER</div>
                <div style="font-size:18px; font-weight:bold;">UNIVERSITAS SAM RATULANGI</div>
                <div style="font-size:12px; font-weight:bold;">SAM RATULANGI UNIVERSITY</div>
                <div style="font-size:12px; font-weight:bold;">BIOMOLECULAR LABORATORY</div>
            </td>
            <td width="15%"></td>
        </tr>
    </table>

    <div style="background-color:#b30000;height:3px;margin-top:5px;"></div>

    <table width="100%" style="font-size: 8.5px; margin-top: 2px; border-bottom: 1px solid black; padding-bottom: 2px;">
        <tr>
            <td width="75%">
                Jalan Kampus Universitas Sam Ratulangi Manado 95115 &nbsp; Telepon 0813 4396 6554 &nbsp;
                E-mail labbiomolekuler@unsrat.ac.id &nbsp; Laman http://biomolekuler.unsrat.ac.id/
            </td>
            <td width="25%" align="right">
                <b>No. Rekaman : REK/LAB-BM/ADM/25/</b>
            </td>
        </tr>
    </table>

    <div class="title">
        BERITA ACARA<br>
        <span class="muted">No. {{ $number }}</span>
    </div>

    <p>
        Pada hari ini, <span class="dots">{{ $day }}</span> tanggal <span class="dots">{{ $date }}</span>
        Bulan <span class="dots">{{ $month }}</span> tahun {{ $year }}, kami yang bertanda tangan dibawah ini :
    </p>

    <table class="field" width="100%">
        <tr>
            <td width="18%">Nama</td>
            <td width="2%">:</td>
            <td>{{ $clientName }}</td>
        </tr>
        <tr>
            <td>Jabatan</td>
            <td>:</td>
            <td>Pelanggan</td>
        </tr>
        <tr>
            <td>Instansi</td>
            <td>:</td>
            <td>{{ $clientOrg }}</td>
        </tr>
    </table>

    <p style="margin-top:10px; font-weight:bold;">Selanjutnya disebut PIHAK PERTAMA</p>

    <table class="field" width="100%">
        <tr>
            <td width="18%">Nama</td>
            <td width="2%">:</td>
            <td>Laboratorium Biomolekuler UNSRAT</td>
        </tr>
        <tr>
            <td>Jabatan</td>
            <td>:</td>
            <td>Petugas Laboratorium</td>
        </tr>
        <tr>
            <td>Instansi</td>
            <td>:</td>
            <td>Universitas Sam Ratulangi</td>
        </tr>
    </table>

    <p style="margin-top:10px; font-weight:bold;">Selanjutnya disebut PIHAK KEDUA</p>

    <p style="font-weight:bold; margin-top: 16px;">Keterangan :</p>
    <p style="margin-top: 6px;">
        Berita acara penerimaan sampel untuk pengujian. Detail sampel:<br>
        - Kode Sampel Lab: <b>{{ $sampleLabCode }}</b><br>
        - Tipe Sampel: <b>{{ $sampleType }}</b>
    </p>

    <div class="line"></div>
    <p style="margin-top: 10px;">
        Demikian berita acara ini dibuat untuk dapat digunakan sebagaimana mestinya
    </p>

    <table class="sign-block" width="100%">
        <tr>
            <td class="sign-col">
                <div class="sign-title">Yang menerima :<br>PIHAK KEDUA</div>
                <div class="sign-space"></div>
                ( <span class="dots" style="min-width:220px;"></span> )
            </td>
            <td class="sign-col">
                <div class="sign-title">Yang menyerahkan :<br>PIHAK PERTAMA</div>
                <div class="sign-space"></div>
                ( <span class="dots" style="min-width:220px;"></span> )
            </td>
        </tr>
    </table>

    <div class="form-footer">
        FORM/LAB-BM/ADM/25.Rev00.31-01-24
    </div>
@endsection