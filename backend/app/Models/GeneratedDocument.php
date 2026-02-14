<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GeneratedDocument extends Model
{
    protected $table = 'generated_documents';
    protected $primaryKey = 'gen_doc_id';
    public $incrementing = true;
    protected $keyType = 'int';

    protected $fillable = [
        'doc_code',
        'entity_type',
        'entity_id',
        'record_no',
        'form_code',
        'revision_no',
        'template_version',
        'file_pdf_id',
        'file_docx_id',
        'generated_by',
        'generated_at',
        'is_active',
    ];

    protected $casts = [
        'entity_id' => 'int',
        'revision_no' => 'int',
        'template_version' => 'int',
        'file_pdf_id' => 'int',
        'file_docx_id' => 'int',
        'generated_by' => 'int',
        'is_active' => 'bool',
        'generated_at' => 'datetime',
    ];
}