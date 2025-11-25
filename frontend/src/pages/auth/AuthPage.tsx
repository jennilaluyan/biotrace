import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { apiPost } from "../../services/api";

import LabHero from "../../assets/lab-login-hero.png";
import BiotraceLogo from "../../assets/biotrace-logo.png";

type Mode = "login" | "register";

interface AuthPageProps {
    initialMode?: Mode;
}

export const AuthPage = ({ initialMode = "login" }: AuthPageProps) => {
    const [mode, setMode] = useState<Mode>(initialMode);
    const [isMobile, setIsMobile] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();

    // Responsive detection
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

    // REGISTER STATE
    const [regName, setRegName] = useState("");
    const [regEmail, setRegEmail] = useState("");
    const [regPassword, setRegPassword] = useState("");
    const [regPasswordConfirmation, setRegPasswordConfirmation] = useState("");
    const [regError, setRegError] = useState<string | null>(null);
    const [regLoading, setRegLoading] = useState(false);
    const [regSuccess, setRegSuccess] = useState<string | null>(null);

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError(null);

        if (!loginEmail || !loginPassword) {
            setLoginError("Email and password are required.");
            return;
        }

        try {
            setLoginLoading(true);
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

        if (!regName || !regEmail || !regPassword || !regPasswordConfirmation) {
            setRegError("All fields are required.");
            return;
        }

        if (regPassword !== regPasswordConfirmation) {
            setRegError("Password confirmation does not match.");
            return;
        }

        try {
            setRegLoading(true);
            await apiPost("/auth/register", {
                name: regName,
                email: regEmail,
                password: regPassword,
                password_confirmation: regPasswordConfirmation,
            });

            setRegSuccess("Account created. You can now sign in.");
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
        "lims-auth-container bg-white rounded-3xl shadow-2xl w-full max-w-6xl min-h-[600px]";

    const inputClass =
        "w-full rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green focus:border-accent-green";
    const labelClass = "block mb-1 text-left text-sm text-gray-700";

    const loginForm = (
        <form
            onSubmit={handleLoginSubmit}
            className="flex flex-col items-stretch justify-center px-4 md:px-10 py-8 w-full max-w-md mx-auto"
        >
            <img src={BiotraceLogo} alt="Biotrace logo" className="h-9 mb-6" />
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Sign in</h1>
            <p className="text-xs text-gray-500 mb-6">
                Use your registered staff account to access the LIMS dashboard.
            </p>

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
                <div>
                    <label className={labelClass}>Password</label>
                    <input
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className={inputClass}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                    />
                </div>
            </div>

            <button
                type="submit"
                disabled={loginLoading}
                className="mt-6 inline-flex items-center justify-center rounded-full border border-primary-soft bg-primary-soft px-8 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-white disabled:opacity-60"
            >
                {loginLoading ? "Signing in..." : "Sign in"}
            </button>
        </form>
    );

    const registerForm = (
        <form
            onSubmit={handleRegisterSubmit}
            className="flex flex-col items-stretch justify-center px-4 md:px-10 py-8 w-full max-w-md mx-auto"
        >
            <img src={BiotraceLogo} alt="Biotrace logo" className="h-9 mb-6" />
            <h1 className="text-2xl font-semibold text-primary mb-2">
                Create account
            </h1>
            <p className="text-xs text-gray-500 mb-6">
                Register a new staff account to access the biomolecular LIMS.
            </p>

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
                    <label className={labelClass}>Password</label>
                    <input
                        type="password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className={inputClass}
                        placeholder="Enter your password"
                    />
                </div>
                <div>
                    <label className={labelClass}>Confirm password</label>
                    <input
                        type="password"
                        value={regPasswordConfirmation}
                        onChange={(e) => setRegPasswordConfirmation(e.target.value)}
                        className={inputClass}
                        placeholder="Confirm your password"
                    />
                </div>
            </div>

            <button
                type="submit"
                disabled={regLoading}
                className="mt-6 inline-flex items-center justify-center rounded-full border border-primary bg-primary px-8 py-2 text-xs font-semibold tracking-[0.15em] uppercase text-white disabled:opacity-60"
            >
                {regLoading ? "Creating..." : "Sign up"}
            </button>
        </form>
    );

    // Mobile: 1 page = 1 form
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

    // Desktop: double slider
    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-cream px-4 py-10">
            <div className={containerClass + (mode === "register" ? " lims-right-active" : "")}>
                {/* SIGN UP desktop */}
                <div className="lims-auth-form-container lims-sign-up flex items-center justify-center">
                    {registerForm}
                </div>

                {/* SIGN IN desktop */}
                <div className="lims-auth-form-container lims-sign-in flex items-center justify-center">
                    {loginForm}
                </div>

                {/* OVERLAY */}
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
                                To keep your lab records consistent, sign in with your registered
                                staff account.
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
                            <h2 className="text-3xl font-semibold mb-3">Trace Every Sample</h2>
                            <p className="text-sm mb-5 max-w-xs">
                                Create a new user and begin your biomolecular workflow with ISO
                                17025–aligned records.
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
