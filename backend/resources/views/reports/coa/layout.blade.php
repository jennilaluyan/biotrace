<!doctype html>
<html lang="id">

<head>
    <meta charset="utf-8">
    <title>{{ $title ?? 'Sertifikat Hasil Pengujian' }}</title>

    <style>
        @page {
            margin: 18mm 14mm 18mm 14mm;
        }

        body {
            font-family: DejaVu Sans, sans-serif;
            font-size: 11px;
            color: #000;
            line-height: 1.35;
        }

        .text-center {
            text-align: center;
        }

        .text-right {
            text-align: right;
        }

        .text-bold {
            font-weight: bold;
        }

        .small {
            font-size: 9px;
        }

        .xs {
            font-size: 8px;
        }

        .mb-6 {
            margin-bottom: 6px;
        }

        .mb-10 {
            margin-bottom: 10px;
        }

        .mt-6 {
            margin-top: 6px;
        }

        .mt-10 {
            margin-top: 10px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        .tbl th,
        .tbl td {
            border: 1px solid #000;
            padding: 5px 6px;
            vertical-align: top;
        }

        .no-border td,
        .no-border th {
            border: none;
            padding: 0;
        }

        .header td {
            border: none;
            vertical-align: middle;
        }

        .hr {
            border-top: 2px solid #000;
            margin: 6px 0 10px 0;
        }

        .label {
            width: 35%;
        }

        .value {
            width: 65%;
        }

        .signature-box {
            border: 1px solid #000;
            padding: 8px;
            height: 85px;
        }

        .page-footer {
            position: fixed;
            bottom: -10mm;
            left: 0;
            right: 0;
            font-size: 8px;
            text-align: center;
        }
    </style>
</head>

<body>
    @yield('content')

    <div class="page-footer">
        {{ $footer_text ?? '' }}
    </div>
</body>

</html>