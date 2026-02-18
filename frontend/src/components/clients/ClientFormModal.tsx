import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Building2, Mail, Phone, User, IdCard, Calendar, MapPin, Users, X } from "lucide-react";
import type { ClientType, CreateClientPayload, Client } from "../../services/clients";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

interface ClientFormModalProps {
    open: boolean;
    mode: "create" | "edit" | "view";
    initialClient?: Client | null;
    onClose: () => void;
    onSubmit: (payload: CreateClientPayload | Partial<CreateClientPayload>) => Promise<void> | void;
}

export const ClientFormModal = ({ open, mode, initialClient, onClose, onSubmit }: ClientFormModalProps) => {
    if (!open) return null;

    const isEdit = mode === "edit";
    const isView = mode === "view";

    const [type, setType] = useState<ClientType>(initialClient?.type ?? "individual");

    const [name, setName] = useState(initialClient?.name ?? "");
    const [phone, setPhone] = useState(initialClient?.phone ?? "");
    const [email, setEmail] = useState(initialClient?.email ?? "");

    const [nationalId, setNationalId] = useState(initialClient?.national_id ?? "");
    const [dateOfBirth, setDateOfBirth] = useState(initialClient?.date_of_birth ?? "");
    const [gender, setGender] = useState(initialClient?.gender ?? "");

    // Address KTP – UI dipecah, DB tetap satu kolom
    const [ktpStreet, setKtpStreet] = useState(initialClient?.address_ktp ?? "");
    const [ktpRtRw, setKtpRtRw] = useState("");
    const [ktpKelDesa, setKtpKelDesa] = useState("");
    const [ktpKecamatan, setKtpKecamatan] = useState("");
    const [ktpCity, setKtpCity] = useState("");
    const [ktpProvince, setKtpProvince] = useState("");

    const [addressDomicile, setAddressDomicile] = useState(initialClient?.address_domicile ?? "");

    const [institutionName, setInstitutionName] = useState(initialClient?.institution_name ?? "");
    const [institutionAddress, setInstitutionAddress] = useState(initialClient?.institution_address ?? "");
    const [contactPersonName, setContactPersonName] = useState(initialClient?.contact_person_name ?? "");
    const [contactPersonPhone, setContactPersonPhone] = useState(initialClient?.contact_person_phone ?? "");
    const [contactPersonEmail, setContactPersonEmail] = useState(initialClient?.contact_person_email ?? "");

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // sync state ketika initialClient / mode berubah
    useEffect(() => {
        setType(initialClient?.type ?? "individual");
        setName(initialClient?.name ?? "");
        setPhone(initialClient?.phone ?? "");
        setEmail(initialClient?.email ?? "");

        setNationalId(initialClient?.national_id ?? "");
        setDateOfBirth(initialClient?.date_of_birth ?? "");
        setGender(initialClient?.gender ?? "");

        setKtpStreet(initialClient?.address_ktp ?? "");
        setKtpRtRw("");
        setKtpKelDesa("");
        setKtpKecamatan("");
        setKtpCity("");
        setKtpProvince("");

        setAddressDomicile(initialClient?.address_domicile ?? "");

        setInstitutionName(initialClient?.institution_name ?? "");
        setInstitutionAddress(initialClient?.institution_address ?? "");
        setContactPersonName(initialClient?.contact_person_name ?? "");
        setContactPersonPhone(initialClient?.contact_person_phone ?? "");
        setContactPersonEmail(initialClient?.contact_person_email ?? "");

        setError(null);
        setSubmitting(false);
    }, [initialClient, mode]);

    // ESC close
    useEffect(() => {
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, [onClose]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (isView) {
            onClose();
            return;
        }

        setError(null);

        if (!name.trim()) {
            setError("Nama wajib diisi.");
            return;
        }

        if (!email.trim()) {
            setError("Email wajib diisi.");
            return;
        }

        // Validasi NIK: hanya angka & 16 digit (kalau diisi)
        if (type === "individual" && nationalId.trim()) {
            const nikClean = nationalId.replace(/\D/g, "");
            if (nikClean.length !== 16) {
                setError("NIK harus tepat 16 digit.");
                return;
            }
        }

        // Gabungkan alamat KTP jadi satu baris untuk database
        const ktpParts: string[] = [];
        if (ktpStreet.trim()) ktpParts.push(ktpStreet.trim());
        if (ktpRtRw.trim()) ktpParts.push(`RT/RW ${ktpRtRw.trim()}`);
        if (ktpKelDesa.trim()) ktpParts.push(`Kel/Desa ${ktpKelDesa.trim()}`);
        if (ktpKecamatan.trim()) ktpParts.push(`Kec. ${ktpKecamatan.trim()}`);
        if (ktpCity.trim() && ktpProvince.trim()) {
            ktpParts.push(`${ktpCity.trim()}, ${ktpProvince.trim()}`);
        } else if (ktpCity.trim()) {
            ktpParts.push(ktpCity.trim());
        } else if (ktpProvince.trim()) {
            ktpParts.push(ktpProvince.trim());
        }
        const combinedKtpAddress = ktpParts.length > 0 ? ktpParts.join(", ") : null;

        const payload: CreateClientPayload = {
            type,
            name: name.trim(),
            phone: phone || null,
            email: email.trim(),

            national_id: nationalId ? nationalId.replace(/\D/g, "") : null,
            date_of_birth: dateOfBirth || null,
            gender: gender || null,
            address_ktp: combinedKtpAddress,
            address_domicile: addressDomicile || null,

            institution_name: institutionName || null,
            institution_address: institutionAddress || null,
            contact_person_name: contactPersonName || null,
            contact_person_phone: contactPersonPhone || null,
            contact_person_email: contactPersonEmail || null,
        };

        try {
            setSubmitting(true);
            await onSubmit(payload);
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                "Gagal menyimpan client. Periksa kembali data yang diisi.";
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const title = mode === "create" ? "Tambah Client" : mode === "edit" ? "Edit Client" : "Detail Client";
    const disabled = submitting || isView;

    // helper input NIK: filter digit saja, max 16
    const handleNikChange = (value: string) => {
        const onlyDigits = value.replace(/\D/g, "");
        if (onlyDigits.length <= 16) {
            setNationalId(onlyDigits);
        }
    };

    const typeIcon = type === "institution" ? <Building2 size={16} /> : <User size={16} />;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onClick={submitting ? undefined : onClose} aria-hidden="true" />

            <div
                className="relative w-full max-w-2xl rounded-2xl bg-white shadow-lg border border-gray-100 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white">
                                {typeIcon}
                            </span>
                            <div className="min-w-0">
                                <h2 className="text-sm font-bold text-gray-900">{title}</h2>
                                <div className="text-xs text-gray-600 mt-0.5">
                                    {isView ? "Mode tampilan saja." : "Isi data dengan benar untuk keperluan dokumen dan komunikasi."}
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        className={cx("lims-icon-button text-gray-600", submitting && "opacity-60 cursor-not-allowed")}
                        onClick={onClose}
                        aria-label="Tutup"
                        title="Tutup"
                        disabled={submitting}
                    >
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
                    {error ? (
                        <div className="text-sm text-red-800 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">
                            {error}
                        </div>
                    ) : null}

                    {/* Type toggle */}
                    <div className="flex gap-3 items-center">
                        <label className="text-xs font-semibold text-gray-700">Tipe client</label>
                        <div className="inline-flex rounded-full bg-gray-100 p-1 text-xs">
                            <button
                                type="button"
                                onClick={() => !isView && setType("individual")}
                                className={cx(
                                    "px-3 py-1 rounded-full inline-flex items-center gap-2",
                                    type === "individual" ? "bg-white shadow text-gray-900" : "text-gray-500"
                                )}
                                disabled={isView}
                            >
                                <User size={14} />
                                Individual
                            </button>
                            <button
                                type="button"
                                onClick={() => !isView && setType("institution")}
                                className={cx(
                                    "px-3 py-1 rounded-full inline-flex items-center gap-2",
                                    type === "institution" ? "bg-white shadow text-gray-900" : "text-gray-500"
                                )}
                                disabled={isView}
                            >
                                <Building2 size={14} />
                                Institution
                            </button>
                        </div>
                    </div>

                    {/* Common fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Nama <span className="text-red-600">*</span>
                            </label>
                            <input
                                type="text"
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={type === "individual" ? "Nama lengkap client" : "Nama institusi"}
                                disabled={disabled}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Email <span className="text-red-600">*</span>
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                    <Mail size={14} />
                                </span>
                                <input
                                    type="email"
                                    className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Email kontak"
                                    disabled={disabled}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Telepon</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                    <Phone size={14} />
                                </span>
                                <input
                                    type="text"
                                    className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                    value={phone ?? ""}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="Nomor telepon"
                                    disabled={disabled}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Individual section */}
                    {type === "individual" ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">NIK</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                            <IdCard size={14} />
                                        </span>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={16}
                                            className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                            value={nationalId}
                                            onChange={(e) => handleNikChange(e.target.value)}
                                            disabled={disabled}
                                        />
                                    </div>
                                    <p className="mt-1 text-[11px] text-gray-500">16 digit angka sesuai KTP (opsional).</p>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Tanggal lahir</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                            <Calendar size={14} />
                                        </span>
                                        <input
                                            type="date"
                                            className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                            value={dateOfBirth ?? ""}
                                            onChange={(e) => setDateOfBirth(e.target.value)}
                                            disabled={disabled}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Gender</label>
                                    <select
                                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                        value={gender ?? ""}
                                        onChange={(e) => setGender(e.target.value)}
                                        disabled={disabled}
                                    >
                                        <option value="">Pilih gender</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                </div>
                            </div>

                            {/* Address KTP detail */}
                            <div className="border border-gray-100 rounded-xl p-3 md:p-4 bg-gray-50/60">
                                <p className="text-xs font-semibold text-gray-700 mb-2 inline-flex items-center gap-2">
                                    <MapPin size={14} />
                                    Alamat (KTP)
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="md:col-span-2">
                                        <label className="block text-[11px] font-medium text-gray-600 mb-1">
                                            Jalan / alamat lengkap
                                        </label>
                                        <input
                                            type="text"
                                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                            value={ktpStreet}
                                            onChange={(e) => setKtpStreet(e.target.value)}
                                            placeholder="mis. Jl. Sam Ratulangi No. 10"
                                            disabled={disabled}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-medium text-gray-600 mb-1">RT / RW</label>
                                        <input
                                            type="text"
                                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                            value={ktpRtRw}
                                            onChange={(e) => setKtpRtRw(e.target.value)}
                                            placeholder="mis. 001/002"
                                            disabled={disabled}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-medium text-gray-600 mb-1">Kelurahan / Desa</label>
                                        <input
                                            type="text"
                                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                            value={ktpKelDesa}
                                            onChange={(e) => setKtpKelDesa(e.target.value)}
                                            disabled={disabled}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-medium text-gray-600 mb-1">Kecamatan</label>
                                        <input
                                            type="text"
                                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                            value={ktpKecamatan}
                                            onChange={(e) => setKtpKecamatan(e.target.value)}
                                            disabled={disabled}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-medium text-gray-600 mb-1">Kota / Kabupaten</label>
                                        <input
                                            type="text"
                                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                            value={ktpCity}
                                            onChange={(e) => setKtpCity(e.target.value)}
                                            disabled={disabled}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-medium text-gray-600 mb-1">Provinsi</label>
                                        <input
                                            type="text"
                                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                            value={ktpProvince}
                                            onChange={(e) => setKtpProvince(e.target.value)}
                                            disabled={disabled}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Alamat domisili</label>
                                <input
                                    type="text"
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                    value={addressDomicile ?? ""}
                                    onChange={(e) => setAddressDomicile(e.target.value)}
                                    disabled={disabled}
                                />
                            </div>
                        </div>
                    ) : null}

                    {/* Institution section */}
                    {type === "institution" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Nama institusi</label>
                                <input
                                    type="text"
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                    value={institutionName}
                                    onChange={(e) => setInstitutionName(e.target.value)}
                                    disabled={disabled}
                                />
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Alamat institusi</label>
                                <input
                                    type="text"
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                    value={institutionAddress}
                                    onChange={(e) => setInstitutionAddress(e.target.value)}
                                    disabled={disabled}
                                />
                            </div>

                            <div className="md:col-span-2">
                                <div className="text-xs font-semibold text-gray-700 mb-2 inline-flex items-center gap-2">
                                    <Users size={14} />
                                    Contact person
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Nama</label>
                                <input
                                    type="text"
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                    value={contactPersonName}
                                    onChange={(e) => setContactPersonName(e.target.value)}
                                    disabled={disabled}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Telepon</label>
                                <input
                                    type="text"
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                    value={contactPersonPhone}
                                    onChange={(e) => setContactPersonPhone(e.target.value)}
                                    disabled={disabled}
                                />
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
                                <input
                                    type="email"
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                    value={contactPersonEmail}
                                    onChange={(e) => setContactPersonEmail(e.target.value)}
                                    disabled={disabled}
                                />
                            </div>
                        </div>
                    ) : null}

                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="btn-outline" disabled={submitting}>
                            {isView ? "Tutup" : "Batal"}
                        </button>

                        {!isView ? (
                            <button
                                type="submit"
                                className={cx("lims-btn-primary", submitting && "opacity-60 cursor-not-allowed")}
                                disabled={submitting}
                            >
                                {submitting ? (isEdit ? "Menyimpan..." : "Membuat...") : isEdit ? "Simpan perubahan" : "Buat client"}
                            </button>
                        ) : null}
                    </div>
                </form>
            </div>
        </div>
    );
};
