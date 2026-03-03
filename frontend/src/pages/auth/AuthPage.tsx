import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../hooks/useAuth";
import { useClientAuth } from "../../hooks/useClientAuth";
import { getTenant } from "../../utils/tenant";
import { ROLE_ID } from "../../utils/roles";

import { registerStaffRequest, clientRegisterRequest } from "../../services/auth";

import LabHero from "../../assets/lab-login-hero.png";
import BiotraceLogo from "../../assets/biotrace-logo.png";

type Mode = "login" | "register";
type Tenant = "portal" | "backoffice";
type ClientType = "individual" | "institution";
type Gender = "male" | "female" | "other";

type AddressKtp = {
    street: string;
    rt: string;
    rw: string;
    village: string;
    district: string;
    city: string;
    province: string;
    postalCode: string;
};

interface AuthPageProps {
    initialMode?: Mode;
    tenant?: Tenant;
}

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function digitsOnly(s: string) {
    return String(s ?? "").replace(/\D+/g, "");
}

function formatNIK(input: string) {
    const d = digitsOnly(input).slice(0, 16);
    const groups = d.match(/.{1,4}/g) ?? [];
    return groups.join(" - ");
}

function nikDigits(input: string) {
    return digitsOnly(input).slice(0, 16);
}

function isValidNIK(input: string) {
    return nikDigits(input).length === 16;
}

const PHONE_LOCAL_MIN = 9;
const PHONE_LOCAL_MAX = 13;

function normalizePhoneDigitsTo62(input: string) {
    let d = digitsOnly(input);
    if (!d) return "62";
    if (d.startsWith("0")) d = "62" + d.slice(1);
    if (!d.startsWith("62")) d = "62" + d;
    return d;
}

function formatPhoneDisplayPlus62(input: string) {
    const d = normalizePhoneDigitsTo62(input);
    const local = d.slice(2).slice(0, PHONE_LOCAL_MAX);

    const g1 = local.slice(0, 3);
    const g2 = local.slice(3, 7);
    const g3 = local.slice(7, 11);
    const g4 = local.slice(11);

    const parts = [g1, g2, g3, g4].filter(Boolean);
    return "+62" + (parts.length ? " " + parts.join(" ") : "");
}

function phoneE164Plus62(displayPhone: string) {
    const d = digitsOnly(displayPhone);
    if (d.startsWith("62")) return "+62" + d.slice(2);
    return "+62" + d;
}

function getLocalPhoneDigits(displayPhone: string) {
    const d = digitsOnly(displayPhone);
    return d.startsWith("62") ? d.slice(2) : d;
}

function isValidPhonePlus62(displayPhone: string) {
    const local = getLocalPhoneDigits(displayPhone);
    return local.length >= PHONE_LOCAL_MIN && local.length <= PHONE_LOCAL_MAX;
}

function isValidEmailFormat(email: string) {
    const s = String(email ?? "").trim();
    if (!s) return false;
    // Simple & practical email format check (client-side)
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])[\S]{8,64}$/;

function isValidPassword(pw: string) {
    return PASSWORD_REGEX.test(String(pw ?? ""));
}

// Laravel-ish:
// - { message, errors: {field: [msg]} }
function extractApiMessage(err: any, fallback: string) {
    const data = err?.response?.data ?? err?.data;

    if (data && typeof data === "object") {
        if (data.errors && typeof data.errors === "object") {
            const keys = Object.keys(data.errors);
            for (const k of keys) {
                const v = (data.errors as any)[k];
                if (Array.isArray(v) && v.length > 0) return String(v[0]);
                if (typeof v === "string") return v;
            }
        }

        if (typeof data.message === "string" && data.message.trim()) return data.message;
        if (typeof (data as any).error === "string" && (data as any).error.trim()) return (data as any).error;
    }

    if (typeof err?.message === "string" && err.message.trim()) return err.message;

    return fallback;
}

function buildKtpAddress(a: AddressKtp) {
    const street = a.street.trim();
    const rt = a.rt.trim();
    const rw = a.rw.trim();
    const village = a.village.trim();
    const district = a.district.trim();
    const city = a.city.trim();
    const province = a.province.trim();
    const postalCode = a.postalCode.trim();

    // Consistent string for backend (still 1 field), but captured in detailed UI
    return `${street}, RT ${rt}/RW ${rw}, Kel. ${village}, Kec. ${district}, ${city}, ${province} ${postalCode}`.trim();
}

function isKtpAddressComplete(a: AddressKtp) {
    return (
        a.street.trim() &&
        a.rt.trim() &&
        a.rw.trim() &&
        a.village.trim() &&
        a.district.trim() &&
        a.city.trim() &&
        a.province.trim() &&
        a.postalCode.trim()
    );
}

