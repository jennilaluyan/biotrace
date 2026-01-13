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
            text-align: center;
        }

        .status-invalid {
            color: #c0392b;
            font-weight: bold;
            font-size: 20px;
        }
    </style>
</head>

<body>

    <div class="card">
        <div class="status-invalid">✖ DOKUMEN TIDAK VALID</div>

        <p style="margin-top:20px;">
            Dokumen tidak ditemukan atau belum difinalisasi.
        </p>

        <p style="font-size:12px; color:#777;">
            Hash: {{ $hash }}
        </p>
    </div>

</body>

</html>