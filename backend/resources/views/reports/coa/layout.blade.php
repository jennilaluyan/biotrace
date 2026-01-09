<!doctype html>
<html lang="id">

<head>
    <meta charset="utf-8">
    <title>{{ $title ?? 'Sertifikat Hasil Uji (CoA)' }}</title>
    <style>
        @page {
            size: A4;
            margin: 18mm 15mm 18mm 15mm;
        }

        body {
            font-family: DejaVu Sans, sans-serif;
            font-size: 11pt;
            color: #111;
        }

        .center {
            text-align: center;
        }

        .right {
            text-align: right;
        }

        .bold {
            font-weight: 700;
        }

        .small {
            font-size: 10pt;
        }

        .mt-8 {
            margin-top: 8mm;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        td,
        th {
            vertical-align: top;
            padding: 4px 6px;
        }

        .grid td,
        .grid th {
            border: 1px solid #333;
        }

        .no-border td {
            border: 0;
        }

        .section-title {
            margin-top: 6mm;
            font-weight: 700;
        }

        .hr {
            border-top: 1px solid #333;
            margin: 4mm 0;
        }
    </style>
</head>

<body>
    @yield('content')
</body>

</html>