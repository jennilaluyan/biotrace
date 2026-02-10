<!doctype html>
<html lang="id">

<head>
    <meta charset="utf-8">
    <title>{{ $title ?? 'Laporan Hasil Uji' }}</title>

    <style>
        @page {
            /* Margin atas/bawah disesuaikan untuk header & footer */
            margin: 10mm 15mm 15mm 15mm;
        }

        body {
            font-family: Arial, sans-serif;
            font-size: 11px;
            color: #000;
            line-height: 1.2;
            text-align: left;
        }

        /* Helper Classes */
        .text-center {
            text-align: center;
        }

        .text-right {
            text-align: right;
        }

        .text-bold {
            font-weight: bold;
        }

        .text-small {
            font-size: 9px;
        }

        .text-xs {
            font-size: 8px;
        }

        .italic {
            font-style: italic;
        }

        .mb-5 {
            margin-bottom: 5px;
        }

        .mt-5 {
            margin-top: 5px;
        }

        /* Tabel Standar */
        table {
            width: 100%;
            border-collapse: collapse;
        }

        td,
        th {
            vertical-align: top;
            padding: 2px;
        }

        /* Tabel dengan Border (untuk Hasil & QC) */
        .bordered {
            width: 100%;
            border-collapse: collapse;
        }

        .bordered th,
        .bordered td {
            border: 1px solid #000;
            padding: 4px;
            vertical-align: middle;
        }

        /* Header Table Style (Tanpa Border) */
        .header-table td {
            border: none;
            vertical-align: middle;
            padding: 0;
        }

        /* Info Table (Titik dua sejajar) */
        .info-table td {
            border: none;
            padding: 1px 0;
        }

        /* Bagian Tanda Tangan */
        .signature-section {
            margin-top: 20px;
            page-break-inside: avoid;
        }

        /* Footer Form Number (Pojok Kanan Bawah) */
        .form-footer {
            position: fixed;
            bottom: 0;
            right: 0;
            font-size: 9px;
            font-weight: bold;
        }

        /* Logo KAN Container */
        .kan-box {
            text-align: center;
            font-size: 8px;
            font-weight: bold;
        }

        /* Garis Pemisah Header */
        .header-line {
            border-bottom: 2px solid #000;
            margin-top: 5px;
            margin-bottom: 2px;
        }
    </style>
</head>

<body>
    @yield('content')
</body>

</html>