import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
    Building2,
    Mail,
    Phone,
    User,
    IdCard,
    Calendar,
    MapPin,
    Users,
    X,
    ShieldAlert,
    Loader2,
} from "lucide-react";
import type { ClientType, CreateClientPayload, Client } from "../../services/clients";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type GenderValue = "female" | "male" | "other";

function normalizeGenderValue(value?: string | null): GenderValue | "" {
    const normalized = String(value ?? "").trim().toLowerCase();

    if (!normalized) return "";
    if (["female", "fmeale", "perempuan", "wanita"].includes(normalized)) return "female";
    if (["male", "laki-laki", "laki laki", "lelaki", "pria"].includes(normalized)) return "male";
    if (["other", "lainnya", "lain-lain", "lain lain"].includes(normalized)) return "other";

    return "";
}

function isValidEmail(value: string) {
    return /^\S+@\S+\.\S+$/.test(value.trim());
}

interface ClientFormModalProps {
    open: boolean;
    mode: "create" | "edit" | "view";
    initialClient?: Client | null;
    onClose: () => void;
    onSubmit: (payload: CreateClientPayload | Partial<CreateClientPayload>) => Promise<void> | void;
}

export const ClientFormModal = ({
    open,
    mode,
    initialClient,
    onClose,
    onSubmit,
}: ClientFormModalProps) => {
    const { t } = useTranslation();

    const isEdit = mode === "edit";
    const isView = mode === "view";

    const [type, setType] = useState<ClientType>(initialClient?.type ?? "individual");
    const [name, setName] = useState(initialClient?.name ?? "");
    const [phone, setPhone] = useState(initialClient?.phone ?? "");
    const [email, setEmail] = useState(initialClient?.email ?? "");

    const [nationalId, setNationalId] = useState(initialClient?.national_id ?? "");
    const [dateOfBirth, setDateOfBirth] = useState(initialClient?.date_of_birth ?? "");
    const [gender, setGender] = useState<GenderValue | "">(normalizeGenderValue(initialClient?.gender));

    const [ktpStreet, setKtpStreet] = useState(initialClient?.address_ktp ?? "");
    const [ktpRtRw, setKtpRtRw] = useState("");
    const [ktpKelDesa, setKtpKelDesa] = useState("");
    const [ktpKecamatan, setKtpKecamatan] = useState("");
    const [ktpCity, setKtpCity] = useState("");
    const [ktpProvince, setKtpProvince] = useState("");

    const [addressDomicile, setAddressDomicile] = useState(initialClient?.address_domicile ?? "");

    const [institutionName, setInstitutionName] = useState(
        initialClient?.institution_name ?? (initialClient?.type === "institution" ? initialClient?.name ?? "" : "")
    );
    const [institutionAddress, setInstitutionAddress] = useState(initialClient?.institution_address ?? "");
    const [contactPersonName, setContactPersonName] = useState(initialClient?.contact_person_name ?? "");
    const [contactPersonPhone, setContactPersonPhone] = useState(
        initialClient?.contact_person_phone ?? (initialClient?.type === "institution" ? initialClient?.phone ?? "" : "")
    );
    const [contactPersonEmail, setContactPersonEmail] = useState(initialClient?.contact_person_email ?? "");

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;

        setType(initialClient?.type ?? "individual");
        setName(initialClient?.name ?? "");
        setPhone(initialClient?.phone ?? "");
        setEmail(initialClient?.email ?? "");

        setNationalId(initialClient?.national_id ?? "");
        setDateOfBirth(initialClient?.date_of_birth ?? "");
        setGender(normalizeGenderValue(initialClient?.gender));

        setKtpStreet(initialClient?.address_ktp ?? "");
        setKtpRtRw("");
        setKtpKelDesa("");
        setKtpKecamatan("");
        setKtpCity("");
        setKtpProvince("");

        setAddressDomicile(initialClient?.address_domicile ?? "");

        setInstitutionName(
            initialClient?.institution_name ?? (initialClient?.type === "institution" ? initialClient?.name ?? "" : "")
        );
        setInstitutionAddress(initialClient?.institution_address ?? "");
        setContactPersonName(initialClient?.contact_person_name ?? "");
        setContactPersonPhone(
            initialClient?.contact_person_phone ?? (initialClient?.type === "institution" ? initialClient?.phone ?? "" : "")
        );
        setContactPersonEmail(initialClient?.contact_person_email ?? "");

        setError(null);
        setSubmitting(false);
    }, [initialClient, mode, open]);

    useEffect(() => {
        if (!open) return;

        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };

        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, [open, onClose]);

    if (!open) return null;

    const disabled = submitting || isView;
    const modalTitle =
        mode === "create"
            ? t("clients.form.createTitle", "Create Client")
            : mode === "edit"
                ? t("clients.form.editTitle", "Edit Client")
                : t("clients.form.viewTitle", "Client Details");
    const modalHint = isView
        ? t("clients.form.viewHint", "View only mode.")
        : t("clients.form.editHint", "Fill in the data correctly.");
    const typeIcon = type === "institution" ? <Building2 size={18} /> : <User size={18} />;

    const handleNikChange = (value: string) => {
        const onlyDigits = value.replace(/\D/g, "");
        if (onlyDigits.length <= 16) {
            setNationalId(onlyDigits);
        }
    };

    const buildKtpAddress = () => {
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

        return ktpParts.length > 0 ? ktpParts.join(", ") : null;
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        e.stopPropagation();

        if (isView) {
            onClose();
            return;
        }

        setError(null);

        if (type === "individual") {
            if (!name.trim()) {
                setError(t("clients.form.validation.nameRequired", "Name is required."));
                return;
            }
        } else {
            if (!institutionName.trim()) {
                setError(
                    t("clients.form.validation.institutionNameRequired", "Institution name is required.")
                );
                return;
            }

            if (!contactPersonName.trim()) {
                setError(
                    t("clients.form.validation.contactPersonNameRequired", "Contact person name is required.")
                );
                return;
            }

            if (!contactPersonPhone.trim()) {
                setError(
                    t("clients.form.validation.contactPersonPhoneRequired", "Contact person phone is required.")
                );
                return;
            }

            if (!contactPersonEmail.trim()) {
                setError(
                    t("clients.form.validation.contactPersonEmailRequired", "Contact person email is required.")
                );
                return;
            }

            if (!isValidEmail(contactPersonEmail)) {
                setError(
                    t(
                        "clients.form.validation.contactPersonEmailInvalid",
                        "Contact person email format is invalid."
                    )
                );
                return;
            }
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

        const combinedKtpAddress = buildKtpAddress();

        const payload: CreateClientPayload = {
            type,
            name: type === "institution" ? institutionName.trim() : name.trim(),
            phone: type === "institution" ? contactPersonPhone.trim() : phone || null,
            email: email.trim(),
            national_id: type === "individual" && nationalId ? nationalId.replace(/\D/g, "") : null,
            date_of_birth: type === "individual" ? dateOfBirth || null : null,
            gender: type === "individual" ? gender || null : null,
            address_ktp: type === "individual" ? combinedKtpAddress : null,
            address_domicile: type === "individual" ? addressDomicile || null : null,
            institution_name: type === "institution" ? institutionName.trim() : null,
            institution_address: type === "institution" ? institutionAddress || null : null,
            contact_person_name: type === "institution" ? contactPersonName.trim() : null,
            contact_person_phone: type === "institution" ? contactPersonPhone.trim() : null,
            contact_person_email: type === "institution" ? contactPersonEmail.trim() : null,
        };

        try {
            setSubmitting(true);
            await onSubmit(payload);
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                t("errors.somethingWentWrong", "Something went wrong.");
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-9999 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={submitting ? undefined : onClose}
                aria-hidden="true"
            />

            <div
                className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="shrink-0 border-b border-gray-100 bg-gray-50/50 px-6 py-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-primary shadow-sm">
                                {typeIcon}
                            </span>
                            <div>
                                <h2 className="text-base font-bold text-gray-900">{modalTitle}</h2>
                                <p className="text-xs text-gray-500">{modalHint}</p>
                            </div>
                        </div>

                        <button
                            type="button"
                            className={cx(
                                "lims-icon-button text-gray-500 hover:bg-gray-200/50",
                                submitting && "cursor-not-allowed opacity-50"
                            )}
                            onClick={onClose}
                            aria-label={t("close", "Close")}
                            disabled={submitting}
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="custom-scrollbar flex-1 overflow-y-auto">
                    <form id="client-form" onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
                        {error ? (
                            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                                {error}
                            </div>
                        ) : null}

                        <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-1.5">
                            <button
                                type="button"
                                onClick={() => !isView && setType("individual")}
                                className={cx(
                                    "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200",
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
                                    "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200",
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

                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                            {type === "individual" ? (
                                <>
                                    <div className="md:col-span-2 space-y-1">
                                        <label className="text-xs font-semibold text-gray-700">
                                            {t("auth.name", "Name")} <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm transition-shadow focus:border-primary-soft focus:outline-none focus:ring-2 focus:ring-primary-soft/50 disabled:bg-gray-50 disabled:text-gray-500"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder={t(
                                                "clients.form.placeholders.nameIndividual",
                                                "Client full name"
                                            )}
                                            disabled={disabled}
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-gray-700">
                                            {t("clients.detail.labels.email", "Email")}{" "}
                                            <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                                <Mail size={16} />
                                            </span>
                                            <input
                                                type="email"
                                                className="w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3.5 text-sm transition-shadow focus:border-primary-soft focus:outline-none focus:ring-2 focus:ring-primary-soft/50 disabled:bg-gray-50 disabled:text-gray-500"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder={t("clients.form.placeholders.email", "Contact email")}
                                                disabled={disabled}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-gray-700">
                                            {t("auth.phone", "Phone")}
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                                <Phone size={16} />
                                            </span>
                                            <input
                                                type="text"
                                                className="w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3.5 text-sm transition-shadow focus:border-primary-soft focus:outline-none focus:ring-2 focus:ring-primary-soft/50 disabled:bg-gray-50 disabled:text-gray-500"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                placeholder={t("clients.form.placeholders.phone", "Phone number")}
                                                disabled={disabled}
                                            />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="md:col-span-2 space-y-1">
                                        <label className="text-xs font-semibold text-gray-700">
                                            {t("auth.institutionName", "Institution name")}{" "}
                                            <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm transition-shadow focus:border-primary-soft focus:outline-none focus:ring-2 focus:ring-primary-soft/50 disabled:bg-gray-50 disabled:text-gray-500"
                                            value={institutionName}
                                            onChange={(e) => setInstitutionName(e.target.value)}
                                            placeholder={t(
                                                "clients.form.placeholders.nameInstitution",
                                                "Institution name"
                                            )}
                                            disabled={disabled}
                                        />
                                    </div>

                                    <div className="md:col-span-2 space-y-1">
                                        <label className="text-xs font-semibold text-gray-700">
                                            {t("auth.institutionAddress", "Institution address")}
                                        </label>
                                        <input
                                            type="text"
                                            className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm transition-shadow focus:border-primary-soft focus:outline-none focus:ring-2 focus:ring-primary-soft/50 disabled:bg-gray-50 disabled:text-gray-500"
                                            value={institutionAddress}
                                            onChange={(e) => setInstitutionAddress(e.target.value)}
                                            placeholder={t(
                                                "clients.detail.labels.institutionAddress",
                                                "Institution address"
                                            )}
                                            disabled={disabled}
                                        />
                                    </div>

                                    <div className="md:col-span-2 space-y-3 pt-1">
                                        <div className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
                                            <Users size={14} />
                                            {t("auth.contactPerson", "Contact person")}
                                        </div>

                                        <div className="grid grid-cols-1 gap-4 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4 md:grid-cols-2">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-medium uppercase text-gray-500">
                                                    {t("auth.name", "Name")} <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50"
                                                    value={contactPersonName}
                                                    onChange={(e) => setContactPersonName(e.target.value)}
                                                    disabled={disabled}
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[10px] font-medium uppercase text-gray-500">
                                                    {t("auth.phone", "Phone")} <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50"
                                                    value={contactPersonPhone}
                                                    onChange={(e) => setContactPersonPhone(e.target.value)}
                                                    disabled={disabled}
                                                />
                                            </div>

                                            <div className="md:col-span-2 space-y-1">
                                                <label className="text-[10px] font-medium uppercase text-gray-500">
                                                    {t("auth.email", "Email")} <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="email"
                                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50"
                                                    value={contactPersonEmail}
                                                    onChange={(e) => setContactPersonEmail(e.target.value)}
                                                    disabled={disabled}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="md:col-span-2 space-y-1">
                                        <label className="text-xs font-semibold text-gray-700">
                                            {t("clients.detail.labels.email", "Email")}{" "}
                                            <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                                <Mail size={16} />
                                            </span>
                                            <input
                                                type="email"
                                                className="w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3.5 text-sm transition-shadow focus:border-primary-soft focus:outline-none focus:ring-2 focus:ring-primary-soft/50 disabled:bg-gray-50 disabled:text-gray-500"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder={t("clients.form.placeholders.email", "Contact email")}
                                                disabled={disabled}
                                            />
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {type === "individual" ? (
                            <div className="animate-in space-y-5 fade-in slide-in-from-top-2 duration-300">
                                <h3 className="border-b border-gray-100 pb-1 text-xs font-bold uppercase tracking-wider text-gray-400">
                                    {t("clients.form.personalSection", "Personal profile")}
                                </h3>

                                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-gray-700">
                                            {t("clients.detail.labels.nationalId", "National ID (NIK)")}
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                                <IdCard size={16} />
                                            </span>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                maxLength={16}
                                                className="w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3.5 text-sm transition-shadow focus:border-primary-soft focus:outline-none focus:ring-2 focus:ring-primary-soft/50 disabled:bg-gray-50 disabled:text-gray-500"
                                                value={nationalId}
                                                onChange={(e) => handleNikChange(e.target.value)}
                                                placeholder={t("clients.form.placeholders.nik", "16 digit number")}
                                                disabled={disabled}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-gray-700">
                                            {t("clients.detail.labels.dob", "Date of birth")}
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                                                <Calendar size={16} />
                                            </span>
                                            <input
                                                type="date"
                                                className="w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3.5 text-sm transition-shadow focus:border-primary-soft focus:outline-none focus:ring-2 focus:ring-primary-soft/50 disabled:bg-gray-50 disabled:text-gray-500"
                                                value={dateOfBirth}
                                                onChange={(e) => setDateOfBirth(e.target.value)}
                                                disabled={disabled}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-gray-700">
                                            {t("clients.detail.labels.gender", "Gender")}
                                        </label>
                                        <select
                                            className="w-full appearance-none rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm transition-shadow focus:border-primary-soft focus:outline-none focus:ring-2 focus:ring-primary-soft/50 disabled:bg-gray-50 disabled:text-gray-500"
                                            value={gender}
                                            onChange={(e) => setGender(e.target.value as GenderValue | "")}
                                            disabled={disabled}
                                        >
                                            <option value="">{t("clients.form.placeholders.gender", "Select gender")}</option>
                                            <option value="male">{t("auth.male", "Male")}</option>
                                            <option value="female">{t("auth.female", "Female")}</option>
                                            <option value="other">{t("auth.other", "Other")}</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                                        <MapPin size={14} />
                                        {t("clients.form.addressKtpSection", "Address (KTP)")}
                                    </label>

                                    <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                                                {t("auth.ktpStreet", "Street / House no.")}
                                            </label>
                                            <input
                                                type="text"
                                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 disabled:bg-gray-100"
                                                value={ktpStreet}
                                                onChange={(e) => setKtpStreet(e.target.value)}
                                                placeholder={t(
                                                    "clients.form.placeholders.street",
                                                    "e.g. Jl. Sam Ratulangi No. 10"
                                                )}
                                                disabled={disabled}
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                                                    RT / RW
                                                </label>
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
                                                <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                                                    {t("auth.ktpVillage", "Village/Subdistrict")}
                                                </label>
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
                                                <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                                                    {t("auth.ktpDistrict", "District")}
                                                </label>
                                                <input
                                                    type="text"
                                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft/50 disabled:bg-gray-100"
                                                    value={ktpKecamatan}
                                                    onChange={(e) => setKtpKecamatan(e.target.value)}
                                                    disabled={disabled}
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                                                    {t("auth.ktpCity", "City/Regency")}
                                                </label>
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
                                    <label className="text-xs font-semibold text-gray-700">
                                        {t("clients.detail.labels.domicile", "Domicile Address")}
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm transition-shadow focus:border-primary-soft focus:outline-none focus:ring-2 focus:ring-primary-soft/50 disabled:bg-gray-50 disabled:text-gray-500"
                                        value={addressDomicile}
                                        onChange={(e) => setAddressDomicile(e.target.value)}
                                        disabled={disabled}
                                    />
                                </div>
                            </div>
                        ) : null}
                    </form>
                </div>

                <div className="shrink-0 border-t border-gray-100 bg-gray-50 px-6 py-4">
                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn-outline border-gray-300 text-gray-700"
                            disabled={submitting}
                        >
                            {isView ? t("close", "Close") : t("cancel", "Cancel")}
                        </button>

                        {!isView ? (
                            <button
                                type="submit"
                                form="client-form"
                                className={cx(
                                    "lims-btn-primary inline-flex items-center gap-2 shadow-sm",
                                    submitting && "cursor-not-allowed opacity-70"
                                )}
                                disabled={submitting}
                            >
                                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                {submitting
                                    ? isEdit
                                        ? t("clients.form.submitSaving", "Saving...")
                                        : t("clients.form.submitCreating", "Creating...")
                                    : isEdit
                                        ? t("clients.form.submitEdit", "Save changes")
                                        : t("clients.form.submitCreate", "Create client")}
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
};