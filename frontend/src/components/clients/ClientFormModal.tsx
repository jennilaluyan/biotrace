import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Mail, Phone, User, IdCard, Calendar, MapPin, Users, X, ShieldAlert, Loader2 } from "lucide-react";
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
    const { t } = useTranslation();

    // Pastikan ini hook dijalankan sebelum return
    const isEdit = mode === "edit";
    const isView = mode === "view";

    const [type, setType] = useState<ClientType>(initialClient?.type ?? "individual");
    const [name, setName] = useState(initialClient?.name ?? "");
    const [phone, setPhone] = useState(initialClient?.phone ?? "");
    const [email, setEmail] = useState(initialClient?.email ?? "");

    const [nationalId, setNationalId] = useState(initialClient?.national_id ?? "");
    const [dateOfBirth, setDateOfBirth] = useState(initialClient?.date_of_birth ?? "");
    const [gender, setGender] = useState(initialClient?.gender ?? "");

    // Address KTP
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

    // Sync state when initialClient/mode changes
    useEffect(() => {
        if (!open) return; // Skip if not open

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
    }, [initialClient, mode, open]);

    // ESC close
    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, [open, onClose]);

    if (!open) return null; // Render nothing if not open

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (isView) {
            onClose();
            return;
        }

        setError(null);

        if (!name.trim()) {
            setError(t("clients.form.validation.nameRequired", "Name is required."));
            return;
        }

        if (!email.trim()) {
            setError(t("clients.form.validation.emailRequired", "Email is required."));
            return;
        }

        if (type === "individual" && nationalId.trim()) {
            const nikClean = nationalId.replace(/\D/g, "");
            if (nikClean.length !== 16) {
                setError(t("clients.form.validation.nikInvalid", "NIK must be exactly 16 digits."));
                return;
            }
        }

        // Build KTP address
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
            const msg = err?.data?.message ?? err?.data?.error ?? t("errors.somethingWentWrong", "Something went wrong.");
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const modalTitle = mode === "create" ? t("clients.form.createTitle", "Create Client") : mode === "edit" ? t("clients.form.editTitle", "Edit Client") : t("clients.form.viewTitle", "Client Details");
    const modalHint = isView ? t("clients.form.viewHint", "View only mode.") : t("clients.form.editHint", "Fill in the data correctly.");
    const disabled = submitting || isView;

    const handleNikChange = (value: string) => {
        const onlyDigits = value.replace(/\D/g, "");
        if (onlyDigits.length <= 16) {
            setNationalId(onlyDigits);
        }
    };

    const typeIcon = type === "institution" ? <Building2 size={18} /> : <User size={18} />;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={submitting ? undefined : onClose} aria-hidden="true" />

            <div
                className="relative w-full max-w-2xl rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden transform transition-all flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm text-primary">
                            {typeIcon}
                        </span>
                        <div>
                            <h2 className="text-base font-bold text-gray-900">{modalTitle}</h2>
                            <p className="text-xs text-gray-500">{modalHint}</p>
                        </div>
                    </div>

                    <button
                        type="button"
                        className={cx("lims-icon-button text-gray-500 hover:bg-gray-200/50", submitting && "opacity-50 cursor-not-allowed")}
                        onClick={onClose}
                        aria-label={t("close", "Close")}
                        disabled={submitting}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="overflow-y-auto custom-scrollbar flex-1">
                    <form id="client-form" onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
                        {error ? (
                            <div className="text-sm text-red-800 bg-red-50 border border-red-200 px-4 py-3 rounded-xl flex items-start gap-2">
                                <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                                {error}
                            </div>
                        ) : null}

                        {/* Type toggle */}
                        <div className="flex items-center justify-between bg-gray-50 p-1.5 rounded-xl border border-gray-100">
                            <button
                                type="button"
                                onClick={() => !isView && setType("individual")}
                                className={cx(
                                    "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2",
                                    type === "individual"
                                        ? "bg-white text-primary shadow-sm ring-1 ring-black/5"
                                        : "text-gray-500 hover:bg-gray-200/50 hover:text-gray-700"
                                )}
                                disabled={isView}
                            >
                                <User size={16} />
                                {t("clients.badges.individual", "Individual")}
                            </button>
                            <button
                                type="button"
                                onClick={() => !isView && setType("institution")}
                                className={cx(
                                    "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2",
                                    type === "institution"
                                        ? "bg-white text-indigo-600 shadow-sm ring-1 ring-black/5"
                                        : "text-gray-500 hover:bg-gray-200/50 hover:text-gray-700"
                                )}
                                disabled={isView}
                            >
                                <Building2 size={16} />
                                {t("clients.badges.institution", "Institution")}
                            </button>
                        </div>

                        {/* Common fields */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="md:col-span-2 space-y-1">
                                <label className="text-xs font-semibold text-gray-700">
                                    {t("clients.table.name", "Name")} <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 focus:border-primary-soft disabled:bg-gray-50 disabled:text-gray-500 transition-shadow"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder={type === "individual" ? t("clients.form.placeholders.nameIndividual", "Client full name") : t("clients.form.placeholders.nameInstitution", "Institution name")}
                                    disabled={disabled}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-700">
                                    {t("clients.detail.labels.email", "Email")} <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                        <Mail size={16} />
                                    </span>
                                    <input
                                        type="email"
                                        className="w-full rounded-xl border border-gray-300 pl-10 pr-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 focus:border-primary-soft disabled:bg-gray-50 disabled:text-gray-500 transition-shadow"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder={t("clients.form.placeholders.email", "Contact email")}
                                        disabled={disabled}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-700">{t("clients.detail.labels.phone", "Phone")}</label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                        <Phone size={16} />
                                    </span>
                                    <input
                                        type="text"
                                        className="w-full rounded-xl border border-gray-300 pl-10 pr-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 focus:border-primary-soft disabled:bg-gray-50 disabled:text-gray-500 transition-shadow"
                                        value={phone ?? ""}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder={t("clients.form.placeholders.phone", "Phone number")}
                                        disabled={disabled}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Individual section */}
                        {type === "individual" ? (
                            <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">
                                    {t("clients.form.personalSection", "Personal profile")}
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-gray-700">{t("clients.detail.labels.nationalId", "National ID (NIK)")}</label>
                                        <div className="relative">
                                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                                <IdCard size={16} />
                                            </span>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                maxLength={16}
                                                className="w-full rounded-xl border border-gray-300 pl-10 pr-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 focus:border-primary-soft disabled:bg-gray-50 disabled:text-gray-500 transition-shadow"
                                                value={nationalId}
                                                onChange={(e) => handleNikChange(e.target.value)}
                                                placeholder={t("clients.form.placeholders.nik", "16 digit number")}
                                                disabled={disabled}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-gray-700">{t("clients.detail.labels.dob", "Date of birth")}</label>
                                        <div className="relative">
                                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                                <Calendar size={16} />
                                            </span>
                                            <input
                                                type="date"
                                                className="w-full rounded-xl border border-gray-300 pl-10 pr-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 focus:border-primary-soft disabled:bg-gray-50 disabled:text-gray-500 transition-shadow"
                                                value={dateOfBirth ?? ""}
                                                onChange={(e) => setDateOfBirth(e.target.value)}
                                                disabled={disabled}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-gray-700">{t("clients.detail.labels.gender", "Gender")}</label>
                                        <div className="relative">
                                            <select
                                                className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 focus:border-primary-soft disabled:bg-gray-50 disabled:text-gray-500 transition-shadow appearance-none"
                                                value={gender ?? ""}
                                                onChange={(e) => setGender(e.target.value)}
                                                disabled={disabled}
                                            >
                                                <option value="">Select gender</option>
                                                <option value="Male">Male</option>
                                                <option value="Female">Female</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Address KTP detail */}
                                <div className="space-y-3">
                                    <label className="text-xs font-semibold text-gray-700 flex items-center gap-2">
                                        <MapPin size={14} />
                                        {t("clients.form.addressKtpSection", "Address (KTP)")}
                                    </label>
                                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Street / Full Address</label>
                                            <input
                                                type="text"
                                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 disabled:bg-gray-100"
                                                value={ktpStreet}
                                                onChange={(e) => setKtpStreet(e.target.value)}
                                                placeholder={t("clients.form.placeholders.street", "e.g. Jl. Sam Ratulangi No. 10")}
                                                disabled={disabled}
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">RT / RW</label>
                                                <input
                                                    type="text"
                                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 disabled:bg-gray-100"
                                                    value={ktpRtRw}
                                                    onChange={(e) => setKtpRtRw(e.target.value)}
                                                    placeholder={t("clients.form.placeholders.rtRw", "e.g. 001/002")}
                                                    disabled={disabled}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Kelurahan</label>
                                                <input
                                                    type="text"
                                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 disabled:bg-gray-100"
                                                    value={ktpKelDesa}
                                                    onChange={(e) => setKtpKelDesa(e.target.value)}
                                                    disabled={disabled}
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Kecamatan</label>
                                                <input
                                                    type="text"
                                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 disabled:bg-gray-100"
                                                    value={ktpKecamatan}
                                                    onChange={(e) => setKtpKecamatan(e.target.value)}
                                                    disabled={disabled}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">City</label>
                                                <input
                                                    type="text"
                                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 disabled:bg-gray-100"
                                                    value={ktpCity}
                                                    onChange={(e) => setKtpCity(e.target.value)}
                                                    disabled={disabled}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-gray-700">{t("clients.detail.labels.domicile", "Domicile Address")}</label>
                                    <input
                                        type="text"
                                        className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 focus:border-primary-soft disabled:bg-gray-50 disabled:text-gray-500 transition-shadow"
                                        value={addressDomicile ?? ""}
                                        onChange={(e) => setAddressDomicile(e.target.value)}
                                        disabled={disabled}
                                    />
                                </div>
                            </div>
                        ) : null}

                        {/* Institution section */}
                        {type === "institution" ? (
                            <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1">
                                    {t("clients.form.institutionSection", "Institution information")}
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="md:col-span-2 space-y-1">
                                        <label className="text-xs font-semibold text-gray-700">{t("clients.detail.labels.institutionName", "Institution name")}</label>
                                        <input
                                            type="text"
                                            className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 focus:border-primary-soft disabled:bg-gray-50 disabled:text-gray-500 transition-shadow"
                                            value={institutionName}
                                            onChange={(e) => setInstitutionName(e.target.value)}
                                            disabled={disabled}
                                        />
                                    </div>

                                    <div className="md:col-span-2 space-y-1">
                                        <label className="text-xs font-semibold text-gray-700">{t("clients.detail.labels.institutionAddress", "Institution address")}</label>
                                        <input
                                            type="text"
                                            className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 focus:border-primary-soft disabled:bg-gray-50 disabled:text-gray-500 transition-shadow"
                                            value={institutionAddress}
                                            onChange={(e) => setInstitutionAddress(e.target.value)}
                                            disabled={disabled}
                                        />
                                    </div>

                                    <div className="md:col-span-2 pt-2">
                                        <div className="text-xs font-semibold text-gray-700 mb-3 inline-flex items-center gap-2">
                                            <Users size={14} />
                                            {t("clients.detail.labels.contactPerson", "Contact person")}
                                        </div>
                                        <div className="p-4 bg-indigo-50/30 rounded-xl border border-indigo-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-medium text-gray-500 uppercase">Name</label>
                                                <input
                                                    type="text"
                                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 bg-white"
                                                    value={contactPersonName}
                                                    onChange={(e) => setContactPersonName(e.target.value)}
                                                    disabled={disabled}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-medium text-gray-500 uppercase">Phone</label>
                                                <input
                                                    type="text"
                                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 bg-white"
                                                    value={contactPersonPhone}
                                                    onChange={(e) => setContactPersonPhone(e.target.value)}
                                                    disabled={disabled}
                                                />
                                            </div>
                                            <div className="md:col-span-2 space-y-1">
                                                <label className="text-[10px] font-medium text-gray-500 uppercase">Email</label>
                                                <input
                                                    type="email"
                                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 bg-white"
                                                    value={contactPersonEmail}
                                                    onChange={(e) => setContactPersonEmail(e.target.value)}
                                                    disabled={disabled}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </form>
                </div>

                {/* Footer fixed */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 shrink-0">
                    <button type="button" onClick={onClose} className="btn-outline border-gray-300 text-gray-700" disabled={submitting}>
                        {isView ? t("close", "Close") : t("cancel", "Cancel")}
                    </button>

                    {!isView && (
                        <button
                            type="button"
                            onClick={handleSubmit} // Button type button, triggers handleSubmit
                            className={cx("lims-btn-primary inline-flex items-center gap-2 shadow-sm", submitting && "opacity-70 cursor-not-allowed")}
                            disabled={submitting}
                        >
                            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {submitting
                                ? (isEdit ? t("clients.form.submitSaving", "Saving...") : t("clients.form.submitCreating", "Creating..."))
                                : (isEdit ? t("clients.form.submitEdit", "Save changes") : t("clients.form.submitCreate", "Create client"))
                            }
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};