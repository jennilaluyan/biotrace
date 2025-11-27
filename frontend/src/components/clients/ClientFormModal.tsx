import { useState, useEffect, FormEvent } from "react";
import type { Client } from "../../services/clients";

type ClientFormValues = {
    type: "individual" | "institution";

    // Common
    name: string;
    phone: string;
    email: string;

    // Individual
    national_id: string;
    date_of_birth: string;
    gender: string;
    address_ktp: string;
    address_domicile: string;

    // Institutional
    institution_name: string;
    institution_address: string;
    contact_person_name: string;
    contact_person_phone: string;
    contact_person_email: string;
};

type Mode = "create" | "edit";

interface ClientFormModalProps {
    open: boolean;
    mode: Mode;
    initialClient?: Client | null;
    onClose: () => void;
    onSubmit: (values: ClientFormValues) => void;
}

const emptyValues: ClientFormValues = {
    type: "individual",
    name: "",
    phone: "",
    email: "",
    national_id: "",
    date_of_birth: "",
    gender: "",
    address_ktp: "",
    address_domicile: "",
    institution_name: "",
    institution_address: "",
    contact_person_name: "",
    contact_person_phone: "",
    contact_person_email: "",
};

export const ClientFormModal = ({
    open,
    mode,
    initialClient,
    onClose,
    onSubmit,
}: ClientFormModalProps) => {
    const [values, setValues] = useState<ClientFormValues>(emptyValues);

    // Reset / prefll saat modal dibuka
    useEffect(() => {
        if (!open) return;

        if (initialClient) {
            setValues({
                type: initialClient.type,
                name: initialClient.name ?? "",
                phone: initialClient.phone ?? "",
                email: initialClient.email ?? "",
                national_id: initialClient.national_id ?? "",
                date_of_birth: initialClient.date_of_birth ?? "",
                gender: initialClient.gender ?? "",
                address_ktp: initialClient.address_ktp ?? "",
                address_domicile: initialClient.address_domicile ?? "",
                institution_name: initialClient.institution_name ?? "",
                institution_address: initialClient.institution_address ?? "",
                contact_person_name: initialClient.contact_person_name ?? "",
                contact_person_phone: initialClient.contact_person_phone ?? "",
                contact_person_email: initialClient.contact_person_email ?? "",
            });
        } else {
            setValues(emptyValues);
        }
    }, [open, initialClient]);

    if (!open) return null;

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        const { name, value } = e.target;
        setValues((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        onSubmit(values);
    };

    const title = mode === "create" ? "New client" : "Edit client";
    const isInstitution = values.type === "institution";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                    <button
                        type="button"
                        className="text-gray-500 text-xl leading-none"
                        onClick={onClose}
                    >
                        ×
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
                    {/* Type + common identity */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-700 uppercase tracking-[0.15em]">
                                Client type
                            </label>
                            <select
                                name="type"
                                value={values.type}
                                onChange={handleChange}
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            >
                                <option value="individual">Individual</option>
                                <option value="institution">Institution</option>
                            </select>
                        </div>

                        <div className="md:col-span-2 space-y-1">
                            <label className="text-xs font-medium text-gray-700 uppercase tracking-[0.15em]">
                                Name
                            </label>
                            <input
                                name="name"
                                value={values.name}
                                onChange={handleChange}
                                placeholder={
                                    isInstitution ? "Main contact / client name" : "Full name"
                                }
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    {/* Contact */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-700 uppercase tracking-[0.15em]">
                                Email
                            </label>
                            <input
                                type="email"
                                name="email"
                                value={values.email}
                                onChange={handleChange}
                                placeholder="Contact email"
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-700 uppercase tracking-[0.15em]">
                                Phone
                            </label>
                            <input
                                name="phone"
                                value={values.phone}
                                onChange={handleChange}
                                placeholder="Contact phone"
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    {/* Individual section */}
                    {values.type === "individual" && (
                        <div className="space-y-3">
                            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em]">
                                Individual details
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-700 uppercase tracking-[0.15em]">
                                        National ID (NIK)
                                    </label>
                                    <input
                                        name="national_id"
                                        value={values.national_id}
                                        onChange={handleChange}
                                        placeholder="e.g. 1234..."
                                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-700 uppercase tracking-[0.15em]">
                                        Date of birth
                                    </label>
                                    <input
                                        type="date"
                                        name="date_of_birth"
                                        value={values.date_of_birth}
                                        onChange={handleChange}
                                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-700 uppercase tracking-[0.15em]">
                                        Gender
                                    </label>
                                    <select
                                        name="gender"
                                        value={values.gender}
                                        onChange={handleChange}
                                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    >
                                        <option value="">Select</option>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-700 uppercase tracking-[0.15em]">
                                        Address (KTP)
                                    </label>
                                    <input
                                        name="address_ktp"
                                        value={values.address_ktp}
                                        onChange={handleChange}
                                        placeholder="KTP address"
                                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-700 uppercase tracking-[0.15em]">
                                        Address (domicile)
                                    </label>
                                    <input
                                        name="address_domicile"
                                        value={values.address_domicile}
                                        onChange={handleChange}
                                        placeholder="Current address"
                                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Institution section */}
                    {values.type === "institution" && (
                        <div className="space-y-3">
                            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em]">
                                Institution details
                            </h3>

                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-700 uppercase tracking-[0.15em]">
                                    Institution name
                                </label>
                                <input
                                    name="institution_name"
                                    value={values.institution_name}
                                    onChange={handleChange}
                                    placeholder="Hospital / university / company name"
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-700 uppercase tracking-[0.15em]">
                                    Institution address
                                </label>
                                <input
                                    name="institution_address"
                                    value={values.institution_address}
                                    onChange={handleChange}
                                    placeholder="Institution address"
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2 space-y-1">
                                    <label className="text-xs font-medium text-gray-700 uppercase tracking-[0.15em]">
                                        PIC name
                                    </label>
                                    <input
                                        name="contact_person_name"
                                        value={values.contact_person_name}
                                        onChange={handleChange}
                                        placeholder="Person in charge / sample sender"
                                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-gray-700 uppercase tracking-[0.15em]">
                                        PIC phone
                                    </label>
                                    <input
                                        name="contact_person_phone"
                                        value={values.contact_person_phone}
                                        onChange={handleChange}
                                        placeholder="PIC phone"
                                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-700 uppercase tracking-[0.15em]">
                                    PIC email
                                </label>
                                <input
                                    type="email"
                                    name="contact_person_email"
                                    value={values.contact_person_email}
                                    onChange={handleChange}
                                    placeholder="PIC email"
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            className="rounded-full border border-gray-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-gray-700"
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="lims-btn-primary"
                        >
                            {mode === "create" ? "Save client" : "Save changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
