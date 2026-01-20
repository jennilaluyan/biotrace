import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
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

export const AuthPage = ({ initialMode = "login", tenant }: AuthPageProps) => {
    const t = tenant ?? getTenant();
    const isPortal = t === "portal";

    const [mode, setMode] = useState<Mode>(initialMode);
    const [isMobile, setIsMobile] = useState(false);

    const [showLoginPassword, setShowLoginPassword] = useState(false);
    const [showRegPassword, setShowRegPassword] = useState(false);
    const [showRegPasswordConfirmation, setShowRegPasswordConfirmation] = useState(false);

    const { login } = useAuth();
    const { loginClient } = useClientAuth();
    const navigate = useNavigate();

    const headingLogin = isPortal ? "Client sign in" : "Staff sign in";
    const subtitleLogin = isPortal
        ? "Use your client account to submit and track sample requests."
        : "Use your registered staff account to access the LIMS dashboard.";

    const headingRegister = isPortal ? "Create client account" : "Create staff account";
    const subtitleRegister = isPortal
        ? "Register as a client. Your account will be verified by admin."
        : "Register as staff. Your account will be verified by Laboratory Head.";

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth <= 768);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    // LOGIN STATE
    const [loginEmail, setLoginEmail] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    const [loginError, setLoginError] = useState<string | null>(null);
    const [loginLoading, setLoginLoading] = useState(false);

    // REGISTER (shared base) STATE
    const [regName, setRegName] = useState("");
    const [regEmail, setRegEmail] = useState("");
    const [regPassword, setRegPassword] = useState("");
    const [regPasswordConfirmation, setRegPasswordConfirmation] = useState("");
    const [regError, setRegError] = useState<string | null>(null);
    const [regLoading, setRegLoading] = useState(false);
    const [regSuccess, setRegSuccess] = useState<string | null>(null);

    // REGISTER (staff only)
    const [regRoleId, setRegRoleId] = useState<number>(ROLE_ID.ANALYST);

    // REGISTER (client only)
    const [regClientType, setRegClientType] = useState<ClientType>("individual");
    const [regPhone, setRegPhone] = useState("");

    // individual fields
    const [regNationalId, setRegNationalId] = useState("");
    const [regDob, setRegDob] = useState("");
    const [regGender, setRegGender] = useState<Gender>("female");
    const [regAddressKtp, setRegAddressKtp] = useState("");
    const [regAddressDomicile, setRegAddressDomicile] = useState("");

    // institution fields
    const [regInstitutionName, setRegInstitutionName] = useState("");
    const [regInstitutionAddress, setRegInstitutionAddress] = useState("");
    const [regContactPersonName, setRegContactPersonName] = useState("");
    const [regContactPersonPhone, setRegContactPersonPhone] = useState("");
    const [regContactPersonEmail, setRegContactPersonEmail] = useState("");

    const STAFF_ROLE_OPTIONS = useMemo(
        () => [
            { id: ROLE_ID.ADMIN, label: "Administrator" },
            { id: ROLE_ID.SAMPLE_COLLECTOR, label: "Sample Collector" },
            { id: ROLE_ID.ANALYST, label: "Analyst" },
            { id: ROLE_ID.OPERATIONAL_MANAGER, label: "Operational Manager" },
        ],
        []
    );

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError(null);

        if (!loginEmail || !loginPassword) {
            setLoginError("Email and password are required.");
            return;
        }

        try {
            setLoginLoading(true);

            const currentTenant: Tenant = (tenant ?? getTenant()) as Tenant;

            if (currentTenant === "portal") {
                await loginClient(loginEmail, loginPassword);
                navigate("/portal");
                return;
            }

            await login(loginEmail, loginPassword);
            navigate("/clients");
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                "Login failed. Please check your credentials.";
            setLoginError(msg);
        } finally {
            setLoginLoading(false);
        }
    };

    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setRegError(null);
        setRegSuccess(null);

        if (!regEmail || !regPassword || !regPasswordConfirmation) {
            setRegError("Email and password are required.");
            return;
        }

        if (regPassword !== regPasswordConfirmation) {
            setRegError("Password confirmation does not match.");
            return;
        }

        try {
            setRegLoading(true);

            if (isPortal) {
                if (!regClientType) {
                    setRegError("Client type is required.");
                    return;
                }
                if (!regPhone) {
                    setRegError("Phone is required.");
                    return;
                }

                const safeName =
                    regName?.trim() ||
                    (regClientType === "institution" ? regInstitutionName?.trim() : "") ||
                    "";

                if (!safeName) {
                    setRegError("Name is required.");
                    return;
                }

                const payload: any = {
                    type: regClientType,
                    name: safeName,
                    email: regEmail,
                    phone: regPhone,
                    password: regPassword,
                    password_confirmation: regPasswordConfirmation,
                };

                if (regClientType === "individual") {
                    payload.national_id = regNationalId || null;
                    payload.date_of_birth = regDob || null;
                    payload.gender = regGender || null;
                    payload.address_ktp = regAddressKtp || null;
                    payload.address_domicile = regAddressDomicile || null;
                } else {
                    payload.institution_name = regInstitutionName || null;
                    payload.institution_address = regInstitutionAddress || null;
                    payload.contact_person_name = regContactPersonName || null;
                    payload.contact_person_phone = regContactPersonPhone || null;
                    payload.contact_person_email = regContactPersonEmail || null;
                }

                await clientRegisterRequest(payload);

                setRegSuccess("Client registration submitted. Waiting for admin verification.");
                setTimeout(() => navigate("/login"), 800);
                return;
            }

            if (!regName) {
                setRegError("Full name is required.");
                return;
            }

            await registerStaffRequest({
                name: regName,
                email: regEmail,
                password: regPassword,
                password_confirmation: regPasswordConfirmation,
                role_id: regRoleId,
            });

            setRegSuccess("Staff registration submitted. Waiting for Laboratory Head approval.");
            setTimeout(() => navigate("/login"), 800);
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                "Registration failed. Please review your data.";
            setRegError(msg);
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
                <div className="mb-3 text-xs text-red-600 bg-red-100 px-3 py-2 rounded">
                    {loginError}
                </div>
            )}

            <div className="space-y-3">
                <div>
                    <label className={labelClass}>Email</label>
                    <input
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className={inputClass}
                        placeholder="Enter your email"
                        autoComplete="email"
                    />
                </div>

                <div className="relative">
                    <label className={labelClass}>Password</label>

                    <input
                        type={showLoginPassword ? "text" : "password"}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className={inputClass + " pr-12"}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                    />

                    <button
                        type="button"
                        onClick={() => setShowLoginPassword((v) => !v)}
                        className="absolute right-3 top-[34px] text-gray-500 hover:text-gray-700"
                        aria-label={showLoginPassword ? "Hide password" : "Show password"}
                    >
                        {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>
            </div>

            <button type="submit" disabled={loginLoading} className="mt-6 self-start lims-btn-primary">
                {loginLoading ? "Signing in..." : "Sign in"}
            </button>
        </form>
    );

    const portalClientFields = (
        <div className="space-y-3">
            <div>
                <label className={labelClass}>Client type</label>
                <select
                    value={regClientType}
                    onChange={(e) => setRegClientType(e.target.value as ClientType)}
                    className={inputClass}
                >
                    <option value="individual">Individual</option>
                    <option value="institution">Institution</option>
                </select>
            </div>

            <div>
                <label className={labelClass}>
                    {regClientType === "institution" ? "Client/Institution name" : "Full name"}
                </label>
                <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className={inputClass}
                    placeholder={regClientType === "institution" ? "e.g., Stark Industries" : "Your full name"}
                />
                {regClientType === "institution" && (
                    <p className="mt-1 text-[11px] text-gray-500">
                        Tip: you can leave this blank and we will use “Institution name”.
                    </p>
                )}
            </div>

            <div>
                <label className={labelClass}>Phone</label>
                <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    className={inputClass}
                    placeholder="e.g., +62-812-xxxx-xxxx"
                />
            </div>

            {regClientType === "individual" ? (
                <>
                    <div>
                        <label className={labelClass}>National ID (optional)</label>
                        <input
                            type="text"
                            value={regNationalId}
                            onChange={(e) => setRegNationalId(e.target.value)}
                            className={inputClass}
                            placeholder="NIK / National ID"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>Date of birth (optional)</label>
                            <input
                                type="date"
                                value={regDob}
                                onChange={(e) => setRegDob(e.target.value)}
                                className={inputClass}
                            />
                        </div>

                        <div>
                            <label className={labelClass}>Gender (optional)</label>
                            <select
                                value={regGender}
                                onChange={(e) => setRegGender(e.target.value as Gender)}
                                className={inputClass}
                            >
                                <option value="female">Female</option>
                                <option value="male">Male</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Address (KTP) (optional)</label>
                        <input
                            type="text"
                            value={regAddressKtp}
                            onChange={(e) => setRegAddressKtp(e.target.value)}
                            className={inputClass}
                            placeholder="As per identity card"
                        />
                    </div>

                    <div>
                        <label className={labelClass}>Address (domicile) (optional)</label>
                        <input
                            type="text"
                            value={regAddressDomicile}
                            onChange={(e) => setRegAddressDomicile(e.target.value)}
                            className={inputClass}
                            placeholder="Current address"
                        />
                    </div>
                </>
            ) : (
                <>
                    <div>
                        <label className={labelClass}>Institution name (optional)</label>
                        <input
                            type="text"
                            value={regInstitutionName}
                            onChange={(e) => setRegInstitutionName(e.target.value)}
                            className={inputClass}
                            placeholder="Institution / company name"
                        />
                    </div>

                    <div>
                        <label className={labelClass}>Institution address (optional)</label>
                        <input
                            type="text"
                            value={regInstitutionAddress}
                            onChange={(e) => setRegInstitutionAddress(e.target.value)}
                            className={inputClass}
                            placeholder="Institution address"
                        />
                    </div>

                    <div className="pt-2">
                        <p className="text-xs font-semibold text-gray-700 mb-2">Contact person (optional)</p>

                        <div className="space-y-3">
                            <div>
                                <label className={labelClass}>Name</label>
                                <input
                                    type="text"
                                    value={regContactPersonName}
                                    onChange={(e) => setRegContactPersonName(e.target.value)}
                                    className={inputClass}
                                    placeholder="Contact person name"
                                />
                            </div>

                            <div>
                                <label className={labelClass}>Phone</label>
                                <input
                                    type="tel"
                                    value={regContactPersonPhone}
                                    onChange={(e) => setRegContactPersonPhone(e.target.value)}
                                    className={inputClass}
                                    placeholder="+62-..."
                                />
                            </div>

                            <div>
                                <label className={labelClass}>Email</label>
                                <input
                                    type="email"
                                    value={regContactPersonEmail}
                                    onChange={(e) => setRegContactPersonEmail(e.target.value)}
                                    className={inputClass}
                                    placeholder="contact@example.com"
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

            {regError && (
                <div className="mb-3 text-xs text-red-600 bg-red-100 px-3 py-2 rounded">
                    {regError}
                </div>
            )}

            {regSuccess && (
                <div className="mb-3 text-xs text-green-700 bg-green-100 px-3 py-2 rounded">
                    {regSuccess}
                </div>
            )}

            <div className="space-y-3">
                {isPortal ? (
                    <>
                        {portalClientFields}

                        <div>
                            <label className={labelClass}>Email</label>
                            <input
                                type="email"
                                value={regEmail}
                                onChange={(e) => setRegEmail(e.target.value)}
                                className={inputClass}
                                placeholder="Enter your email"
                            />
                        </div>
                    </>
                ) : (
                    <>
                        <div>
                            <label className={labelClass}>Full name</label>
                            <input
                                type="text"
                                value={regName}
                                onChange={(e) => setRegName(e.target.value)}
                                className={inputClass}
                                placeholder="Your full name"
                            />
                        </div>

                        <div>
                            <label className={labelClass}>Email</label>
                            <input
                                type="email"
                                value={regEmail}
                                onChange={(e) => setRegEmail(e.target.value)}
                                className={inputClass}
                                placeholder="Enter your email"
                            />
                        </div>

                        <div>
                            <label className={labelClass}>Role</label>
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

                            <p className="mt-1 text-[11px] text-gray-500">
                                Account will be inactive until Laboratory Head approval.
                            </p>
                        </div>
                    </>
                )}

                <div className="relative">
                    <label className={labelClass}>Password</label>

                    <input
                        type={showRegPassword ? "text" : "password"}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className={inputClass + " pr-12"}
                        placeholder="Enter your password"
                    />

                    <button
                        type="button"
                        onClick={() => setShowRegPassword((v) => !v)}
                        className="absolute right-3 top-[34px] text-gray-500 hover:text-gray-700"
                        aria-label={showRegPassword ? "Hide password" : "Show password"}
                    >
                        {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>

                <div className="relative">
                    <label className={labelClass}>Confirm password</label>

                    <input
                        type={showRegPasswordConfirmation ? "text" : "password"}
                        value={regPasswordConfirmation}
                        onChange={(e) => setRegPasswordConfirmation(e.target.value)}
                        className={inputClass + " pr-12"}
                        placeholder="Confirm your password"
                    />

                    <button
                        type="button"
                        onClick={() => setShowRegPasswordConfirmation((v) => !v)}
                        className="absolute right-3 top-[34px] text-gray-500 hover:text-gray-700"
                        aria-label={showRegPasswordConfirmation ? "Hide password" : "Show password"}
                    >
                        {showRegPasswordConfirmation ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>
            </div>

            <button type="submit" disabled={regLoading} className="mt-6 self-start lims-btn-primary">
                {regLoading ? "Creating..." : "Sign up"}
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
                            Don&apos;t have an account?{" "}
                            <button
                                type="button"
                                className="text-primary font-semibold"
                                onClick={() => navigate("/register")}
                            >
                                Register here
                            </button>
                        </p>
                    ) : (
                        <p className="mt-4 mb-2 text-xs text-center text-gray-600">
                            Already have an account?{" "}
                            <button
                                type="button"
                                className="text-primary font-semibold"
                                onClick={() => navigate("/login")}
                            >
                                Sign in here
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
                <div className="lims-auth-form-container lims-sign-up flex items-start justify-center overflow-y-auto">
                    {registerForm}
                </div>

                <div className="lims-auth-form-container lims-sign-in lims-auth-center flex items-center justify-center overflow-y-auto">
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
                            <h2 className="text-3xl font-semibold mb-3">Welcome back!</h2>
                            <p className="text-sm mb-5 max-w-xs">
                                {isPortal
                                    ? "Sign in to manage your sample requests and results."
                                    : "To keep your lab records consistent, sign in with your registered staff account."}
                            </p>
                            <button
                                type="button"
                                onClick={() => setMode("login")}
                                className="rounded-full border px-8 py-2 text-xs font-semibold tracking-[0.15em] uppercase bg-transparent text-white"
                            >
                                Sign in
                            </button>
                        </div>

                        <div className="lims-overlay-panel lims-overlay-right">
                            <h2 className="text-3xl font-semibold mb-3">
                                {isPortal ? "Request Biomolecular Tests" : "Trace Every Sample"}
                            </h2>
                            <p className="text-sm mb-5 max-w-xs">
                                {isPortal
                                    ? "Create a client account and submit sample requests in a structured ISO-aligned workflow."
                                    : "Create a new user and begin your biomolecular workflow with ISO 17025–aligned records."}
                            </p>
                            <button
                                type="button"
                                onClick={() => setMode("register")}
                                className="rounded-full border px-8 py-2 text-xs font-semibold tracking-[0.15em] uppercase bg-transparent text-white"
                            >
                                Sign up
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
