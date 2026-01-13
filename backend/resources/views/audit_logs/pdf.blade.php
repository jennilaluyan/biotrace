<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Audit Logs</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            font-size: 10px;
        }
        h1 {
            font-size: 14px;
            margin-bottom: 10px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            border: 1px solid #000;
            padding: 4px;
            text-align: left;
        }
        th {
            background: #eee;
        }
    </style>
</head>
<body>

<h1>Audit Logs</h1>

<p>
    Generated at: {{ now()->format('Y-m-d H:i:s') }}
</p>

<table>
    <thead>
        <tr>
            <th>Timestamp</th>
            <th>Action</th>
            <th>Entity</th>
            <th>Entity ID</th>
            <th>Staff ID</th>
        </tr>
    </thead>
    <tbody>
        @foreach ($logs as $log)
            <tr>
                <td>{{ $log->timestamp }}</td>
                <td>{{ $log->action }}</td>
                <td>{{ $log->entity_name }}</td>
                <td>{{ $log->entity_id }}</td>
                <td>{{ $log->staff_id }}</td>
            </tr>
        @endforeach
    </tbody>
</table>

</body>
</html>