export const AuthPage = ({ initialMode = "login", tenant }: AuthPageProps) => {
    const { t, i18n } = useTranslation();

    const tenantResolved = tenant ?? getTenant();
    const isPortal = tenantResolved === "portal";

    const [mode, setMode] = useState<Mode>(initialMode);
    const [isMobile, setIsMobile] = useState(false);

    const [showLoginPassword, setShowLoginPassword] = useState(false);
    const [showRegPassword, setShowRegPassword] = useState(false);
    const [showRegPasswordConfirmation, setShowRegPasswordConfirmation] = useState(false);

    const { login } = useAuth();
    const clientAuth = useClientAuth();

    const navigate = useNavigate();
    const staffLandingAfterLogin = "/dashboard";
    const clientLandingAfterLogin = "/portal";

    const signUpContainerRef = useRef<HTMLDivElement | null>(null);
    const signInContainerRef = useRef<HTMLDivElement | null>(null);

    const headingLogin = isPortal ? t("auth.clientSignInTitle") : t("auth.staffSignInTitle");
    const subtitleLogin = isPortal ? t("auth.clientSignInSubtitle") : t("auth.staffSignInSubtitle");

    const headingRegister = isPortal ? t("auth.clientSignUpTitle") : t("auth.staffSignUpTitle");
    const subtitleRegister = isPortal ? t("auth.clientSignUpSubtitle") : t("auth.staffSignUpSubtitle");

    useEffect(() => {
        setMode(initialMode);
    }, [initialMode]);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth <= 768);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    const [loginEmail, setLoginEmail] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [loginError, setLoginError] = useState<string | null>(null);
    const [loginLoading, setLoginLoading] = useState(false);

    const [regName, setRegName] = useState("");
    const [regEmail, setRegEmail] = useState("");
    const [regPassword, setRegPassword] = useState("");
    const [regPasswordConfirmation, setRegPasswordConfirmation] = useState("");
    const [regError, setRegError] = useState<string | null>(null);
    const [regLoading, setRegLoading] = useState(false);
    const [regSuccess, setRegSuccess] = useState<string | null>(null);

    const [regRoleId, setRegRoleId] = useState<number>(ROLE_ID.ANALYST);

    const [regClientType, setRegClientType] = useState<ClientType>("individual");
    const [regPhone, setRegPhone] = useState("+62");

    const [regNationalId, setRegNationalId] = useState("");
    const [regDob, setRegDob] = useState("");
    const [regGender, setRegGender] = useState<Gender>("female");

    const [ktpAddress, setKtpAddress] = useState<AddressKtp>({
        street: "",
        rt: "",
        rw: "",
        village: "",
        district: "",
        city: "",
        province: "",
        postalCode: "",
    });

    const [regAddressDomicile, setRegAddressDomicile] = useState("");

    const [regInstitutionName, setRegInstitutionName] = useState("");
    const [regInstitutionAddress, setRegInstitutionAddress] = useState("");
    const [regContactPersonName, setRegContactPersonName] = useState("");
    const [regContactPersonPhone, setRegContactPersonPhone] = useState("+62");
    const [regContactPersonEmail, setRegContactPersonEmail] = useState("");

    const STAFF_ROLE_OPTIONS = useMemo(
        () => [
            { id: ROLE_ID.ADMIN, label: t("roles.administrator") },
            { id: ROLE_ID.SAMPLE_COLLECTOR, label: t("roles.sampleCollector") },
            { id: ROLE_ID.ANALYST, label: t("roles.analyst") },
            { id: ROLE_ID.OPERATIONAL_MANAGER, label: t("roles.operationalManager") },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [i18n.resolvedLanguage, i18n.language]
    );

    const scrollRegisterToTop = () => {
        if (isMobile) {
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }
        signUpContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    };

    const scrollLoginToTop = () => {
        if (isMobile) {
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }
        signInContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    };

    const clearRegisterAllFields = () => {
        setRegName("");
        setRegEmail("");
        setRegPassword("");
        setRegPasswordConfirmation("");
        setRegError(null);

        setRegClientType("individual");
        setRegPhone("+62");

        setRegNationalId("");
        setRegDob("");
        setRegGender("female");

        setKtpAddress({
            street: "",
            rt: "",
            rw: "",
            village: "",
            district: "",
            city: "",
            province: "",
            postalCode: "",
        });

        setRegAddressDomicile("");

        setRegInstitutionName("");
        setRegInstitutionAddress("");
        setRegContactPersonName("");
        setRegContactPersonPhone("+62");
        setRegContactPersonEmail("");
    };

    const clearRegisterPasswordsOnly = () => {
        setRegPassword("");
        setRegPasswordConfirmation("");
    };

    const labelClass = "block mb-1 text-left text-sm text-gray-700";
    const requiredStar = <span className="ml-1 text-red-600">*</span>;

    const Label = ({ text, required }: { text: string; required?: boolean }) => (
        <label className={labelClass}>
            {text}
            {required ? requiredStar : null}
        </label>
    );

    const getFriendlyAuthError = (err: any, kind: "login" | "register") => {
        const status = err?.response?.status ?? err?.status;
        const data = err?.response?.data ?? err?.data ?? {};
        const raw = String(data?.message ?? extractApiMessage(err, "") ?? "").toLowerCase();

        if (status === 0 || raw.includes("network error")) {
            return t("auth.networkError", { defaultValue: "Koneksi bermasalah. Coba lagi." });
        }

        if (kind === "login") {
            if (!isValidEmailFormat(loginEmail)) {
                return t("auth.invalidEmailFormat", { defaultValue: "Format email salah." });
            }

            // Kalau backend ngasih petunjuk, kita manfaatkan.
            if (status === 401 || status === 403 || status === 404) {
                if (raw.includes("password")) {
                    return t("auth.wrongPassword", { defaultValue: "Password salah." });
                }
                if (raw.includes("not found") || raw.includes("no user") || raw.includes("unknown") || raw.includes("akun")) {
                    return t("auth.accountNotFound", { defaultValue: "Akun tidak ditemukan. Periksa email kamu." });
                }
                if (raw.includes("email")) {
                    return t("auth.accountNotFound", { defaultValue: "Akun tidak ditemukan. Periksa email kamu." });
                }

                // fallback aman
                return t("auth.invalidCredentials", { defaultValue: "Email atau password salah." });
            }
        }

        // Register
        if (kind === "register") {
            if (status === 409) {
                return t("auth.emailAlreadyUsed", { defaultValue: "Email sudah terdaftar. Coba login atau pakai email lain." });
            }

            // Laravel validation biasanya 422 + errors
            if (status === 422 && data?.errors && typeof data.errors === "object") {
                const emailErr = (data.errors as any)?.email;
                if (Array.isArray(emailErr) && emailErr.length) {
                    const e = String(emailErr[0]).toLowerCase();
                    if (e.includes("taken") || e.includes("exists") || e.includes("sudah")) {
                        return t("auth.emailAlreadyUsed", {
                            defaultValue: "Email sudah terdaftar. Coba login atau pakai email lain.",
                        });
                    }
                    return String(emailErr[0]);
                }

                const passErr = (data.errors as any)?.password;
                if (Array.isArray(passErr) && passErr.length) return String(passErr[0]);

                const firstKey = Object.keys(data.errors)[0];
                const firstVal = (data.errors as any)[firstKey];
                if (Array.isArray(firstVal) && firstVal.length) return String(firstVal[0]);
            }
        }

        return extractApiMessage(
            err,
            kind === "login"
                ? t("auth.loginFailedFallback", { defaultValue: "Gagal login. Coba lagi." })
                : t("auth.registrationFailedFallback", { defaultValue: "Gagal register. Coba lagi." })
        );
    };

    const inputClass =
        "w-full rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green focus:border-accent-green";
    const formBaseClass = "flex flex-col items-stretch justify-center w-full max-w-md mx-auto px-4 md:px-10 py-10";

    const validateRegisterCommon = () => {
        if (!isValidEmailFormat(regEmail)) {
            setRegError(t("auth.invalidEmailFormat", { defaultValue: "Format email salah." }));
            return false;
        }

        if (!isValidPassword(regPassword)) {
            setRegError(
                t("auth.passwordRuleError", {
                    defaultValue: "Password lemah. Minimal 8 karakter, ada huruf besar, huruf kecil, angka, dan simbol.",
                })
            );
            return false;
        }

        if (regPassword !== regPasswordConfirmation) {
            setRegError(t("auth.passwordMismatch"));
            return false;
        }

        return true;
    };

    const handleLoginSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoginError(null);
        scrollLoginToTop();

        if (!loginEmail || !loginPassword) {
            setLoginError(t("auth.requiredEmailPassword"));
            setLoginPassword("");
            return;
        }

        if (!isValidEmailFormat(loginEmail)) {
            setLoginError(t("auth.invalidEmailFormat", { defaultValue: "Format email salah." }));
            setLoginPassword("");
            return;
        }

        try {
            setLoginLoading(true);

            const currentTenant = (tenantResolved ?? getTenant()) as Tenant;

            if (currentTenant === "portal") {
                await clientAuth.loginClient(loginEmail, loginPassword);
                navigate(clientLandingAfterLogin, { replace: true });
                return;
            }

            await login(loginEmail, loginPassword);
            navigate(staffLandingAfterLogin, { replace: true });
        } catch (err: any) {
            setLoginError(getFriendlyAuthError(err, "login"));
            setLoginPassword("");
            scrollLoginToTop();
        } finally {
            setLoginLoading(false);
        }
    };

    const handleRegisterSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setRegError(null);
        setRegSuccess(null);
        scrollRegisterToTop();

        if (!regEmail || !regPassword || !regPasswordConfirmation) {
            setRegError(t("auth.requiredEmailPassword"));
            clearRegisterPasswordsOnly();
            return;
        }

        if (!validateRegisterCommon()) {
            clearRegisterPasswordsOnly();
            scrollRegisterToTop();
            return;
        }

        try {
            setRegLoading(true);

            if (isPortal) {
                const safeName =
                    regName?.trim() || (regClientType === "institution" ? regInstitutionName?.trim() : "") || "";

                if (!regClientType) {
                    setRegError(t("auth.clientTypeRequired"));
                    clearRegisterPasswordsOnly();
                    return;
                }

                if (!safeName) {
                    setRegError(t("auth.nameRequired"));
                    clearRegisterPasswordsOnly();
                    return;
                }

                const displayPhone = formatPhoneDisplayPlus62(regPhone);
                if (!isValidPhonePlus62(displayPhone)) {
                    setRegError(
                        t("auth.phoneDigitsRange", {
                            defaultValue: `Nomor telepon harus ${PHONE_LOCAL_MIN}-${PHONE_LOCAL_MAX} digit (tanpa +62).`,
                        })
                    );
                    clearRegisterPasswordsOnly();
                    scrollRegisterToTop();
                    return;
                }
                const normalizedPhone = phoneE164Plus62(displayPhone);

                const payload: any = {
                    type: regClientType,
                    name: safeName,
                    email: regEmail.trim(),
                    phone: normalizedPhone,
                    password: regPassword,
                    password_confirmation: regPasswordConfirmation,
                };

                if (regClientType === "individual") {
                    if (!isValidNIK(regNationalId)) {
                        setRegError(t("auth.nikInvalid"));
                        clearRegisterPasswordsOnly();
                        scrollRegisterToTop();
                        return;
                    }

                    if (!isKtpAddressComplete(ktpAddress)) {
                        setRegError(
                            t("auth.ktpAddressRequired", {
                                defaultValue: "Alamat KTP wajib diisi lengkap (jalan, RT/RW, kelurahan, kecamatan, kota, provinsi, kode pos).",
                            })
                        );
                        clearRegisterPasswordsOnly();
                        scrollRegisterToTop();
                        return;
                    }

                    payload.national_id = nikDigits(regNationalId);
                    payload.date_of_birth = regDob || null;
                    payload.gender = regGender || null;
                    payload.address_ktp = buildKtpAddress(ktpAddress);
                    payload.address_domicile = regAddressDomicile?.trim() || null;
                } else {
                    // Institution: buat lebih tegas: nama institusi wajib
                    const instName = regInstitutionName.trim();
                    if (!instName) {
                        setRegError(
                            t("auth.institutionNameRequired", { defaultValue: "Nama institusi wajib diisi." })
                        );
                        clearRegisterPasswordsOnly();
                        scrollRegisterToTop();
                        return;
                    }

                    payload.institution_name = instName;
                    payload.institution_address = regInstitutionAddress?.trim() || null;
                    payload.contact_person_name = regContactPersonName?.trim() || null;

                    const cpDisplay = formatPhoneDisplayPlus62(regContactPersonPhone);
                    const cpLocal = getLocalPhoneDigits(cpDisplay);

                    if (cpLocal.length > 0 && !isValidPhonePlus62(cpDisplay)) {
                        setRegError(
                            t("auth.contactPhoneDigitsRange", {
                                defaultValue: `Nomor telepon PIC harus ${PHONE_LOCAL_MIN}-${PHONE_LOCAL_MAX} digit (tanpa +62).`,
                            })
                        );
                        clearRegisterPasswordsOnly();
                        scrollRegisterToTop();
                        return;
                    }

                    payload.contact_person_phone = cpLocal.length ? phoneE164Plus62(cpDisplay) : null;
                    payload.contact_person_email = regContactPersonEmail?.trim() || null;
                }

                await clientRegisterRequest(payload);

                setRegSuccess(t("auth.clientRegSubmitted"));
                scrollRegisterToTop();
                clearRegisterAllFields();
                setTimeout(() => navigate("/login"), 800);
                return;
            }

            // Staff
            if (!regName.trim()) {
                setRegError(t("auth.staffNameRequired"));
                clearRegisterPasswordsOnly();
                return;
            }

            await registerStaffRequest({
                name: regName.trim(),
                email: regEmail.trim(),
                password: regPassword,
                password_confirmation: regPasswordConfirmation,
                role_id: regRoleId,
            });

            setRegSuccess(t("auth.staffRegSubmitted"));
            scrollRegisterToTop();
            clearRegisterAllFields();
            setTimeout(() => navigate("/login"), 800);
        } catch (err: any) {
            setRegError(getFriendlyAuthError(err, "register"));
            clearRegisterPasswordsOnly();
            scrollRegisterToTop();
        } finally {
            setRegLoading(false);
        }
    };

    const containerClass =
        "lims-auth-container bg-white rounded-3xl shadow-2xl w-full max-w-6xl min-h-[600px] max-h-[calc(100vh-80px)] overflow-hidden";

    const passwordHint = t("auth.passwordRuleHint", {
        defaultValue: "Min 8 karakter, ada huruf besar, huruf kecil, angka, dan simbol.",
    });

    const loginForm = (
        <form onSubmit={handleLoginSubmit} className={formBaseClass}>
            <img src={BiotraceLogo} alt="Biotrace logo" className="w-20 mb-6" />

            <h1 className="text-2xl font-semibold text-primary mb-2">{headingLogin}</h1>
            <p className="text-xs text-gray-500 mb-6">{subtitleLogin}</p>

            {loginError && (
                <div className="mb-3 text-xs text-red-600 bg-red-100 px-3 py-2 rounded">{loginError}</div>
            )}

            <div className="space-y-3">
                <div>
                    <label className={labelClass}>{t("auth.email")}</label>
                    <input
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className={inputClass}
                        placeholder={t("auth.enterEmail")}
                        autoComplete="email"
                    />
                </div>

                <div className="relative">
                    <label className={labelClass}>{t("auth.password")}</label>
                    <input
                        type={showLoginPassword ? "text" : "password"}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className={inputClass + " pr-12"}
                        placeholder={t("auth.enterPassword")}
                        autoComplete="current-password"
                    />

                    <button
                        type="button"
                        onClick={() => setShowLoginPassword((v) => !v)}
                        className="absolute right-3 top-[34px] text-gray-500 hover:text-gray-700"
                        aria-label={showLoginPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                    >
                        {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>
            </div>

            <button type="submit" disabled={loginLoading} className="mt-6 self-start lims-btn-primary">
                {loginLoading ? t("auth.signingIn") : t("auth.signIn")}
            </button>
        </form>
    );

    const portalClientFields = (
        <div className="space-y-3">
            <div>
                <Label text={t("auth.clientType")} required />
                <select
                    value={regClientType}
                    onChange={(e) => setRegClientType(e.target.value as ClientType)}
                    className={inputClass}
                    required
                >
                    <option value="individual">{t("auth.individual")}</option>
                    <option value="institution">{t("auth.institution")}</option>
                </select>
            </div>

            <div>
                <Label
                    text={
                        regClientType === "institution" ? t("auth.clientOrInstitutionName") : t("auth.fullName")
                    }
                    required
                />
                <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className={inputClass}
                    placeholder={regClientType === "institution" ? t("auth.institutionExample") : t("auth.yourFullName")}
                    required
                />
                {regClientType === "institution" && (
                    <p className="mt-1 text-[11px] text-gray-500">{t("auth.tipInstitutionFallback")}</p>
                )}
            </div>

            <div>
                <Label text={t("auth.phone")} required />
                <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(formatPhoneDisplayPlus62(e.target.value))}
                    onBlur={() => setRegPhone((v) => formatPhoneDisplayPlus62(v))}
                    className={inputClass}
                    placeholder={t("auth.phoneExample")}
                    inputMode="tel"
                    required
                />
                <p className="mt-1 text-[11px] text-gray-500">
                    {t("auth.phoneDigitsHint", {
                        defaultValue: `Wajib ${PHONE_LOCAL_MIN}-${PHONE_LOCAL_MAX} digit (contoh: +62 812 3456 789).`,
                    })}
                </p>
            </div>

            {regClientType === "individual" ? (
                <>
                    <div>
                        <Label text={t("auth.nationalId")} required />
                        <input
                            type="text"
                            value={regNationalId}
                            onChange={(e) => setRegNationalId(formatNIK(e.target.value))}
                            className={inputClass}
                            placeholder={t("auth.nikExample")}
                            inputMode="numeric"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>{t("auth.dobOptional")}</label>
                            <input
                                type="date"
                                value={regDob}
                                onChange={(e) => setRegDob(e.target.value)}
                                className={inputClass}
                            />
                        </div>

                        <div>
                            <label className={labelClass}>{t("auth.genderOptional")}</label>
                            <select
                                value={regGender}
                                onChange={(e) => setRegGender(e.target.value as Gender)}
                                className={inputClass}
                            >
                                <option value="female">{t("auth.female")}</option>
                                <option value="male">{t("auth.male")}</option>
                                <option value="other">{t("auth.other")}</option>
                            </select>
                        </div>
                    </div>

                    <div className="pt-2">
                        <p className="text-xs font-semibold text-gray-700 mb-2">
                            {t("auth.addressKtp")} {requiredStar}
                        </p>

                        <div className="space-y-3">
                            <div>
                                <Label text={t("auth.ktpStreet", { defaultValue: "Jalan / No. Rumah" })} required />
                                <input
                                    type="text"
                                    value={ktpAddress.street}
                                    onChange={(e) => setKtpAddress((a) => ({ ...a, street: e.target.value }))}
                                    className={inputClass}
                                    placeholder={t("auth.ktpStreetPlaceholder", { defaultValue: "Contoh: Jl. Sam Ratulangi No.60" })}
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <Label text={t("auth.ktpRt", { defaultValue: "RT" })} required />
                                    <input
                                        type="text"
                                        value={ktpAddress.rt}
                                        onChange={(e) => setKtpAddress((a) => ({ ...a, rt: digitsOnly(e.target.value).slice(0, 3) }))}
                                        className={inputClass}
                                        placeholder="001"
                                        inputMode="numeric"
                                        required
                                    />
                                </div>
                                <div>
                                    <Label text={t("auth.ktpRw", { defaultValue: "RW" })} required />
                                    <input
                                        type="text"
                                        value={ktpAddress.rw}
                                        onChange={(e) => setKtpAddress((a) => ({ ...a, rw: digitsOnly(e.target.value).slice(0, 3) }))}
                                        className={inputClass}
                                        placeholder="002"
                                        inputMode="numeric"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <Label text={t("auth.ktpVillage", { defaultValue: "Kelurahan/Desa" })} required />
                                    <input
                                        type="text"
                                        value={ktpAddress.village}
                                        onChange={(e) => setKtpAddress((a) => ({ ...a, village: e.target.value }))}
                                        className={inputClass}
                                        placeholder={t("auth.ktpVillagePlaceholder", { defaultValue: "Contoh: Lawangirung" })}
                                        required
                                    />
                                </div>
                                <div>
                                    <Label text={t("auth.ktpDistrict", { defaultValue: "Kecamatan" })} required />
                                    <input
                                        type="text"
                                        value={ktpAddress.district}
                                        onChange={(e) => setKtpAddress((a) => ({ ...a, district: e.target.value }))}
                                        className={inputClass}
                                        placeholder={t("auth.ktpDistrictPlaceholder", { defaultValue: "Contoh: Talawaan" })}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <Label text={t("auth.ktpCity", { defaultValue: "Kota/Kabupaten" })} required />
                                    <input
                                        type="text"
                                        value={ktpAddress.city}
                                        onChange={(e) => setKtpAddress((a) => ({ ...a, city: e.target.value }))}
                                        className={inputClass}
                                        placeholder={t("auth.ktpCityPlaceholder", { defaultValue: "Contoh: Manado" })}
                                        required
                                    />
                                </div>
                                <div>
                                    <Label text={t("auth.ktpProvince", { defaultValue: "Provinsi" })} required />
                                    <input
                                        type="text"
                                        value={ktpAddress.province}
                                        onChange={(e) => setKtpAddress((a) => ({ ...a, province: e.target.value }))}
                                        className={inputClass}
                                        placeholder={t("auth.ktpProvincePlaceholder", { defaultValue: "Contoh: Sulawesi Utara" })}
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <Label text={t("auth.ktpPostalCode", { defaultValue: "Kode Pos" })} required />
                                <input
                                    type="text"
                                    value={ktpAddress.postalCode}
                                    onChange={(e) => setKtpAddress((a) => ({ ...a, postalCode: digitsOnly(e.target.value).slice(0, 5) }))}
                                    className={inputClass}
                                    placeholder="95111"
                                    inputMode="numeric"
                                    required
                                />
                            </div>

                            <p className="text-[11px] text-gray-500">
                                {t("auth.ktpAddressNote", { defaultValue: "Alamat KTP wajib lengkap untuk keperluan administrasi & verifikasi." })}
                            </p>
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>{t("auth.addressDomicileOptional")}</label>
                        <input
                            type="text"
                            value={regAddressDomicile}
                            onChange={(e) => setRegAddressDomicile(e.target.value)}
                            className={inputClass}
                            placeholder={t("auth.currentAddress")}
                        />
                    </div>
                </>
            ) : (
                <>
                    <div>
                        <Label text={t("auth.institutionName")} required />
                        <input
                            type="text"
                            value={regInstitutionName}
                            onChange={(e) => setRegInstitutionName(e.target.value)}
                            className={inputClass}
                            placeholder={t("auth.institutionCompanyName")}
                            required
                        />
                    </div>

                    <div>
                        <label className={labelClass}>{t("auth.institutionAddressOptional")}</label>
                        <input
                            type="text"
                            value={regInstitutionAddress}
                            onChange={(e) => setRegInstitutionAddress(e.target.value)}
                            className={inputClass}
                            placeholder={t("auth.institutionAddressPlaceholder")}
                        />
                    </div>

                    <div className="pt-2">
                        <p className="text-xs font-semibold text-gray-700 mb-2">{t("auth.contactPersonOptional")}</p>

                        <div className="space-y-3">
                            <div>
                                <label className={labelClass}>{t("auth.name")}</label>
                                <input
                                    type="text"
                                    value={regContactPersonName}
                                    onChange={(e) => setRegContactPersonName(e.target.value)}
                                    className={inputClass}
                                    placeholder={t("auth.contactPersonNamePlaceholder")}
                                />
                            </div>

                            <div>
                                <label className={labelClass}>{t("auth.phone")}</label>
                                <input
                                    type="tel"
                                    value={regContactPersonPhone}
                                    onChange={(e) => setRegContactPersonPhone(formatPhoneDisplayPlus62(e.target.value))}
                                    onBlur={() => setRegContactPersonPhone((v) => formatPhoneDisplayPlus62(v))}
                                    className={inputClass}
                                    placeholder={t("auth.phoneExample")}
                                    inputMode="tel"
                                />
                                <p className="mt-1 text-[11px] text-gray-500">
                                    {t("auth.phoneDigitsHint", {
                                        defaultValue: `Jika diisi, wajib ${PHONE_LOCAL_MIN}-${PHONE_LOCAL_MAX} digit.`,
                                    })}
                                </p>
                            </div>

                            <div>
                                <label className={labelClass}>{t("auth.email")}</label>
                                <input
                                    type="email"
                                    value={regContactPersonEmail}
                                    onChange={(e) => setRegContactPersonEmail(e.target.value)}
                                    className={inputClass}
                                    placeholder={t("auth.enterEmail")}
                                />
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );

    const registerForm = (
        <form onSubmit={handleRegisterSubmit} className={formBaseClass}>
            <img src={BiotraceLogo} alt="Biotrace logo" className="w-20 mb-4 mt-2" />

            <h1 className="text-2xl font-semibold text-primary mb-2">{headingRegister}</h1>
            <p className="text-xs text-gray-500 mb-6">{subtitleRegister}</p>

            {regError && <div className="mb-3 text-xs text-red-600 bg-red-100 px-3 py-2 rounded">{regError}</div>}

            {regSuccess && (
                <div className="mb-3 text-xs text-green-700 bg-green-100 px-3 py-2 rounded">{regSuccess}</div>
            )}

            <div className="space-y-3">
                {isPortal ? (
                    <>
                        {portalClientFields}

                        <div>
                            <Label text={t("auth.email")} required />
                            <input
                                type="email"
                                value={regEmail}
                                onChange={(e) => setRegEmail(e.target.value)}
                                className={inputClass}
                                placeholder={t("auth.enterEmail")}
                                required
                            />
                        </div>
                    </>
                ) : (
                    <>
                        <div>
                            <Label text={t("auth.fullName")} required />
                            <input
                                type="text"
                                value={regName}
                                onChange={(e) => setRegName(e.target.value)}
                                className={inputClass}
                                placeholder={t("auth.yourFullName")}
                                autoComplete="name"
                                required
                            />
                        </div>

                        <div>
                            <Label text={t("auth.email")} required />
                            <input
                                type="email"
                                value={regEmail}
                                onChange={(e) => setRegEmail(e.target.value)}
                                className={inputClass}
                                placeholder={t("auth.enterEmail")}
                                autoComplete="email"
                                required
                            />
                        </div>

                        <div>
                            <Label text={t("auth.role")} required />
                            <select
                                value={regRoleId}
                                onChange={(e) => setRegRoleId(Number(e.target.value))}
                                className={inputClass}
                                required
                            >
                                {STAFF_ROLE_OPTIONS.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.label}
                                    </option>
                                ))}
                            </select>

                            <p className="mt-1 text-[11px] text-gray-500">{t("auth.staffApprovalNote")}</p>
                        </div>
                    </>
                )}

                <div className="relative">
                    <Label text={t("auth.password")} required />
                    <input
                        type={showRegPassword ? "text" : "password"}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className={inputClass + " pr-12"}
                        placeholder={t("auth.enterPassword")}
                        required
                    />

                    <button
                        type="button"
                        onClick={() => setShowRegPassword((v) => !v)}
                        className="absolute right-3 top-[34px] text-gray-500 hover:text-gray-700"
                        aria-label={showRegPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                    >
                        {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>

                    <p className="mt-1 text-[11px] text-gray-500">{passwordHint}</p>
                </div>

                <div className="relative">
                    <Label text={t("auth.confirmPassword")} required />
                    <input
                        type={showRegPasswordConfirmation ? "text" : "password"}
                        value={regPasswordConfirmation}
                        onChange={(e) => setRegPasswordConfirmation(e.target.value)}
                        className={inputClass + " pr-12"}
                        placeholder={t("auth.confirmYourPassword")}
                        required
                    />

                    <button
                        type="button"
                        onClick={() => setShowRegPasswordConfirmation((v) => !v)}
                        className="absolute right-3 top-[34px] text-gray-500 hover:text-gray-700"
                        aria-label={showRegPasswordConfirmation ? t("auth.hidePassword") : t("auth.showPassword")}
                    >
                        {showRegPasswordConfirmation ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>
            </div>

            <button type="submit" disabled={regLoading} className="mt-6 self-start lims-btn-primary">
                {regLoading ? t("auth.creating") : t("auth.signUp")}
            </button>

            <p className="mt-3 text-[11px] text-gray-500">
                {t("auth.requiredFieldsNote", { defaultValue: "Kolom bertanda * wajib diisi." })}
            </p>
        </form>
    );

    if (isMobile) {
        const isLoginPage = initialMode === "login";

        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-cream px-4 py-10">
                <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl py-6">
                    {isLoginPage ? loginForm : registerForm}

                    {isLoginPage ? (
                        <p className="mt-4 mb-2 text-xs text-center text-gray-600">
                            {t("auth.dontHaveAccount")}{" "}
                            <button
                                type="button"
                                className="text-primary font-semibold"
                                onClick={() => navigate("/register")}
                            >
                                {t("auth.registerHere")}
                            </button>
                        </p>
                    ) : (
                        <p className="mt-4 mb-2 text-xs text-center text-gray-600">
                            {t("auth.alreadyHaveAccount")}{" "}
                            <button
                                type="button"
                                className="text-primary font-semibold"
                                onClick={() => navigate("/login")}
                            >
                                {t("auth.signInHere")}
                            </button>
                        </p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-cream px-4 py-10">
            <div className={containerClass + (mode === "register" ? " lims-right-active" : "")}>
                <div
                    ref={signUpContainerRef}
                    className="lims-auth-form-container lims-sign-up flex items-start justify-center overflow-y-auto"
                >
                    {registerForm}
                </div>

                <div
                    ref={signInContainerRef}
                    className="lims-auth-form-container lims-sign-in lims-auth-center flex items-center justify-center overflow-y-auto"
                >
                    {loginForm}
                </div>

                <div className="lims-overlay-container">
                    <div
                        className="lims-overlay"
                        style={{
                            backgroundImage: `linear-gradient(to right, rgba(194,16,16,0.9), rgba(230,72,72,0.7)), url(${LabHero})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                        }}
                    >
                        <div className="lims-overlay-panel lims-overlay-left">
                            <h2 className="text-3xl font-semibold mb-3">{t("auth.welcomeBack")}</h2>
                            <p className="text-sm mb-5 max-w-xs">
                                {isPortal ? t("auth.welcomeBackPortal") : t("auth.welcomeBackStaff")}
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    setMode("login");
                                    setTimeout(() => scrollLoginToTop(), 0);
                                }}
                                className="rounded-full border px-8 py-2 text-xs font-semibold tracking-[0.15em] uppercase bg-transparent text-white"
                            >
                                {t("auth.signIn")}
                            </button>
                        </div>

                        <div className="lims-overlay-panel lims-overlay-right">
                            <h2 className="text-3xl font-semibold mb-3">
                                {isPortal ? t("auth.rightPanelPortalTitle") : t("auth.rightPanelStaffTitle")}
                            </h2>
                            <p className="text-sm mb-5 max-w-xs">
                                {isPortal ? t("auth.rightPanelPortalSubtitle") : t("auth.rightPanelStaffSubtitle")}
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    setMode("register");
                                    setTimeout(() => scrollRegisterToTop(), 0);
                                }}
                                className="rounded-full border px-8 py-2 text-xs font-semibold tracking-[0.15em] uppercase bg-transparent text-white"
                            >
                                {t("auth.signUp")}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};