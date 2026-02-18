import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
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

interface AuthPageProps {
    initialMode?: Mode;
    tenant?: Tenant;
}

/** -------------------------
 * Helpers (A1–A4)
 * ------------------------*/
function digitsOnly(s: string) {
    return (s ?? "").replace(/\D+/g, "");
}

// A2: NIK display format: 3232 - 3232 - 3232 - 3232
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

// A3: Phone display format: +62 812 5555 1234
function formatPhoneDisplayPlus62(input: string) {
    let d = digitsOnly(input);

    // normalize common inputs
    if (d.startsWith("0")) d = "62" + d.slice(1);
    if (!d.startsWith("62")) d = "62" + d;

    // local digits after +62
    const local = d.slice(2).slice(0, 13); // max 13 digits after +62

    // group local digits as 3-4-4-rest (example: 812 5555 1234)
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
    // if somehow not, treat as local digits
    return "+62" + d;
}

function isValidPhonePlus62(displayPhone: string) {
    const d = digitsOnly(displayPhone);
    const local = d.startsWith("62") ? d.slice(2) : d;
    return local.length >= 10 && local.length <= 13;
}

// A4: Extract clear message from backend (Laravel-ish):
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
        if (typeof (data as any).error === "string" && (data as any).error.trim())
            return (data as any).error;
    }

    if (typeof err?.message === "string" && err.message.trim()) return err.message;

    return fallback;
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
    const clientAuth = useClientAuth() as any;

    const navigate = useNavigate();
    const location = useLocation();
    const redirectAfterStaffLogin = (location.state as any)?.from?.pathname || "/samples";
    const redirectAfterClientLogin = (location.state as any)?.from?.pathname || "/portal";

    // A1: scroll container refs (desktop has its own scroll container)
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
    const [regAddressKtp, setRegAddressKtp] = useState("");
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
            { id: ROLE_ID.OPERATIONAL_MANAGER, label: t("roles.operationalManager") }
        ],
        // re-render options when locale changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [i18n.resolvedLanguage, i18n.language]
    );

    // A1: scroll correct container to top so alert is visible (success or error)
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
        setRegAddressKtp("");
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

    // ✅ FIXED: portal login should NOT call staff login afterwards.
    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError(null);

        // A1: always show message at top
        scrollLoginToTop();

        if (!loginEmail || !loginPassword) {
            setLoginError(t("auth.requiredEmailPassword"));
            setLoginPassword(""); // privacy
            return;
        }

        try {
            setLoginLoading(true);

            const currentTenant = (tenantResolved ?? getTenant()) as Tenant;

            if (currentTenant === "portal") {
                // ✅ Client login only
                await clientAuth.loginClient(loginEmail, loginPassword);
                navigate(redirectAfterClientLogin, { replace: true });
                return;
            }

            await login(loginEmail, loginPassword);
            navigate(redirectAfterStaffLogin, { replace: true });
        } catch (err: any) {
            const msg = extractApiMessage(err, t("auth.loginFailedFallback"));
            setLoginError(msg);
            setLoginPassword(""); // privacy
            scrollLoginToTop();
        } finally {
            setLoginLoading(false);
        }
    };

    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setRegError(null);
        setRegSuccess(null);

        // A1: always show message at top
        scrollRegisterToTop();

        if (!regEmail || !regPassword || !regPasswordConfirmation) {
            setRegError(t("auth.requiredEmailPassword"));
            clearRegisterPasswordsOnly(); // privacy on error
            return;
        }

        if (regPassword !== regPasswordConfirmation) {
            setRegError(t("auth.passwordMismatch"));
            clearRegisterPasswordsOnly();
            return;
        }

        try {
            setRegLoading(true);

            if (isPortal) {
                if (!regClientType) {
                    setRegError(t("auth.clientTypeRequired"));
                    clearRegisterPasswordsOnly();
                    return;
                }

                const safeName =
                    regName?.trim() ||
                    (regClientType === "institution" ? regInstitutionName?.trim() : "") ||
                    "";

                if (!safeName) {
                    setRegError(t("auth.nameRequired"));
                    clearRegisterPasswordsOnly();
                    return;
                }

                // A3: validate phone display and send as E.164
                const displayPhone = formatPhoneDisplayPlus62(regPhone);
                if (!isValidPhonePlus62(displayPhone)) {
                    setRegError(t("auth.phoneIncomplete"));
                    clearRegisterPasswordsOnly();
                    scrollRegisterToTop();
                    return;
                }
                const normalizedPhone = phoneE164Plus62(displayPhone);

                // A2: NIK required for individual, exactly 16 digits
                if (regClientType === "individual") {
                    if (!isValidNIK(regNationalId)) {
                        setRegError(t("auth.nikInvalid"));
                        clearRegisterPasswordsOnly();
                        scrollRegisterToTop();
                        return;
                    }
                }

                const payload: any = {
                    type: regClientType,
                    name: safeName,
                    email: regEmail,
                    phone: normalizedPhone,
                    password: regPassword,
                    password_confirmation: regPasswordConfirmation
                };

                if (regClientType === "individual") {
                    payload.national_id = nikDigits(regNationalId);
                    payload.date_of_birth = regDob || null;
                    payload.gender = regGender || null;
                    payload.address_ktp = regAddressKtp || null;
                    payload.address_domicile = regAddressDomicile || null;
                } else {
                    payload.institution_name = regInstitutionName || null;
                    payload.institution_address = regInstitutionAddress || null;
                    payload.contact_person_name = regContactPersonName || null;

                    // contact person phone: send E.164 if filled beyond +62
                    const cpDisplay = formatPhoneDisplayPlus62(regContactPersonPhone);
                    const cpDigits = digitsOnly(cpDisplay);
                    payload.contact_person_phone = cpDigits.length > 2 ? phoneE164Plus62(cpDisplay) : null;

                    payload.contact_person_email = regContactPersonEmail || null;
                }

                await clientRegisterRequest(payload);

                // A1: success should be visible without manual scroll
                setRegSuccess(t("auth.clientRegSubmitted"));
                scrollRegisterToTop();

                // A1 privacy rule: success => clear all register fields
                clearRegisterAllFields();

                setTimeout(() => navigate("/login"), 800);
                return;
            }

            if (!regName) {
                setRegError(t("auth.staffNameRequired"));
                clearRegisterPasswordsOnly();
                return;
            }

            await registerStaffRequest({
                name: regName,
                email: regEmail,
                password: regPassword,
                password_confirmation: regPasswordConfirmation,
                role_id: regRoleId
            });

            setRegSuccess(t("auth.staffRegSubmitted"));
            scrollRegisterToTop();
            clearRegisterAllFields();

            setTimeout(() => navigate("/login"), 800);
        } catch (err: any) {
            const msg = extractApiMessage(err, t("auth.registrationFailedFallback"));
            setRegError(msg);

            // A1 privacy rule: error => clear passwords only
            clearRegisterPasswordsOnly();
            scrollRegisterToTop();
        } finally {
            setRegLoading(false);
        }
    };

    const containerClass =
        "lims-auth-container bg-white rounded-3xl shadow-2xl w-full max-w-6xl min-h-[600px] max-h-[calc(100vh-80px)] overflow-hidden";

    const inputClass =
        "w-full rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green focus:border-accent-green";
    const labelClass = "block mb-1 text-left text-sm text-gray-700";
    const formBaseClass =
        "flex flex-col items-stretch justify-center w-full max-w-md mx-auto px-4 md:px-10 py-10";

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
                <label className={labelClass}>{t("auth.clientType")}</label>
                <select
                    value={regClientType}
                    onChange={(e) => setRegClientType(e.target.value as ClientType)}
                    className={inputClass}
                >
                    <option value="individual">{t("auth.individual")}</option>
                    <option value="institution">{t("auth.institution")}</option>
                </select>
            </div>

            <div>
                <label className={labelClass}>
                    {regClientType === "institution" ? t("auth.clientOrInstitutionName") : t("auth.fullName")}
                </label>
                <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className={inputClass}
                    placeholder={regClientType === "institution" ? t("auth.institutionExample") : t("auth.yourFullName")}
                />
                {regClientType === "institution" && (
                    <p className="mt-1 text-[11px] text-gray-500">{t("auth.tipInstitutionFallback")}</p>
                )}
            </div>

            <div>
                <label className={labelClass}>{t("auth.phone")}</label>
                <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(formatPhoneDisplayPlus62(e.target.value))}
                    onBlur={() => setRegPhone((v) => formatPhoneDisplayPlus62(v))}
                    className={inputClass}
                    placeholder={t("auth.phoneExample")}
                    inputMode="tel"
                />
            </div>

            {regClientType === "individual" ? (
                <>
                    <div>
                        <label className={labelClass}>{t("auth.nationalId")}</label>
                        <input
                            type="text"
                            value={regNationalId}
                            onChange={(e) => setRegNationalId(formatNIK(e.target.value))}
                            className={inputClass}
                            placeholder={t("auth.nikExample")}
                            inputMode="numeric"
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

                    <div>
                        <label className={labelClass}>{t("auth.addressKtpOptional")}</label>
                        <input
                            type="text"
                            value={regAddressKtp}
                            onChange={(e) => setRegAddressKtp(e.target.value)}
                            className={inputClass}
                            placeholder={t("auth.asPerIdentityCard")}
                        />
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
                        <label className={labelClass}>{t("auth.institutionName")}</label>
                        <input
                            type="text"
                            value={regInstitutionName}
                            onChange={(e) => setRegInstitutionName(e.target.value)}
                            className={inputClass}
                            placeholder={t("auth.institutionCompanyName")}
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
                            <label className={labelClass}>{t("auth.email")}</label>
                            <input
                                type="email"
                                value={regEmail}
                                onChange={(e) => setRegEmail(e.target.value)}
                                className={inputClass}
                                placeholder={t("auth.enterEmail")}
                            />
                        </div>
                    </>
                ) : (
                    <>
                        <div>
                            <label className={labelClass}>{t("auth.fullName")}</label>
                            <input
                                type="text"
                                value={regName}
                                onChange={(e) => setRegName(e.target.value)}
                                className={inputClass}
                                placeholder={t("auth.yourFullName")}
                                autoComplete="name"
                            />
                        </div>

                        <div>
                            <label className={labelClass}>{t("auth.email")}</label>
                            <input
                                type="email"
                                value={regEmail}
                                onChange={(e) => setRegEmail(e.target.value)}
                                className={inputClass}
                                placeholder={t("auth.enterEmail")}
                                autoComplete="email"
                            />
                        </div>

                        <div>
                            <label className={labelClass}>{t("auth.role")}</label>
                            <select
                                value={regRoleId}
                                onChange={(e) => setRegRoleId(Number(e.target.value))}
                                className={inputClass}
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
                    <label className={labelClass}>{t("auth.password")}</label>
                    <input
                        type={showRegPassword ? "text" : "password"}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className={inputClass + " pr-12"}
                        placeholder={t("auth.enterPassword")}
                    />

                    <button
                        type="button"
                        onClick={() => setShowRegPassword((v) => !v)}
                        className="absolute right-3 top-[34px] text-gray-500 hover:text-gray-700"
                        aria-label={showRegPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                    >
                        {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>

                <div className="relative">
                    <label className={labelClass}>{t("auth.confirmPassword")}</label>
                    <input
                        type={showRegPasswordConfirmation ? "text" : "password"}
                        value={regPasswordConfirmation}
                        onChange={(e) => setRegPasswordConfirmation(e.target.value)}
                        className={inputClass + " pr-12"}
                        placeholder={t("auth.confirmYourPassword")}
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
                            backgroundPosition: "center"
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
