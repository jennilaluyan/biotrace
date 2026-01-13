<!DOCTYPE html>
<html lang="id">

<head>
    <meta charset="UTF-8">
    <title>Verifikasi Dokumen COA</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: #f5f5f5;
        }

        .card {
            max-width: 640px;
            margin: 60px auto;
            background: white;
            padding: 30px;
            border-radius: 8px;
            border: 1px solid #ddd;
        }

        .status-valid {
            color: #0a8a0a;
            font-weight: bold;
            font-size: 20px;
        }

        .row {
            margin: 10px 0;
        }

        .label {
            color: #555;
            font-size: 13px;
        }

        .value {
            font-weight: bold;
        }

        .footer {
            margin-top: 30px;
            font-size: 12px;
            color: #777;
        }
    </style>
</head>

<body>

    <div class="card">
        <div class="status-valid">✔ DOKUMEN VALID</div>

        <div class="row">
            <div class="label">Nomor Laporan</div>
            <div class="value">{{ $report->report_no }}</div>
        </div>

        <div class="row">
            <div class="label">Nama Pelanggan</div>
            <div class="value">{{ $client->name ?? '-' }}</div>
        </div>

        <div class="row">
            <div class="label">Tanggal Terbit</div>
            <div class="value">{{ optional($report->created_at)->format('d M Y') }}</div>
        </div>

        <div class="row">
            <div class="label">Tanggal Finalisasi</div>
            <div class="value">{{ optional($report->updated_at)->format('d M Y') }}</div>
        </div>

        <div class="row">
            <div class="label">Hash Dokumen</div>
            <div class="value" style="font-size:11px; word-break: break-all;">
                {{ $hash }}
            </div>
        </div>

        <div class="footer">
            Dokumen ini diverifikasi langsung dari sistem BioTrace dan
            sah tanpa tanda tangan basah.
        </div>
    </div>

</body>

</html>